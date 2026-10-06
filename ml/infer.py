"""JSON stdin/stdout worker. Raw samples never touch shared files."""

import json
import sys
from pathlib import Path
from pipeline import ModelError, predict

try:
    payload = json.load(sys.stdin)
    samples = [[row["ir"], row["red"]] for row in payload["data"]]
    result = predict(samples, Path(__file__).resolve().parents[1] / "artifacts/model.json")
    print(json.dumps(result, allow_nan=False))
except ModelError as e:
    print(json.dumps({"status": "error", "estimate": None, "error": str(e), "research_only": True}))
    sys.exit(1)
except (ValueError, KeyError, TypeError) as e:
    print(json.dumps({"status": "invalid", "estimate": None, "error": str(e)}))
    sys.exit(2)
