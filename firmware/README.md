# VitalView ESP32 firmware

Firmware for the VitalView prototype board. This is the second revision of the competition sketch: it keeps the original pin assignments and optical settings and fixes the acquisition problems listed under [Changes from the first revision](#changes-from-the-first-revision).

## Hardware and pinned build

Target: classic dual-core ESP32 Dev Module (`esp32dev`), not ESP32-C3/S2/S3. Verify the actual board before uploading.

| Component                       | Bus   | SDA | SCL | Address |
| ------------------------------- | ----- | --: | --: | ------- |
| HR / experimental SpO2 MAX30105 | Wire  |  21 |  22 | 0x57    |
| SSD1306 OLED, 128x64            | Wire  |  21 |  22 | 0x3C    |
| Solution optical MAX30105       | Wire1 |  26 |  27 | 0x57    |

Connect common ground and use board-appropriate power and I2C pull-ups. Sensor settings remain LED amplitude 0x7F, averaging 4, red+IR mode, sample rate 200, pulse width 411, ADC range 16384. FIFO output is nominally 50 pairs/second after averaging; a 300-pair window spans about six seconds. This is a configured rate, not a measured timing calibration.

Build with the pinned `platformio.ini`:

```sh
python -m pip install platformio
python -m platformio run -d firmware
# Only after verifying the board and local configuration:
python -m platformio run -d firmware --target upload
python -m platformio device monitor --baud 115200
```

Alternatively open `VitalViewEsp32/VitalViewEsp32.ino` in Arduino IDE with the dependencies/version numbers from `platformio.ini`. Built-in WebServer replaces ESPAsyncWebServer, so that extra dependency is unnecessary.

## Configure locally

Copy `VitalViewEsp32/secrets.example.h` to `VitalViewEsp32/secrets.h`. Set:

- `WIFI_SSID` / `WIFI_PASSWORD`: your local network.
- `BACKEND_URL`: plain URL, including the port, e.g. `http://YOUR_COMPUTER_LAN_IP:8787/glucose`. Do not paste a Markdown link.
- `API_TOKEN`: same as the Node backend `.env` token.
- `DEVICE_READ_TOKEN`: token protecting this board's `/data` endpoint.

In the Node `.env`, configure `HOST=0.0.0.0`, `API_TOKEN`, `ESP32_URL=http://YOUR_ESP32_IP`, and `ESP32_READ_TOKEN` matching the board's `DEVICE_READ_TOKEN`. Restart the backend. Enter `API_TOKEN` in the React connection settings. `secrets.h` is ignored and excluded from release ZIPs.

Networking is disabled with empty compile-time defaults when secrets.h is missing. This permits a credential-free compile, not a connected device. Use a trusted private LAN; these HTTP endpoints are not an internet deployment.

## Changes from the first revision

- Consume red and IR from the **same FIFO entry**, exactly once, instead of independent `getIR()` / `getRed()` calls.
- Reject discontinuous windows after FIFO overflow, software ring overrun, or a sensor stall. SparkFun's software FIFO holds only four slots, so batches of four or more are discarded conservatively.
- Upload only a complete 300-pair buffer, ordered oldest to newest. The original circular buffer was emitted starting at index zero regardless of the write position.
- Keep sensor acquisition and OLED access on one task. HTTP uploads and the authenticated `/data` server have separate tasks; network waits do not intentionally suspend sensor polling.
- Preserve heart-rate validity between beats and expire it after three seconds. Reset beat averaging and oxygen statistics on contact loss.
- Use a bounded 100-sample oxygen statistics window, guard denominators/nonfinite values, and initialize smoothing from the first usable result rather than zero. The original polynomial remains an **uncalibrated experimental estimate**, not a validated SpO2 algorithm. It can be disabled with `ENABLE_EXPERIMENTAL_SPO2=false`.
- Use null for unavailable values and explicit validity flags. Raw infrared intensity is no longer mislabeled as glucose.
- Read and validate inference JSON. A save-only server returning plain HTTP 200 is not treated as a prediction. Rejections and network errors clear the OLED estimate; accepted results expire after 90 seconds.
- Wi-Fi reconnects without an infinite setup wait. A missing OLED does not stop sensing; missing/stalled sensors are retried every ten seconds.

Uploads occur every 60 seconds when a complete recent window and Wi-Fi are available. There is no automatic retry of an uncertain POST, avoiding accidental duplicate captures. A one-slot queue bounds memory; disconnected/old snapshots are discarded. Estimated solution concentration is shown in dataset-label units until the units are confirmed.

## Server choice

Use the root `server.js`. The first-revision Express server only validated and saved CSV files; it did not run the neural network or return an estimate. This firmware therefore treats a plain `200 OK` without a structured estimate as a protocol error. The current server returns structured predictions and rejections and also serves the React dashboard.

## Hardware acceptance checks still required

1. Check serial output, OLED text, both I2C addresses, and board IP.
2. Verify `/data` is rejected without its read token and retrieved through Node with the matching token.
3. Place/remove a finger on sensor 1: HR should settle, persist between beats, then disappear promptly on removal; no old oxygen value should remain.
4. Use the actual Petri-dish geometry on sensor 2. Check FIFO gap counters and confirm 300 chronological sample pairs reach React. Do not interpret a finger reading from this channel as a validated glucose estimate.
5. Disconnect Wi-Fi and the server. Acquisition should continue; reconnect should recover transport without fabricated readings. Exercise HTTP 401, 422, and missing-model failures.
6. Compare readings against independently collected references. Correct FIFO pairing changes acquisition behavior relative to the old sketch, so recheck model applicability and collect independent dish/session data before claiming accuracy.

## Implementation references

- [SparkFun MAX30105 source](https://github.com/sparkfun/SparkFun_MAX3010x_Sensor_Library/blob/master/src/MAX30105.cpp): FIFO acquisition and averaging.
- [Espressif HTTPClient](https://github.com/espressif/arduino-esp32/blob/master/libraries/HTTPClient/src/HTTPClient.h): request timeouts and responses.
