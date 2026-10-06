"""Shared signal contract, feature extraction and portable neural-network inference."""

import json
from pathlib import Path
import numpy as np

SAMPLES = 300
COLUMNS = [f"ir_{i}" for i in range(SAMPLES)] + [f"red_{i}" for i in range(SAMPLES)]
FEATURE_VERSION = "optical-summary-v1"
FEATURE_COUNT = 23


class ModelError(RuntimeError):
    """Unavailable or incompatible model, rather than an invalid capture."""


def validate_samples(samples):
    # Inspect values before NumPy can silently coerce mixed booleans to numbers.
    raw = np.asarray(samples, dtype=object)
    if any(isinstance(v, (bool, np.bool_)) for v in raw.flat):
        raise ValueError("Samples must be numeric, not strings or booleans.")
    a = np.asarray(samples)
    if a.shape != (SAMPLES, 2):
        raise ValueError("Expected exactly 300 rows of [infrared, red] samples.")
    if a.dtype.kind not in "iuf":
        raise ValueError("Samples must be numeric, not strings or booleans.")
    a = a.astype(float)
    if not np.isfinite(a).all() or (a < 0).any() or (a > 262143).any():
        raise ValueError("Samples must be finite ADC counts from 0 to 262143.")
    return a


def features(windows):
    """Input: N x 600 (all IR, then all red). Stable across train and serve."""
    x = np.asarray(windows, dtype=float)
    if x.ndim != 2 or x.shape[1] != 600 or not np.isfinite(x).all():
        raise ValueError("Expected a finite N x 600 feature matrix.")
    out = []
    for a in (x[:, :300], x[:, 300:]):
        q = np.quantile(a, [0.05, 0.25, 0.5, 0.75, 0.95], axis=1)
        out.extend(
            [
                a.mean(1),
                a.std(1),
                *q,
                q[4] - q[0],
                np.mean(np.abs(np.diff(a, axis=1)), axis=1),
                a[:, -30:].mean(1) - a[:, :30].mean(1),
            ]
        )
    ir, red = x[:, :300], x[:, 300:]
    out.extend(
        [
            ir.mean(1) / np.maximum(red.mean(1), 1),
            ir.std(1) / np.maximum(ir.mean(1), 1),
            red.std(1) / np.maximum(red.mean(1), 1),
        ]
    )
    return np.array(out).T


def quality(samples):
    a = validate_samples(samples)
    reasons = []
    med = np.median(a, axis=0)
    spread = np.quantile(a, 0.95, axis=0) - np.quantile(a, 0.05, axis=0)
    # Engineering heuristics only, not validated physiological criteria.
    if (med < 1000).any():
        reasons.append("Low optical signal / check sample positioning")
    if (spread < 10).any():
        reasons.append("Flat optical signal")
    if (a >= 262140).mean() > 0.01:
        reasons.append("ADC saturation")
    return {
        "accepted": not reasons,
        "reasons": reasons,
        "median_ir": float(med[0]),
        "median_red": float(med[1]),
        "robust_range_ir": float(spread[0]),
        "robust_range_red": float(spread[1]),
    }


def load_model(model_path):
    """Validate the portable feature/scaling and layer contracts before use."""
    try:
        m = json.loads(Path(model_path).read_text(encoding="utf-8"))
        if m.get("feature_version") != FEATURE_VERSION:
            raise ValueError("Model feature contract mismatch. Retrain using this pipeline.")
        for key in ("x_mean", "x_scale", "feature_low", "feature_high"):
            a = np.asarray(m[key], dtype=float)
            if a.shape != (FEATURE_COUNT,) or not np.isfinite(a).all():
                raise ValueError(f"Invalid model {key}.")
        if (np.asarray(m["x_scale"]) <= 0).any():
            raise ValueError("Model input scales must be positive.")
        if (np.asarray(m["feature_low"]) > np.asarray(m["feature_high"])).any():
            raise ValueError("Invalid model feature envelope.")
        if not np.isfinite([m["y_mean"], m["y_scale"]]).all() or m["y_scale"] <= 0:
            raise ValueError("Invalid model target scaling.")
        bounds = np.asarray(m["target_range"], dtype=float)
        if bounds.shape != (2,) or not np.isfinite(bounds).all() or bounds[0] > bounds[1]:
            raise ValueError("Invalid model target range.")
        if not isinstance(m["model_id"], str) or not m["model_id"]:
            raise ValueError("Missing model identity.")
        if not m["weights"] or len(m["weights"]) != len(m["biases"]):
            raise ValueError("Model layer counts differ.")
        width = FEATURE_COUNT
        for weights, biases in zip(m["weights"], m["biases"]):
            w, b = np.asarray(weights, dtype=float), np.asarray(biases, dtype=float)
            if (
                w.ndim != 2
                or w.shape[0] != width
                or w.shape[1] == 0
                or b.shape != (w.shape[1],)
                or not np.isfinite(w).all()
                or not np.isfinite(b).all()
            ):
                raise ValueError("Invalid model layer dimensions or values.")
            width = w.shape[1]
        if width != 1:
            raise ValueError("Model must have one output.")
        return m
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
        raise ModelError("Model unavailable or incompatible. Check the artifact or retrain.") from e


def predict(samples, model_path):
    a = validate_samples(samples)
    q = quality(a)
    if not q["accepted"]:
        return {"status": "rejected", "estimate": None, "quality": q, "research_only": True}
    m = load_model(model_path)
    f = features(np.r_[a[:, 0], a[:, 1]][None, :])
    low, high = np.array(m["feature_low"]), np.array(m["feature_high"])
    outside = int(((f[0] < low) | (f[0] > high)).sum())
    if outside > 3:
        return {
            "status": "out_of_distribution",
            "estimate": None,
            "quality": q,
            "reason": "Signal differs from the training feature envelope.",
            "outside_features": outside,
            "model_id": m["model_id"],
            "research_only": True,
        }
    z = (f - np.array(m["x_mean"])) / np.array(m["x_scale"])
    for i, (w, b) in enumerate(zip(m["weights"], m["biases"])):
        z = z @ np.array(w) + np.array(b)
        if i < len(m["weights"]) - 1:
            z = np.maximum(z, 0)
    value = float(z[0, 0] * m["y_scale"] + m["y_mean"])
    if not np.isfinite(value) or not m["target_range"][0] <= value <= m["target_range"][1]:
        return {
            "status": "out_of_range",
            "estimate": None,
            "quality": q,
            "reason": "Model output falls outside its training label range.",
            "model_id": m["model_id"],
            "research_only": True,
        }
    return {
        "status": "estimated",
        "estimate": round(value, 1),
        "unit": "dataset-label units",
        "quality": q,
        "model_id": m["model_id"],
        "research_only": True,
    }
