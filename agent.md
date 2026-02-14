# IOT_SMART_HOME Runtime Spec (Agent Bootstrap)

## Purpose and Scope
This repo is a minimal Jetson/DeepStream surveillance stack with one web UI button, a native DeepStream window, MQTT-based person counts, and an LED notifier. This document is the single source of truth for how the system behaves at runtime and how components interact.

## Repository Layout (Top-Level)
- `app/`: Node server, DeepStream app + configs, MQTT scripts, runtime data.
- `ui/`: Preact UI source (built into `ui/dist`).
- `README.md`: End-user setup and run commands.

## Runtime State Model

### System-Level States
- `OFF`: Server is not running. UI is unavailable.
- `IDLE`: Server is running, DeepStream is not running.
- `STARTING`: Server is handling `POST /api/start` and spawning processes.
- `RUNNING`: DeepStream process is alive; native window is visible.
- `FAILED`: Server is running but DeepStream failed to start or exited; `GET /api/status` returns `running=false`.

### UI States
- `IDLE`: Start button enabled; count is `--`.
- `STARTING`: Start button disabled; waiting for `/api/start` response.
- `RUNNING`: Start button disabled; count updates from MQTT.
- `ERROR`: UI shows HTTP or MQTT error banner; state returns to `IDLE` once resolved.

### State Transitions
- `OFF -> IDLE`: User runs `npm run serve`.
- `IDLE -> STARTING`: User clicks **Start Surveillance** (UI calls `POST /api/start`).
- `STARTING -> RUNNING`: Server spawns DeepStream successfully; UI sees `running=true` via `/api/status` or receives MQTT counts.
- `RUNNING -> FAILED`: DeepStream exits or crashes; server marks process gone; UI detects `running=false` on next status poll.
- `FAILED -> STARTING`: User clicks **Start Surveillance** again.

## Lifecycle: Startup to Shutdown
1. User runs `npm run serve`.
2. Node server starts on `http://127.0.0.1:8081` and serves `ui/dist`.
3. UI loads and starts polling `GET /api/status`.
4. UI establishes MQTT WebSocket connection to `ws://127.0.0.1:9001` and subscribes to `deepstream/person_count`.
5. User clicks **Start Surveillance**.
6. Server enters `STARTING` and kills stale processes, reads RTSP URLs, probes reachability, generates `app/data/runtime/deepstream_auto.txt`, spawns `deepstream-test5-app`, and spawns the LED notifier.
7. DeepStream initializes the GStreamer pipeline, opens the native window, and starts inference.
8. DeepStream publishes per-stream person counts to MQTT topic `deepstream/person_count`.
9. UI receives MQTT messages and updates the on-screen count; `RUNNING` state is shown.
10. If the native window is closed, DeepStream exits; server marks it stopped; UI returns to `IDLE` after the next status poll.
11. If server receives `SIGINT`, it sends `SIGTERM` to child processes and exits.

## Component Details

### Mosquitto Broker (system service)
- Responsibility: Local MQTT broker for counts and UI updates.
- Initialization: Must be running before starting the system.
- Inputs: MQTT TCP and WebSocket connections.
- Outputs: Publishes and delivers `deepstream/person_count` messages.
- Failure: If broker is down, counts are not delivered; UI shows MQTT error; LED notifier does not blink.

### Node Server (`app/server.js`)
- Responsibility: Serve UI, start DeepStream + LED notifier, expose API.
- Initialization: `npm run serve` starts the HTTP server on port 8081.
- Inputs: HTTP `POST /api/start`, HTTP `GET /api/status`, camera list from `app/config/cameras.txt` or `CAMERAS_FILE`.
- Outputs: Spawns DeepStream and LED notifier processes; logs to `app/data/logs/*.log`; writes `app/data/runtime/deepstream_auto.txt`.
- Failure: If DeepStream fails to start, the server still returns a JSON response; UI will see `running=false` on the next poll.
- Failure: If no camera is reachable, it still generates a config; DeepStream may fail to connect to sources.

### Config Generator (`app/deepstream/config_generator.js`)
- Responsibility: Build a DeepStream config dynamically based on reachable cameras.
- Initialization: Called by the server during `POST /api/start`.
- Inputs: RTSP URLs + fixed config paths for inference and tracker.
- Outputs: A full DeepStream config string written to `app/data/runtime/deepstream_auto.txt`.
- Behavior: Probes each RTSP URL host/port (TCP connect, 1200ms timeout).
- Behavior: Uses only reachable URLs; if none are reachable, falls back to the first configured URL.
- Behavior: Computes tile grid (rows/columns) based on camera count.
- Behavior: Sets `streammux batch-size` to the number of sources and enables padding to avoid stretched images.
- Failure: Empty camera list yields a config with zero sources; DeepStream will fail. Always keep at least one RTSP URL in `app/config/cameras.txt`.

### DeepStream App (`app/deepstream/deepstream-test5-app`)
- Responsibility: Inference + visualization + MQTT person count publishing.
- Initialization: Spawned by server with `-c app/data/runtime/deepstream_auto.txt`.
- Inputs: RTSP streams from the generated config.
- Inputs: Inference config `app/deepstream/configs/DeepStream-Yolo/config_infer_primary_yoloV8.txt`.
- Inputs: Tracker config `app/deepstream/configs/DeepStream-Yolo/config_tracker_NvDCF_perf.yml`.
- Inputs: Tracker lib `app/deepstream/lib/libnvds_nvmultiobjecttracker.so`.
- Inputs: MQTT env `MQTT_HOST`, `MQTT_PORT`, `MQTT_TOPIC`.
- Outputs: Native X11 window with tiled video and bounding boxes.
- Outputs: MQTT messages to `deepstream/person_count`.
- Outputs: Logs to `app/data/logs/deepstream.out.log` and `app/data/logs/deepstream.err.log`.
- MQTT payload format: JSON `{\"type\":\"person_count\",\"count\":<int>,\"stream_id\":<int>,\"ts\":<ms>}`.
- Failure: If RTSP sources are unreachable, pipeline fails and exits.
- Failure: If MQTT connection fails, inference still runs but counts are not delivered.

## Inference and Video Flow
1. Each RTSP source is decoded and fed into `nvstreammux`.
2. `nvstreammux` batches frames with `batch-size` equal to the number of sources and uses padding to preserve aspect ratio.
3. `nvinfer` runs YOLO inference using `config_infer_primary_yoloV8.txt` and produces object metadata.
4. The tracker (`NvDCF`) updates object IDs to reduce flicker across frames.
5. `nvosd` draws bounding boxes and labels.
6. `nvmultistreamtiler` arranges sources into a tiled grid based on computed rows/columns.
7. The sink renders the tiled output to an X11 native window.
8. Person counts are computed per stream by counting objects with class ID 0 and published to MQTT.

### Web UI (`ui/`)
- Responsibility: Start button + live person count display.
- Initialization: Served from `ui/dist` by the Node server.
- Inputs: `GET /api/status` (polls every 1s when running, 5s when idle).
- Inputs: MQTT WebSocket messages on `deepstream/person_count`.
- Outputs: `POST /api/start` when the user clicks **Start Surveillance**.
- Behavior: Button disabled while `starting` or `running`.
- Behavior: `count` resets to `--` when `running=false`.
- Behavior: MQTT parsing accepts JSON or numeric payloads and updates the count.
- Behavior: The UI does not display video; the native DeepStream window is the only video output.
- Failure: HTTP errors show a banner; MQTT errors show a banner.

### LED Notifier (`app/mqtt/person_led_mqtt.py`)
- Responsibility: Blink a GPIO LED when person count is high enough.
- Initialization: Spawned by the server during `POST /api/start`.
- Inputs: MQTT topic `deepstream/person_count`.
- Inputs: Env `MQTT_HOST`, `MQTT_PORT`, `PERSON_COUNT_TOPIC`, `LED_PIN`, `LED_HOLD_SECONDS`.
- Outputs: GPIO pin toggles on Jetson (BOARD pin number).
- Behavior: `BLINK_MIN_COUNT` is hardcoded to `1`.
- Behavior: Self-test blink on startup.
- Behavior: Blinks for `LED_HOLD_SECONDS` after any count >= 1.
- Failure: If GPIO access fails, script will error out and exit.
- Failure: If MQTT is down, it will connect-retry and never receive counts.

### Telegram Command Listener (`app/mqtt/command_listener.py`)
- Responsibility: Optional MQTT listener to start/stop the server or pipeline.
- Initialization: Manually started by the user (not launched by the server).
- Inputs: MQTT commands on `COMMAND_TOPIC` (default `jetson/command`).
- Inputs: `START_PIPELINE_TEXT` triggers `POST /api/start`.
- Inputs: `TRIGGER_TEXT` runs `RUN_COMMAND` to start the server.
- Outputs: Starts/stops a local process or calls `/api/start`.
- Failure: Default `RUN_COMMAND` is `npm run serve -- --no-ddb`; override it if you want the exact current server command.

## Interfaces and Data Contracts

### HTTP API
- `POST /api/start`: side effects generate config and start DeepStream + LED notifier; response JSON includes `ok`, `running`, `cameras`, `results`.
- `GET /api/status`: response JSON `{ \"running\": <bool>, \"pid\": <int|null> }`.

### MQTT Topics
- `deepstream/person_count`: produced by DeepStream, consumed by UI + LED notifier; payload JSON includes `count` and `stream_id`.

## Configuration and Environment

### Server
- `CAMERAS_FILE`: path to RTSP list file.
- `DEEPSTREAM_MQTT_HOST`, `DEEPSTREAM_MQTT_PORT`, `DEEPSTREAM_MQTT_TOPIC`.
- `LED_MQTT_HOST`, `LED_MQTT_PORT`, `PERSON_COUNT_TOPIC`, `LED_PIN`, `LED_HOLD_SECONDS`.

### UI
- `VITE_MQTT_WS_URL` (default `ws://127.0.0.1:9001`).
- `VITE_PERSON_COUNT_TOPIC` (default `deepstream/person_count`).

### DeepStream
- Uses env `MQTT_HOST`, `MQTT_PORT`, `MQTT_TOPIC`, `MQTT_CLIENT_ID`.

## Logs and Runtime Artifacts
- `app/data/logs/deepstream.out.log`
- `app/data/logs/deepstream.err.log`
- `app/data/logs/led_notifier.out.log`
- `app/data/logs/led_notifier.err.log`
- `app/data/runtime/deepstream_auto.txt` (generated config)

## Operational Notes and Gotchas
- The system has no explicit \"stop\" API; closing the DeepStream window stops inference.
- UI re-enables the Start button after the next `/api/status` poll (up to 1s when running).
- LED notifier continues running after DeepStream exits until the server is stopped or a new start kills it.
- `app/deepstream/configs/DeepStream-Yolo/deepstream_app_config_native.txt` is not used by the server; the server always uses the generated config.
- Always keep at least one RTSP URL in `app/config/cameras.txt` to avoid generating an invalid config.
