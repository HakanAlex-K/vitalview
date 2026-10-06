/* VitalView ESP32 firmware.
 * Classic dual-core ESP32, two MAX30105 boards and optional SSD1306.
 * Petri-dish glucose experiment; HR/SpO2 is a separate sensor function.
 * Network I/O never runs on the sensor-acquisition task.
 */
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <MAX30105.h>
#include <heartRate.h>
#include <math.h>
#if __has_include("secrets.h")
#include "secrets.h"
#else
// Buildable without secrets; networking remains disabled until configured.
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
#define BACKEND_URL ""
#define API_TOKEN ""
#define DEVICE_READ_TOKEN ""
#endif

#include "Types.h"

constexpr uint32_t UPLOAD_INTERVAL_MS = 60000, SENSOR_FRESH_MS = 1000;
constexpr uint32_t RESULT_TTL_MS = 90000, CAPTURE_MAX_AGE_MS = 15000;
constexpr uint32_t FINGER_THRESHOLD = 30000;  // Starting value; tune with hardware.
constexpr uint16_t SAMPLE_RATE = 200, SAMPLE_AVERAGE = 4;
constexpr float FIFO_RATE = float(SAMPLE_RATE) / SAMPLE_AVERAGE;
constexpr bool ENABLE_EXPERIMENTAL_SPO2 = true;  // Uncalibrated polynomial.

Adafruit_SSD1306 display(128, 64, &Wire, -1);
MAX30105 sensor1, sensor2;
WebServer web(80);
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
Telemetry shared;
QueueHandle_t uploadQueue;
bool oledOK = false, ok1 = false, ok2 = false;

// Sensor 2 (solution channel): ring buffer holding the most recent window.
Pair ring[WINDOW_SIZE];
uint16_t ringHead = 0, ringCount = 0;
uint32_t lastSample1 = 0, lastSample2 = 0, lastQueued = 0, sampleNumber = 0;

// Sensor 1 (vitals): beat averaging and oxygen statistics.
float hrBuffer[8] = {0};
uint8_t hrHead = 0, hrCount = 0;
uint32_t previousBeat = 0;
bool hasBeat = false, contact = false;
uint16_t settling = 0, oxCount = 0;
double meanIR = 0, meanRed = 0, m2IR = 0, m2Red = 0;
float smoothedOxygen = 0;
bool oxygenStarted = false;

Telemetry snapshot() {
  portENTER_CRITICAL(&mux);
  Telemetry t = shared;
  portEXIT_CRITICAL(&mux);
  return t;
}

void resetVitals() {
  hrHead = hrCount = 0;
  hasBeat = false;
  contact = false;
  settling = 0;
  oxCount = 0;
  meanIR = meanRed = m2IR = m2Red = 0;
  oxygenStarted = false;
  portENTER_CRITICAL(&mux);
  shared.finger = false;
  shared.hrValid = false;
  shared.oxygenValid = false;
  portEXIT_CRITICAL(&mux);
}

void consumeVitals(uint32_t ir, uint32_t red, uint32_t now) {
  ++sampleNumber;
  const bool finger = ir > FINGER_THRESHOLD && ir < 262140 && red < 262140;
  if (!finger) {
    resetVitals();
    return;
  }
  if (!contact) {
    resetVitals();
    contact = true;
  }
  portENTER_CRITICAL(&mux);
  shared.finger = true;
  shared.sampledAt = now;
  portEXIT_CRITICAL(&mux);

  bool beat = checkForBeat(ir);  // Keep detector filters running throughout settling.
  if (settling < 200) {
    ++settling;
    return;
  }
  if (beat) {
    const uint32_t interval = sampleNumber - previousBeat;
    if (hasBeat) {
      const float bpm = 60.0f * FIFO_RATE / interval;
      if (isfinite(bpm) && bpm >= 30 && bpm <= 200) {
        hrBuffer[hrHead] = bpm;
        hrHead = (hrHead + 1) % 8;
        if (hrCount < 8) ++hrCount;
        float average = 0;
        for (uint8_t j = 0; j < hrCount; ++j) average += hrBuffer[j];
        average /= hrCount;
        portENTER_CRITICAL(&mux);
        shared.heartRate = average;
        shared.hrValid = hrCount >= 2;
        shared.hrAt = now;
        portEXIT_CRITICAL(&mux);
      }
    }
    previousBeat = sampleNumber;
    hasBeat = true;
  }

  // Windowed Welford variance avoids startup DC bias and division by zero.
  ++oxCount;
  double di = ir - meanIR;
  meanIR += di / oxCount;
  m2IR += di * (ir - meanIR);
  double dr = red - meanRed;
  meanRed += dr / oxCount;
  m2Red += dr * (red - meanRed);
  if (oxCount == 100) {
    bool valid = false;
    float value = 0;
    if (ENABLE_EXPERIMENTAL_SPO2 && meanIR > 0 && meanRed > 0 && m2IR > 1 && m2Red > 1) {
      double ratio = (sqrt(m2Red / oxCount) / meanRed) / (sqrt(m2IR / oxCount) / meanIR);
      double calculated = -45.060 * ratio * ratio + 30.354 * ratio + 94.845;
      valid = isfinite(calculated) && calculated >= 0 && calculated <= 100;
      if (valid) {
        value = calculated;
        smoothedOxygen = oxygenStarted ? .7f * smoothedOxygen + .3f * value : value;
        oxygenStarted = true;
      }
    }
    if (!valid) oxygenStarted = false;
    portENTER_CRITICAL(&mux);
    shared.oxygenValid = valid;
    if (valid) {
      shared.oxygen = smoothedOxygen;
      shared.oxygenAt = now;
    }
    portEXIT_CRITICAL(&mux);
    oxCount = 0;
    meanIR = meanRed = m2IR = m2Red = 0;
  }
}

bool initSensor(MAX30105 &sensor, TwoWire &wire) {
  if (!sensor.begin(wire, I2C_SPEED_FAST)) return false;
  // LED amplitude, averaging, mode 2 (red + IR), sample rate, pulse width, ADC range.
  sensor.setup(0x7F, SAMPLE_AVERAGE, 2, SAMPLE_RATE, 411, 16384);
  sensor.setPulseAmplitudeGreen(0);
  sensor.clearFIFO();
  return true;
}

bool drain(MAX30105 &sensor, bool vital, uint32_t now) {
  // SparkFun's software ring stores 4 entries. A batch >=4 is unsafe to use.
  // Also detect the hardware overflow counter before check() can hide a gap.
  const bool overflow = (sensor.readRegister8(0x57, 0x05) & 0x1F) != 0;
  const uint16_t batch = sensor.check();
  if (overflow || batch >= STORAGE_SIZE) {
    while (sensor.available()) sensor.nextSample();
    sensor.clearFIFO();
    if (vital) {
      resetVitals();
      portENTER_CRITICAL(&mux);
      ++shared.gaps1;
      portEXIT_CRITICAL(&mux);
    } else {
      ringCount = 0;
      ringHead = 0;
      portENTER_CRITICAL(&mux);
      ++shared.gaps2;
      portEXIT_CRITICAL(&mux);
    }
    return false;
  }
  bool received = false;
  while (sensor.available()) {
    // Read red and IR from the same FIFO entry so the two channels stay paired.
    Pair p = {sensor.getFIFOIR(), sensor.getFIFORed()};
    sensor.nextSample();
    received = true;
    if (vital) {
      consumeVitals(p.ir, p.red, now);
      lastSample1 = now;
    } else {
      // A stall breaks the window's continuity, so start a new window.
      if (lastSample2 && now - lastSample2 > 200) {
        ringCount = 0;
        ringHead = 0;
      }
      ring[ringHead] = p;
      ringHead = (ringHead + 1) % WINDOW_SIZE;
      if (ringCount < WINDOW_SIZE) ++ringCount;
      lastSample2 = now;
    }
  }
  return received;
}

void uploadState(uint8_t state, int code = 0, float estimate = 0) {
  portENTER_CRITICAL(&mux);
  shared.uploadState = state;
  shared.httpCode = code;
  shared.estimate = estimate;
  shared.resultAt = state == 3 ? millis() : 0;
  portEXIT_CRITICAL(&mux);
}

void uploadTask(void *) {
  Capture capture;
  for (;;) {
    if (xQueueReceive(uploadQueue, &capture, portMAX_DELAY) != pdTRUE) continue;
    if (WiFi.status() != WL_CONNECTED || millis() - capture.endedAt > CAPTURE_MAX_AGE_MS) {
      uploadState(5);
      continue;
    }
    uploadState(2);

    String payload;
    payload.reserve(12000);
    payload = "{\"data\":[";
    for (uint16_t j = 0; j < WINDOW_SIZE; ++j) {
      if (j) payload += ',';
      payload += "{\"ir\":";
      payload += capture.data[j].ir;
      payload += ",\"red\":";
      payload += capture.data[j].red;
      payload += '}';
    }
    payload += "],\"capture\":{\"nominal_sample_rate_hz\":50,\"nominal_duration_ms\":";
    payload += capture.durationMs;
    payload += "}}";

    WiFiClient client;
    HTTPClient http;
    http.setConnectTimeout(3000);
    http.setTimeout(18000);
    if (!http.begin(client, BACKEND_URL)) {
      uploadState(5);
      continue;
    }
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + API_TOKEN);
    int code = http.POST(payload);
    Serial.printf("Capture upload HTTP: %d\n", code);
    if (code == 200) {
      StaticJsonDocument<256> filter;
      filter["status"] = true;
      filter["estimate"] = true;
      filter["glucose_estimate_mg_dl"] = true;
      StaticJsonDocument<512> result;
      DeserializationError error =
          deserializeJson(result, http.getString(), DeserializationOption::Filter(filter));
      JsonVariant value = result["estimate"];
      if (!error && result["status"] == "estimated" && value.is<float>() &&
          isfinite(value.as<float>()))
        uploadState(3, code, value.as<float>());
      else
        uploadState(5, code);
    } else
      uploadState(code == 422 ? 4 : 5, code);
    http.end();  // Never interpret a saved-only HTTP 200 body as an estimate.
  }
}

void serveData() {
  if (strlen(DEVICE_READ_TOKEN) == 0 ||
      web.header("Authorization") != String("Bearer ") + DEVICE_READ_TOKEN) {
    web.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
    return;
  }
  Telemetry t = snapshot();
  uint32_t now = millis();
  bool fresh = t.sensor1 && t.finger && now - t.sampledAt < SENSOR_FRESH_MS;
  bool hr = fresh && t.hrValid && now - t.hrAt < 3000;
  bool oxygen = fresh && t.oxygenValid && now - t.oxygenAt < 4000;

  StaticJsonDocument<768> doc;
  if (hr)
    doc["heartRate"] = t.heartRate;
  else
    doc["heartRate"] = nullptr;
  if (oxygen)
    doc["oxygen"] = t.oxygen;
  else
    doc["oxygen"] = nullptr;
  doc["heartRateValid"] = hr;
  doc["oxygenValid"] = oxygen;
  doc["oxygenExperimental"] = true;
  doc["fingerDetected"] = fresh;
  doc["sensor1Ready"] = t.sensor1;
  doc["sensor2Ready"] = t.sensor2;
  doc["sampleAgeMs"] = now - t.sampledAt;
  doc["fifoGaps1"] = t.gaps1;
  doc["fifoGaps2"] = t.gaps2;
  doc["uploadState"] = t.uploadState;
  doc["lastHttpCode"] = t.httpCode;
  if (t.uploadState == 3 && now - t.resultAt < RESULT_TTL_MS)
    doc["solutionEstimate"] = t.estimate;
  else
    doc["solutionEstimate"] = nullptr;
  doc["estimateUnit"] = "dataset-label units";

  String json;
  serializeJson(doc, json);
  web.sendHeader("Cache-Control", "no-store");
  web.send(200, "application/json", json);
}

void webTask(void *) {
  const char *headers[] = {"Authorization"};
  web.collectHeaders(headers, 1);
  web.on("/data", HTTP_GET, serveData);
  web.begin();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  uint32_t attempt = millis() - 10000;
  bool previouslyConnected = false;
  for (;;) {
    if (strlen(WIFI_SSID) > 0 && WiFi.status() != WL_CONNECTED && millis() - attempt >= 10000) {
      attempt = millis();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    bool connected = WiFi.status() == WL_CONNECTED;
    if (connected && !previouslyConnected) {
      Serial.print("ESP32 IP: ");
      Serial.println(WiFi.localIP());
    }
    previouslyConnected = connected;
    web.handleClient();
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  Wire1.begin(26, 27);
  Wire.setTimeOut(25);
  Wire1.setTimeOut(25);
  oledOK = display.begin(SSD1306_SWITCHCAPVCC, 0x3C, false, false);
  if (oledOK) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.display();
  }
  ok1 = initSensor(sensor1, Wire);
  ok2 = initSensor(sensor2, Wire1);
  Serial.printf("Sensor 1: %s | Sensor 2: %s | OLED: %s\n", ok1 ? "ready" : "missing",
                ok2 ? "ready" : "missing", oledOK ? "ready" : "missing");
  uploadQueue = xQueueCreate(1, sizeof(Capture));
  if (!uploadQueue) {
    Serial.println("Capture queue allocation failed");
    return;
  }
  if (xTaskCreatePinnedToCore(uploadTask, "uploads", 8192, nullptr, 1, nullptr, 0) != pdPASS)
    Serial.println("Upload task allocation failed");
  if (xTaskCreatePinnedToCore(webTask, "telemetry", 6144, nullptr, 1, nullptr, 0) != pdPASS)
    Serial.println("Telemetry task allocation failed");
  Serial.println("VitalView: experimental solution sensing. Configure secrets.h before connecting.");
}

void loop() {
  uint32_t now = millis();
  static uint32_t retry = 0, screen = 0;
  if (ok1) drain(sensor1, true, now);
  if (ok2) drain(sensor2, false, now);
  if (now - lastSample1 > SENSOR_FRESH_MS) resetVitals();
  if (now - lastSample2 > 200) {
    ringCount = 0;
    ringHead = 0;
  }

  // Retry missing or stalled sensors every ten seconds.
  if (now - retry >= 10000) {
    retry = now;
    if (!ok1 || now - lastSample1 > 2000) {
      ok1 = initSensor(sensor1, Wire);
      resetVitals();
    }
    if (!ok2 || now - lastSample2 > 2000) {
      ok2 = initSensor(sensor2, Wire1);
      ringCount = 0;
      ringHead = 0;
    }
  }
  portENTER_CRITICAL(&mux);
  shared.sensor1 = ok1;
  shared.sensor2 = ok2;
  portEXIT_CRITICAL(&mux);

  // Hand a full window, oldest sample first, to the upload task. The one-slot queue keeps
  // only the newest capture if an upload is still in progress.
  if (uploadQueue && strlen(BACKEND_URL) > 0 && strlen(API_TOKEN) > 0 &&
      ringCount == WINDOW_SIZE && now - lastQueued >= UPLOAD_INTERVAL_MS &&
      WiFi.status() == WL_CONNECTED) {
    static Capture capture;
    for (uint16_t j = 0; j < WINDOW_SIZE; ++j) capture.data[j] = ring[(ringHead + j) % WINDOW_SIZE];
    capture.endedAt = lastSample2;
    capture.durationMs = uint32_t((WINDOW_SIZE - 1) * 1000 / FIFO_RATE);
    uploadState(1);
    xQueueOverwrite(uploadQueue, &capture);
    lastQueued = now;
  }

  if (oledOK && now - screen >= 250) {
    screen = now;
    Telemetry t = snapshot();
    display.clearDisplay();
    display.setCursor(0, 0);
    display.setTextSize(1);
    display.println("VITALVIEW / RESEARCH");
    display.print("HR: ");
    if (t.finger && t.hrValid && now - t.hrAt < 3000)
      display.print(t.heartRate, 1);
    else
      display.print("--");
    display.println(" bpm");
    display.print("SpO2*: ");
    if (t.finger && t.oxygenValid && now - t.oxygenAt < 4000)
      display.print(t.oxygen, 1);
    else
      display.print("--");
    display.println(" %");
    display.print("Solution: ");
    if (t.uploadState == 3 && now - t.resultAt < RESULT_TTL_MS)
      display.println(t.estimate, 1);
    else
      display.println("--");
    display.print("HTTP: ");
    display.println(t.httpCode);
    display.println(WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "WiFi offline");
    display.println("*uncalibrated / lab");
    display.display();
  }
  delay(1);
}
