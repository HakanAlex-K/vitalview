#pragma once
#include <Arduino.h>

constexpr uint16_t WINDOW_SIZE = 300;

struct Pair {
  uint32_t ir, red;
};

struct Capture {
  Pair data[WINDOW_SIZE];
  uint32_t endedAt, durationMs;
};

// Shared between tasks: read it with snapshot() and write it inside the `mux` critical section.
struct Telemetry {
  float heartRate = 0, oxygen = 0, estimate = 0;
  bool finger = false, hrValid = false, oxygenValid = false, sensor1 = false, sensor2 = false;
  uint32_t sampledAt = 0, hrAt = 0, oxygenAt = 0, resultAt = 0, gaps1 = 0, gaps2 = 0;
  int httpCode = 0;
  // 0 awaiting, 1 queued, 2 uploading, 3 estimated, 4 rejected, 5 error.
  uint8_t uploadState = 0;
};
