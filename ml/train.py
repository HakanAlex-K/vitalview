"""Reproducible training with an overlap-purged, within-recording holdout."""

import argparse
import hashlib
import json
import platform
from pathlib import Path
import numpy as np
import pandas as pd
import sklearn
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from threadpoolctl import threadpool_limits
from pipeline import COLUMNS, FEATURE_VERSION, features


def split_windows(x, y):
    if len(x) == 0 or len(x) != len(y):
        raise ValueError("Supply nonempty windows with one label per window.")
    # A run continues only if both channels share all 299 consecutive values.
    adjacent = (x[:-1, 1:300] == x[1:, :299]).all(1) & (x[:-1, 301:] == x[1:, 300:599]).all(1)
    if (adjacent & (y[:-1] != y[1:])).any():
        raise ValueError(
            "Labels change inside an overlapping recording. Supply recording IDs and an explicit held-out dataset."
        )
    cuts = np.r_[0, np.flatnonzero(~adjacent | (y[:-1] != y[1:])) + 1, len(x)]
    train, test, purged, runs = [], [], [], []
    for start, end in zip(cuts[:-1], cuts[1:]):
        usable = end - start - 299
        if usable < 20:
            raise ValueError(
                "Insufficient contiguous data for a purged holdout. Supply recording IDs and a separate test dataset."
            )
        n = int(usable * 0.7)
        train.extend(range(start, start + n))
        purged.extend(range(start + n, start + n + 299))
        test.extend(range(start + n + 299, end))
        runs.append(
            {
                "start": int(start),
                "end": int(end),
                "label": float(y[start]),
                "train": n,
                "purged": 299,
                "test": int(usable - n),
            }
        )
    return np.array(train), np.array(test), np.array(purged), runs, int(adjacent.sum())


def metrics(y, p):
    return {
        "mae": float(mean_absolute_error(y, p)),
        "rmse": float(np.sqrt(mean_squared_error(y, p))),
        "r2": float(r2_score(y, p)) if np.ptp(y) > 0 else None,
        "bias": float(np.mean(p - y)),
    }


def train(path, output, epochs=400):
    if not isinstance(epochs, int) or epochs < 1:
        raise ValueError("Epoch budget must be a positive integer.")
    output.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(path)
    if list(df.columns) != COLUMNS + ["glucose_mg_dl"]:
        raise ValueError(
            "CSV must contain ir_0..ir_299, red_0..red_299, glucose_mg_dl in that order."
        )
    x, y = df[COLUMNS].to_numpy(float), df.glucose_mg_dl.to_numpy(float)
    if not np.isfinite(x).all() or not np.isfinite(y).all() or (x < 0).any() or (x > 262143).any():
        raise ValueError("Invalid data; expected finite labels and 18-bit optical samples.")
    a, b, purged, runs, overlap = split_windows(x, y)
    f = features(x)
    xs, ys = StandardScaler().fit(f[a]), StandardScaler().fit(y[a, None])
    tx, ty = xs.transform(f[a]), ys.transform(y[a, None]).ravel()
    # Fixed budget: test set is not used for early stopping or parameter selection.
    net = MLPRegressor(
        hidden_layer_sizes=(64, 32),
        activation="relu",
        solver="adam",
        alpha=0.05,
        batch_size=64,
        learning_rate_init=0.001,
        random_state=42,
        shuffle=True,
    )
    losses = []
    with threadpool_limits(limits=1):
        for epoch in range(epochs):
            net.partial_fit(tx, ty)
            losses.append(float(net.loss_))
        pred = ys.inverse_transform(net.predict(xs.transform(f[b]))[:, None]).ravel()
        ridge = Ridge(alpha=10).fit(tx, y[a]).predict(xs.transform(f[b]))
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    lo, hi = np.quantile(f[a], [0.01, 0.99], axis=0)
    margin = np.maximum((hi - lo) * 0.3, 1)
    model = {
        "model_id": "vitalview-mlp-" + digest[:10],
        "feature_version": FEATURE_VERSION,
        "x_mean": xs.mean_.tolist(),
        "x_scale": xs.scale_.tolist(),
        "y_mean": float(ys.mean_[0]),
        "y_scale": float(ys.scale_[0]),
        "weights": [w.tolist() for w in net.coefs_],
        "biases": [v.tolist() for v in net.intercepts_],
        "feature_low": (lo - margin).tolist(),
        "feature_high": (hi + margin).tolist(),
        "target_range": [float(y[a].min()), float(y[a].max())],
        "research_only": True,
    }
    # Identify the learned parameters as well as the dataset. Epoch or software
    # changes must not silently reuse an earlier model's identity.
    model_digest = hashlib.sha256(
        json.dumps(model, sort_keys=True, allow_nan=False).encode()
    ).hexdigest()
    model["model_id"] = "vitalview-mlp-" + model_digest[:12]
    report = {
        "model_id": model["model_id"],
        "dataset_sha256": digest,
        "rows": len(y),
        "features": 600,
        "engineered_features": f.shape[1],
        "labels": {str(k): int(v) for k, v in df.glucose_mg_dl.value_counts().sort_index().items()},
        "adjacent_overlapping_pairs": overlap,
        "train_rows": len(a),
        "test_rows": len(b),
        "purged_rows": len(purged),
        "split": "Within each contiguous recording: first 70% of usable windows for training, 299-window purge, remaining windows for test.",
        "runs": runs,
        "seed": 42,
        "epochs": epochs,
        "architecture": [f.shape[1], 64, 32, 1],
        "evaluation": {
            "neural_network": metrics(y[b], pred),
            "ridge": metrics(y[b], ridge),
            "training_median": metrics(y[b], np.full(len(b), np.median(y[a]))),
        },
        "per_label": {str(t): metrics(y[b][y[b] == t], pred[y[b] == t]) for t in np.unique(y[b])},
        "training_loss": losses,
        "experiment": json.loads(
            (Path(__file__).resolve().parents[1] / "docs/experiment.json").read_text(
                encoding="utf-8"
            )
        ),
        "limitations": [
            "Glucose solutions with xanthan gum in Petri dishes; concentration units and preparation details remain unconfirmed.",
            "Six label levels, including 0 and 900; these must not be interpreted as validated human glucose measurements.",
            "Holdout windows are purged but come from the same recordings as training. Generalization to independently prepared dishes/sessions is untested.",
            "No clinical validation, no calibrated uncertainty, and no controlled comparison to the original Keras model.",
            "Input-quality and out-of-distribution checks are engineering heuristics, not validated clinical safeguards.",
        ],
        "runtime": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "pandas": pd.__version__,
            "scikit_learn": sklearn.__version__,
        },
    }
    (output / "model.json").write_text(json.dumps(model, allow_nan=False), encoding="utf-8")
    (output / "metrics.json").write_text(
        json.dumps(report, indent=2, allow_nan=False), encoding="utf-8"
    )
    (output / "split.json").write_text(
        json.dumps({"train": a.tolist(), "test": b.tolist(), "purged": purged.tolist()}),
        encoding="utf-8",
    )
    pd.DataFrame({"reference": y[b], "predicted": pred, "row": b}).to_csv(
        output / "holdout_predictions.csv", index=False
    )
    # Assert portable model math matches sklearn exactly; no pickle needed at inference.
    z = xs.transform(f[b[:10]])
    for i, (w, bi) in enumerate(zip(net.coefs_, net.intercepts_)):
        z = z @ w + bi
        if i < len(net.coefs_) - 1:
            z = np.maximum(z, 0)
    np.testing.assert_allclose(
        z.ravel(), net.predict(xs.transform(f[b[:10]])), rtol=1e-10, atol=1e-10
    )
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(1, 2, figsize=(11, 4))
    ax[0].plot(losses, color="#ee672b")
    ax[0].set(
        title=f"Training objective · fixed {epochs}-epoch budget",
        xlabel="Epoch",
        ylabel="Standardized loss",
    )
    ax[0].set_yscale("log")
    ax[1].scatter(y[b], pred, s=7, alpha=0.35, color="#176f65")
    ax[1].plot(model["target_range"], model["target_range"], "--", color="#777")
    ax[1].set(
        title="Purged within-recording holdout",
        xlabel="Dataset reference label",
        ylabel="Model output",
    )
    fig.suptitle("Experimental benchmark · not clinical accuracy")
    fig.tight_layout()
    fig.savefig(output / "evaluation.png", dpi=160)
    print(
        json.dumps(
            {
                k: report[k]
                for k in [
                    "rows",
                    "train_rows",
                    "test_rows",
                    "purged_rows",
                    "adjacent_overlapping_pairs",
                    "evaluation",
                ]
            },
            indent=2,
        )
    )
    return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data", type=Path)
    ap.add_argument("--output", type=Path, default=Path("artifacts"))
    ap.add_argument("--epochs", type=int, default=400)
    args = ap.parse_args()
    train(args.data, args.output, args.epochs)
