# One connected application

The frontend is a real React app, not just an HTML mockup. `web/main.jsx` mounts the `App` component, which calls the backend and renders received values. Vite builds it into `dist/`; the Node server serves that directory and the API from one origin. The standalone HTML is an optional portable demonstration.

## Run on Windows

Install Node 22.22.2+ or 24.15+ and Python 3.11+, extract this folder, and open PowerShell here:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm ci
Copy-Item .env.example .env
```

Set `PYTHON=.venv/Scripts/python.exe` in `.env`. Then:

```powershell
npm run build
npm start
```

Open `http://127.0.0.1:8787`. Device mode is the default. The React frontend polls `/api/state` every three seconds and loads `/api/model` from that same server. An empty reading means no usable input has arrived; it is not replaced by random data. Switch to Demo for synthetic examples.

On macOS/Linux use `python3 -m venv .venv`, `.venv/bin/python -m pip install -r requirements.txt`, and set `PYTHON=.venv/bin/python`.

## Connect the physical ESP32

1. Put the computer and ESP32 on the same reachable network.
2. In `.env`, set `HOST=0.0.0.0` and a long random `API_TOKEN`. Restart the server. Use a trusted private network; this development server uses HTTP.
3. In the firmware, set the destination to `http://YOUR_COMPUTER_LAN_IP:8787/glucose`. If a board is still configured for port 3000 (used by the first server version), set `PORT=3000` instead.
4. Send `Content-Type: application/json` and `Authorization: Bearer YOUR_API_TOKEN` with each request. Upload exactly 300 `{ir,red}` pairs in the `data` array. Use ADC values before scaling; Python applies the trained preprocessing.
5. In React's Connection settings, enter the same API token. Leave the base URL blank when opening the dashboard from its backend. This token is kept in memory only.
6. For heart rate and SpO₂ choose one route: configure `ESP32_URL=http://YOUR_ESP32_IP` and `ESP32_READ_TOKEN` matching `DEVICE_READ_TOKEN` in the firmware so the backend polls the board's authenticated `/data`, **or** push numeric readings to `/api/vitals`. Do not use both methods for the same board.

The `/data` response and `/api/vitals` body use `heartRate` and `oxygen`. Optional `heartRateValid:false` and `oxygenValid:false` invalidate the corresponding values. Missing/invalid fields are null, not guessed. Polling a board endpoint only proves a response was received; firmware must mark invalid or stale sensor readings accurately.

A successful `/glucose` response includes both `estimate` for React and `glucose_estimate_mg_dl` for the original ESP32 client. They contain the same value. The old key is retained for protocol compatibility; it does not confirm the experimental concentration units. On HTTP 422, show rejection and clear the board's previous estimate. On 400 fix the payload; on 401 fix the token; on 429 retry later; on 503 check Python/model configuration. Do not display a previous value as a new measurement after an error.

## Verify without hardware

With the server running, `npm run demo:device` sends generated optical samples through the actual endpoint and checks that `/api/state` returns the same capture ID. If authentication is enabled, set `API_TOKEN` in that terminal. `VITALVIEW_URL` overrides the backend address. These uploads are marked `simulator` in server state and React displays an explicit synthetic-data notice. Domain rejection is possible and expected: successful transport does not imply a valid model estimate.

`npm test` builds the app and runs Python, API, and React DOM tests. The separate recorded integration run also used the real Node/Python stack, a dataset window, and a simulated ESP32 HTTP endpoint. The revised firmware compiles for the pinned `esp32dev` target with no source errors. See `integration-verification.json`. No patient identities or raw dataset window are included in that report.

## What remains unverified

- Physical ESP32 behavior, Wi-Fi, sensor timing, and OLED display.
- Rendered desktop/mobile layout in a real browser: DOM tests verify behavior, not visual appearance.
- New independent Petri-dish preparations and acquisition sessions. The current benchmark uses purged windows within existing recordings.
- Concentration units, xanthan-gum quantities, and whether the quantity was held constant across dishes.

The model is for experimental solution concentration. Heart-rate/SpO₂ telemetry is a separate sensor function; these readings do not establish that glucose inference works on a finger or human blood.
