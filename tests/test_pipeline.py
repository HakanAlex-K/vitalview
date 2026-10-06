import json
import sys
import tempfile
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml"))
from pipeline import (
    FEATURE_VERSION,
    ModelError,
    load_model,
    validate_samples,
    quality,
    features,
    predict,
)
from train import split_windows


class PipelineTests(unittest.TestCase):
    def test_input_contract_rejects_bad_values(self):
        for bad in [
            np.ones((299, 2)),
            np.full((300, 2), np.nan),
            np.full((300, 2), -1),
            np.full((300, 2), 300000),
            np.full((300, 2), "123"),
            np.ones((300, 2), dtype=bool),
        ]:
            with self.assertRaises(ValueError):
                validate_samples(bad)

    def test_mixed_boolean_and_numeric_samples_are_rejected(self):
        samples = [[20000, 19000] for _ in range(300)]
        samples[100][0] = True
        with self.assertRaises(ValueError):
            validate_samples(samples)

    def test_isolated_spike_cannot_pass_finger_detection(self):
        a = np.full((300, 2), 760.0)
        a[0] = [83384, 67227]
        self.assertFalse(quality(a)["accepted"])

    def test_feature_contract_keeps_channel_order(self):
        a = np.c_[np.arange(300) + 20000, np.arange(300) + 17000]
        f = features(np.r_[a[:, 0], a[:, 1]][None, :])
        self.assertEqual(f.shape, (1, 23))
        self.assertAlmostEqual(f[0, 0], 20149.5)
        self.assertAlmostEqual(f[0, 10], 17149.5)

    def test_purge_removes_shared_sample_positions(self):
        rng = np.random.default_rng(42)
        stream = rng.uniform(1000, 2000, (1299, 2))
        x = np.array([np.r_[stream[i : i + 300, 0], stream[i : i + 300, 1]] for i in range(1000)])
        y = np.zeros(1000)
        train, test, purged, _, _ = split_windows(x, y)
        train_positions = {j for i in train for j in range(i, i + 300)}
        test_positions = {j for i in test for j in range(i, i + 300)}
        self.assertFalse(train_positions & test_positions)
        self.assertEqual(len(purged), 299)

    def test_prediction_rejects_flat_signal(self):
        r = predict(
            np.full((300, 2), 20000.0), Path(__file__).resolve().parents[1] / "artifacts/model.json"
        )
        self.assertEqual(r["status"], "rejected")
        self.assertIsNone(r["estimate"])

    def test_label_changes_cannot_hide_overlap_at_recording_boundaries(self):
        stream = np.arange(1299) + 20000
        x = np.array([np.r_[stream[i : i + 300], stream[i : i + 300]] for i in range(1000)])
        y = np.r_[np.zeros(500), np.ones(500)]
        with self.assertRaisesRegex(ValueError, "Labels change"):
            split_windows(x, y)

    def test_portable_prediction_and_invalid_model_failures(self):
        model = {
            "model_id": "synthetic-test-model",
            "feature_version": FEATURE_VERSION,
            "x_mean": [0] * 23,
            "x_scale": [1] * 23,
            "feature_low": [-1e9] * 23,
            "feature_high": [1e9] * 23,
            "y_mean": 85.5,
            "y_scale": 1,
            "target_range": [0, 900],
            "weights": [[[0] for _ in range(23)]],
            "biases": [[0]],
        }
        samples = np.c_[np.arange(300) + 20000, np.arange(300) + 19000]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "model.json"
            path.write_text(json.dumps(model), encoding="utf-8")
            result = predict(samples, path)
            self.assertEqual(result["status"], "estimated")
            self.assertEqual(result["estimate"], 85.5)
            model["x_scale"][0] = 0
            path.write_text(json.dumps(model), encoding="utf-8")
            with self.assertRaises(ModelError):
                predict(samples, path)
            model["x_scale"][0] = 1
            model["biases"] = []
            path.write_text(json.dumps(model), encoding="utf-8")
            with self.assertRaises(ModelError):
                load_model(path)
            path.write_text("{broken", encoding="utf-8")
            with self.assertRaises(ModelError):
                predict(samples, path)
            with self.assertRaises(ModelError):
                predict(samples, Path(folder) / "missing.json")


if __name__ == "__main__":
    unittest.main()
