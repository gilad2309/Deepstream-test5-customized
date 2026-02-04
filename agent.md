# IOT_SMART_HOME Agent Notes

## Summary
Minimal Jetson/DeepStream pipeline: DeepStream publishes person counts to local MQTT; the LED notifier blinks on count > 1; the web UI shows the count and provides a single Start Surveillance button; Telegram command listener can start the server/pipeline.

## Architecture Highlights
- DeepStream app publishes `deepstream/person_count` and opens the native window.
- Local Mosquitto broker: TCP `127.0.0.1:1883`, WebSocket `127.0.0.1:9001`.
- Node server serves the UI and starts DeepStream + LED notifier.
- LED notifier subscribes to `deepstream/person_count` and blinks on count > 1.
- Telegram command listener remains for remote start commands.

## Key Paths
- `app/server.js`: Node server and process orchestrator.
- `app/mqtt/person_led_mqtt.py`: LED notifier.
- `app/mqtt/command_listener.py`: Telegram-triggered commands.
- `app/deepstream/configs/DeepStream-Yolo/deepstream_app_config_native.txt`: Native DeepStream config.
- `ui/`: Preact UI source (single page).

## Common Commands
- Install root deps: `npm install`
- Install/build UI: `cd ui && npm install && npm run build`
- Run server: `npm run serve -- --no-ddb`

## Runtime Behavior
- UI button calls `POST /api/start` to launch DeepStream native mode.
- `GET /api/status` reports whether DeepStream is running.
- UI subscribes to `deepstream/person_count` via MQTT WebSocket.

## MQTT Topics (Quick Reference)
- `deepstream/person_count`
