# Local API contract

Default origin: `http://127.0.0.1:8787`. All responses are JSON, except static dashboard assets.

## POST /glucose or /api/acquisitions

`/glucose` is the device-compatible route. `/api/acquisitions` is used for manually imported CSV captures. Body: `{"data":[{"ir":21000,"red":19900}, ...]}` with exactly 300 samples. Values must be finite JSON numbers in the 18-bit ADC range 0–262143; numeric strings and booleans are rejected.

A successful experimental result returns HTTP 200 with `status: "estimated"`, `estimate`, `glucose_estimate_mg_dl` (legacy alias), `unit`, `quality`, `model_id`, `research_only`, `id`, `source`, `receivedAt`, and `samples`. Rejected, out-of-distribution, or out-of-range captures return HTTP 422 with `estimate: null` and an explanation. Malformed input, including a null body, returns 400. Bodies larger than 100,000 bytes return JSON HTTP 413. Concurrent inference returns 429 and can be retried. A missing, corrupt, or incompatible model or unavailable interpreter returns 503 and records an error capture with a null estimate; no previous estimate is substituted. Signal-quality rejection can occur before the model is loaded.

Signal gates use channel medians, robust ranges, and saturation. Model-envelope checks use training-derived feature bounds. These are engineering heuristics, not proven medical safety checks. They cannot establish that a sample is suitable for clinical glucose inference.

## GET /api/state

Latest acquisition, optional device vitals, busy status, acquisition `revision`, process-specific `sessionId`, device connection diagnostics, and up to 100 capture metadata entries. Revision increases within a process; restarting the server changes `sessionId` and resets revision and in-memory history. The dashboard uses both fields to recover after a restart. Session metadata retains rejection reasons; only the latest capture retains its waveform. No measurement appears until received. Acquisition results are stale after 90 seconds; device vitals are stale after 15 seconds. The UI hides stale values. Polling is every 3 seconds after the preceding request completes, with cleanup cancellation and abort timeouts.

## GET /api/model

Training/evaluation metadata. The built frontend ships the same benchmark at build time. Device mode fetches this endpoint, while Demo uses the build-time report. Run `npm run build` after retraining to refresh that bundled demo benchmark.

## GET /glucose-result

Legacy compatibility: a fresh accepted result returns `glucose_estimate_mg_dl`. No result, a rejected most-recent capture, or an expired result returns 404.

## Security and operation

Loopback binding is default. Token-free API requests must use a loopback Host name (`localhost`, `127.0.0.1`, or `[::1]`) to prevent an attacker-controlled DNS name from being trusted as the server origin. Non-loopback binding requires `API_TOKEN`; send it as `Authorization: Bearer ...` in all API requests. Browser origins are restricted. For Vite development the default allowed origins are localhost/127.0.0.1 port 5173; override `ALLOWED_ORIGINS` with a comma-separated list if needed. Token stays in browser memory only. Per-request Python workers receive samples through stdin, never through a shared CSV. No patient database, shell interpolation, or uploaded pickle deserialization is used.

## POST /api/vitals

Optional push alternative to polling ESP32 `/data`. Body: `{"heartRate":73,"oxygen":98}`. Optional boolean `heartRateValid` / `oxygenValid` flags can invalidate values. Requires the same authorization. Choose push or pull per board. The backend timestamps receipt; firmware is responsible for actual acquisition freshness.

`POST /glucose` accepts optional `simulated:true` for transport testing; these captures have source `simulator` and are clearly labeled by React. Concentration output uses `dataset-label units` until the experiment units are confirmed.

## Authenticated ESP32 polling

`ESP32_READ_TOKEN` is sent as a bearer token to the configured board’s `/data` endpoint. It must match `DEVICE_READ_TOKEN` in `firmware/VitalViewEsp32/secrets.h`. Firmware freshness/validity flags are honored. `oxygenExperimental:true` is preserved and labeled in React; the oxygen polynomial is uncalibrated.
