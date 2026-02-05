# Minimal DeepStream Native Surveillance (Local MQTT)

This project is simplified to the essentials:

- **One web page** with a single **Start Surveillance** button
- **Native DeepStream window** for live inference
- **Real-time person count** on the web UI
- **LED blinking** when person count > 1
- **Local MQTT broker** (Mosquitto system service)
- **Telegram integration** retained

---

## High-Level Flow
1. User clicks **Start Surveillance** in the web UI.
2. Node server starts **DeepStream** with the native config.
3. DeepStream publishes person counts to MQTT topic `deepstream/person_count`.
4. The UI subscribes via MQTT WebSocket and displays the count.
5. The LED notifier subscribes via MQTT and blinks when count > 1.

---

## Prerequisites
- NVIDIA DeepStream 7.1 installed.
- Node.js + npm (for server and UI).
- Python 3 with `Jetson.GPIO` and `paho-mqtt` (for LED notifier).
- **Mosquitto broker** with WebSocket enabled (system service).

---

## Mosquitto (Local Broker)
Ensure your Mosquitto service exposes:
- MQTT TCP: `127.0.0.1:1883`
- MQTT WebSocket: `127.0.0.1:9001`

### Configure Mosquitto Service (systemd)
If Mosquitto is not installed:
```bash
sudo apt-get update
sudo apt-get install -y mosquitto mosquitto-clients
```

1) Check status:
```bash
systemctl status mosquitto
```

2) Ensure the main config includes `/etc/mosquitto/conf.d/` (default on Ubuntu):
```bash
cat /etc/mosquitto/mosquitto.conf
```

3) Create or edit the WebSocket listener file:
```bash
sudo nano /etc/mosquitto/conf.d/ws.conf
```

4) Add/ensure these listeners:
```
listener 1883 127.0.0.1
protocol mqtt

listener 9001 127.0.0.1
protocol websockets

allow_anonymous true
```

5) Enable + restart:
```bash
sudo systemctl enable mosquitto
sudo systemctl restart mosquitto
systemctl status mosquitto
```

6) Validate ports are open:
```bash
sudo ss -lntp | grep mosquitto
```
You should see listeners on `127.0.0.1:1883` and `127.0.0.1:9001`.

---

## Install
```bash
cd ui
npm install
npm run build
cd ..
```

---

## Build DeepStream App
The DeepStream binary is not committed to git. Build it after cloning:
```bash
make
```
This produces:
- `app/deepstream/deepstream-test5-app`

---

## Run
```bash
npm run serve -- --no-ddb
```
- UI: http://127.0.0.1:8081
- Click **Start Surveillance** to open the native DeepStream window.
 - Cameras are detected from `app/config/cameras.txt` (only reachable RTSP hosts are used).

Logs:
- `app/data/logs/deepstream.out.log`
- `app/data/logs/led_notifier.out.log`

---

## Configuration
### DeepStream MQTT (defaults to localhost)
- `DEEPSTREAM_MQTT_HOST` (default `127.0.0.1`)
- `DEEPSTREAM_MQTT_PORT` (default `1883`)
- `DEEPSTREAM_MQTT_TOPIC` (default `deepstream/person_count`)

### LED Notifier
- `MQTT_HOST` (default `127.0.0.1`)
- `MQTT_PORT` (default `1883`)
- `PERSON_COUNT_TOPIC` (default `deepstream/person_count`)
- `LED_PIN` (default `7`, BOARD mode)
- `LED_HOLD_SECONDS` (default `5`)

### Web UI
- `VITE_MQTT_WS_URL` (default `ws://127.0.0.1:9001`)
- `VITE_PERSON_COUNT_TOPIC` (default `deepstream/person_count`)

### Camera List (Auto-Detect)
Edit `app/config/cameras.txt` (one RTSP URL per line). The server probes which cameras are reachable and generates a DeepStream config automatically. To override the file path, set:
```
CAMERAS_FILE=/path/to/cameras.txt
```

---

## Telegram (Optional)
Telegram integration remains unchanged.
- `app/mqtt/command_listener.py` still starts the server / pipeline.
- See `telegram_bot/README.md` for setup.

---

## Notes
- Person count topic: `deepstream/person_count`
- LED blinks when **count > 1**.
