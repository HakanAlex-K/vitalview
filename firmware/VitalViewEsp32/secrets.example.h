#pragma once
// Copy to secrets.h and fill in locally. Never commit secrets.h.
#define WIFI_SSID "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define BACKEND_URL "http://YOUR_COMPUTER_LAN_IP:8787/glucose"
#define API_TOKEN "SAME_TOKEN_AS_BACKEND_ENV"
// Backend uses this separate token to read the board's /data endpoint.
#define DEVICE_READ_TOKEN "YOUR_DEVICE_READ_TOKEN"
