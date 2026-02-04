# System Overview (Minimal)

## End-to-End Flow
This system is reduced to the essentials for native DeepStream surveillance:

1. **DeepStream** runs YOLO in native mode and publishes person counts to MQTT.
2. **Mosquitto (local)** hosts MQTT on `127.0.0.1:1883` and WebSocket on `127.0.0.1:9001`.
3. **Web UI** subscribes to `deepstream/person_count` via MQTT WebSocket and displays the count.
4. **LED notifier** subscribes to `deepstream/person_count` and blinks when count > 1.
5. **Telegram integration** remains optional and unchanged for remote start commands.

---

## Components
- **DeepStream native app**
  - Publishes: `deepstream/person_count`
- **Local Mosquitto broker**
  - TCP: `127.0.0.1:1883`
  - WebSocket: `127.0.0.1:9001`
- **Node server** (`app/server.js`)
  - Serves UI
  - `POST /api/start` to launch DeepStream
  - `GET /api/status` to check running state
- **LED notifier** (`app/mqtt/person_led_mqtt.py`)
  - Subscribes to `deepstream/person_count`
  - Blinks when count > 1
- **Web UI** (`ui/`)
  - Single page with Start button and real-time count

---

## MQTT Topics
- `deepstream/person_count`

---

## Telegram (Optional)
- `telegram_bot/` and `app/mqtt/command_listener.py` remain for remote control.
