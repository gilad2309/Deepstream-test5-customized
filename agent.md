# IOT_SMART_HOME Agent Notes

## Summary
Minimal Jetson/DeepStream pipeline: DeepStream runs YOLO inference and publishes person counts to local MQTT; the LED notifier blinks on count >= 1; the web UI shows the count and provides a single Start Surveillance button. The server auto-detects reachable RTSP cameras from a list and generates a DeepStream config on the fly.

## Architecture Highlights
- DeepStream app runs YOLO inference, publishes `deepstream/person_count`, and opens the native window.
- Local Mosquitto broker (system service): TCP `127.0.0.1:1883`, WebSocket `127.0.0.1:9001`.
- Node server serves the UI, detects reachable RTSP cameras, generates a config, and starts DeepStream + LED notifier.
- LED notifier subscribes to `deepstream/person_count` and blinks on count >= 1.
- Telegram command listener remains for remote start commands.

## Key Paths
- `app/server.js`: Node server and process orchestrator.
- `app/deepstream/config_generator.js`: Builds dynamic DeepStream configs.
- `app/mqtt/person_led_mqtt.py`: LED notifier.
- `app/mqtt/command_listener.py`: Telegram-triggered commands.
- `app/deepstream/configs/DeepStream-Yolo/deepstream_app_config_native.txt`: Native DeepStream config.
- `app/config/cameras.txt`: RTSP camera list (one URL per line).
- `app/data/runtime/deepstream_auto.txt`: Generated DeepStream config.
- `ui/`: Preact UI source (single page).

## Common Commands
- Build DeepStream binary: `make`
- Install/build UI: `cd ui && npm install && npm run build`
- Run server: `npm run serve`

## Runtime Behavior
- UI button calls `POST /api/start` to launch DeepStream native mode.
- `GET /api/status` reports whether DeepStream is running.
- UI subscribes to `deepstream/person_count` via MQTT WebSocket.
- Camera detection uses `app/config/cameras.txt` and probes RTSP host/port reachability.
  - Override camera list path with `CAMERAS_FILE=/path/to/cameras.txt`.

## MQTT Topics (Quick Reference)
- `deepstream/person_count`
