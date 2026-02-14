# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IoT Smart Home surveillance system using NVIDIA DeepStream 7.1 for real-time person detection. The system runs native DeepStream video inference, publishes person counts via MQTT, and provides a minimal web UI with GPIO LED notifications on NVIDIA Jetson hardware.

## Build and Development Commands

### Initial Setup
```bash
# Install UI dependencies and build
cd ui
npm install
npm run build
cd ..

# Build DeepStream native application
make
```

### Running the Application
```bash
# Start the full stack (Node server + UI)
npm run serve
# Access UI at http://127.0.0.1:8081
```

### DeepStream Development
```bash
# Rebuild DeepStream app after C code changes
make

# Clean build artifacts
make clean

# The binary is output to: app/deepstream/deepstream-test5-app
```

### UI Development
```bash
cd ui

# Development mode with hot reload
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### Running Tests
```bash
# Run all tests (backend JS + UI + Python)
npm run test:all

# Backend tests only (config_generator, server)
npm test

# UI tests only (parseCount, api, config)
npm run test:ui

# Python tests only (person_led_mqtt, command_listener)
npm run test:py
```

**Test frameworks:** Vitest (JS/TS), pytest (Python)

**Test file locations (all under `tests/`):**
- Backend JS: `tests/js/config_generator.test.js`, `tests/js/server.test.js`
- UI: `tests/ui/parseCount.test.ts`, `tests/ui/api.test.ts`, `tests/ui/config.test.ts`
- Python: `tests/python/test_person_led_mqtt.py`, `tests/python/test_command_listener.py`

## Architecture

### Runtime State Model

**System States:**
- `OFF`: Server not running, UI unavailable
- `IDLE`: Server running, DeepStream not running
- `STARTING`: Server spawning DeepStream and LED notifier processes
- `RUNNING`: DeepStream process alive, native window visible
- `FAILED`: DeepStream failed to start or exited

**UI States:**
- `IDLE`: Start button enabled, count shows `--`
- `STARTING`: Start button disabled, waiting for response
- `RUNNING`: Start button disabled, count updates from MQTT
- `ERROR`: Error banner shown, returns to IDLE when resolved

**State Transitions:**
- `OFF → IDLE`: Run `npm run serve`
- `IDLE → STARTING`: User clicks "Start Surveillance"
- `STARTING → RUNNING`: DeepStream spawns successfully
- `RUNNING → FAILED`: DeepStream exits or crashes
- `FAILED → STARTING`: User clicks "Start Surveillance" again

### High-Level Flow
1. User clicks "Start Surveillance" in web UI
2. Node server ([app/server.js](app/server.js)) probes cameras from `app/config/cameras.txt`
3. Config generator ([app/deepstream/config_generator.js](app/deepstream/config_generator.js)) creates runtime DeepStream config
4. DeepStream C app ([app/deepstream/src/deepstream_test5_app_main.c](app/deepstream/src/deepstream_test5_app_main.c)) launches with YOLO inference
5. Person counts published to MQTT topic `deepstream/person_count`
6. Web UI subscribes via MQTT WebSocket and displays real-time count
7. LED notifier ([app/mqtt/person_led_mqtt.py](app/mqtt/person_led_mqtt.py)) blinks GPIO LED when count >= 1

### Component Stack

**DeepStream Native Application** (C/C++)
- Entry: [app/deepstream/src/deepstream_test5_app_main.c](app/deepstream/src/deepstream_test5_app_main.c)
- Runs YOLO object detection via NVIDIA TensorRT
- Publishes person counts to MQTT using libmosquitto
- Built with GStreamer pipeline
- Config files in [app/deepstream/configs/DeepStream-Yolo/](app/deepstream/configs/DeepStream-Yolo/)
- MQTT payload format: `{"type":"person_count","count":<int>,"stream_id":<int>,"ts":<ms>}`
- Person counts are smoothed via a sliding-window median filter (configurable via `SMOOTH_WINDOW` env var, default 5 frames)
- Pipeline flow: RTSP sources → nvstreammux (batching) → nvinfer (YOLO) → [optional: tracker (NvDCF, enabled via `USE_TRACKER=1`)] → nvosd (bounding boxes) → nvmultistreamtiler (grid layout) → X11 window sink

**Node.js Server** ([app/server.js](app/server.js))
- HTTP server on port 8081
- Serves static UI from `ui/dist`
- API endpoints:
  - `POST /api/start` - Launches DeepStream and LED notifier; returns `{"ok":<bool>,"running":<bool>,"cameras":<array>,"results":<array>}`
  - `GET /api/status` - Returns `{"running":<bool>,"pid":<int|null>}`
- Auto-generates DeepStream config based on reachable cameras
- Manages child processes (DeepStream, LED notifier)
- Logs to `app/data/logs/`

**Config Generator** ([app/deepstream/config_generator.js](app/deepstream/config_generator.js))
- Reads camera list from `app/config/cameras.txt`
- Probes RTSP endpoints for reachability (1.2s timeout per camera via TCP connect)
- Uses only reachable URLs; if none reachable, falls back to first configured URL
- Computes optimal grid layout (rows × columns)
- Sets `streammux batch-size` to number of sources with padding enabled
- Generates complete DeepStream config at `app/data/runtime/deepstream_auto.txt`
- Injects tracker, inference, and display settings
- **Important**: Empty camera list yields config with zero sources; DeepStream will fail. Always keep at least one RTSP URL in `app/config/cameras.txt`

**Web UI** (Preact + TypeScript)
- Entry: [ui/src/main.tsx](ui/src/main.tsx), [ui/src/App.tsx](ui/src/App.tsx)
- Single-page app with Start button and person count display
- MQTT WebSocket client subscribes to `deepstream/person_count`
- Polls `/api/status` every 1s when running, 5s when idle
- Button disabled while starting or running
- Count resets to `--` when `running=false`
- Built with Vite + Preact preset
- Styled with [ui/src/styles.css](ui/src/styles.css)
- **Note**: UI does not display video; native DeepStream window is the only video output

**LED Notifier** ([app/mqtt/person_led_mqtt.py](app/mqtt/person_led_mqtt.py))
- Python MQTT client using paho-mqtt
- Subscribes to `deepstream/person_count`
- Controls Jetson GPIO pin via Jetson.GPIO library
- `BLINK_MIN_COUNT` hardcoded to `1` - blinks for any count >= 1
- Blinks for `LED_HOLD_SECONDS` after detection
- Self-test blink on startup
- **Failure modes**: If GPIO access fails, script exits. If MQTT is down, connect-retry loop prevents count reception.

**MQTT Broker** (Mosquitto)
- System service (systemd)
- TCP: `127.0.0.1:1883` (native MQTT)
- WebSocket: `127.0.0.1:9001` (for browser clients)
- Config: `/etc/mosquitto/conf.d/ws.conf`

## Key Configuration

### Environment Variables
- `DEEPSTREAM_MQTT_HOST` / `MQTT_HOST` - MQTT broker host (default: 127.0.0.1)
- `DEEPSTREAM_MQTT_PORT` / `MQTT_PORT` - MQTT broker port (default: 1883)
- `DEEPSTREAM_MQTT_TOPIC` - Person count topic (default: deepstream/person_count)
- `CAMERAS_FILE` - Path to camera list file (default: app/config/cameras.txt)
- `LED_PIN` - GPIO pin for LED (default: 7, BOARD mode)
- `LED_HOLD_SECONDS` - LED blink duration after detection (default: 5)
- `USE_TRACKER` - Enable NvDCF object tracker in DeepStream pipeline (default: 0 = disabled, set to 1 to enable)
- `SMOOTH_WINDOW` - Sliding-window size for person count smoothing (default: 5, odd values 1-31; even values rounded up)
- `VITE_MQTT_WS_URL` - MQTT WebSocket URL for UI (default: ws://127.0.0.1:9001)

### Camera Configuration
Edit [app/config/cameras.txt](app/config/cameras.txt) with one RTSP URL per line:
```
rtsp://admin:password@192.168.1.10:554/stream1
rtsp://admin:password@192.168.1.11:554/stream1
```
The system auto-probes reachability before starting DeepStream.

### Runtime Files
- DeepStream config: `app/data/runtime/deepstream_auto.txt` (auto-generated)
- DeepStream logs: `app/data/logs/deepstream.out.log`, `deepstream.err.log`
- LED notifier logs: `app/data/logs/led_notifier.out.log`, `led_notifier.err.log`

## Important Constraints

### DeepStream Binary Not in Git
The compiled DeepStream binary ([app/deepstream/deepstream-test5-app](app/deepstream/deepstream-test5-app)) is gitignored. Always run `make` after cloning or pulling C code changes.

### NVIDIA Jetson Hardware Required
- DeepStream requires NVIDIA GPU (Jetson Orin Nano target platform)
- LED notifier requires Jetson.GPIO library
- CUDA 12.6 required for compilation

### Process Management
The server kills stale DeepStream/LED processes before starting:
- `pkill -f deepstream-test5-app` - Frees RTSP sources
- `pkill -f person_led_mqtt.py` - Releases GPIO pins

### Working Directory Matters
DeepStream must run from [app/deepstream/configs/DeepStream-Yolo/](app/deepstream/configs/DeepStream-Yolo/) so relative paths in config files resolve correctly. The server handles this via `cwd` option in spawn.

### No Explicit Stop API
- The system has no `POST /api/stop` endpoint
- To stop DeepStream: close the native X11 window manually
- Closing the window terminates the DeepStream process
- UI re-enables Start button after next `/api/status` poll (up to 1s delay)
- LED notifier continues running after DeepStream exits until server stops or new start kills it


## Testing and Debugging

### Check MQTT Broker
```bash
# Verify Mosquitto is running
systemctl status mosquitto

# Check listening ports (should show 1883 and 9001)
sudo ss -lntp | grep mosquitto

# Subscribe to person count topic
mosquitto_sub -h 127.0.0.1 -p 1883 -t "deepstream/person_count"
```

### Monitor Logs
```bash
# Watch DeepStream output
tail -f app/data/logs/deepstream.out.log

# Watch LED notifier
tail -f app/data/logs/led_notifier.out.log

# View errors
tail -f app/data/logs/*.err.log
```

### Test Camera Connectivity
```bash
# Probe RTSP camera (replace with your URL)
ffprobe -rtsp_transport tcp rtsp://admin:password@192.168.1.10:554/stream1
```

### Validate Generated Config
```bash
# Check auto-generated DeepStream config
cat app/data/runtime/deepstream_auto.txt
```

## Code Modification Guidelines

### When Modifying DeepStream C Code
- Edit files in [app/deepstream/src/](app/deepstream/src/)
- Update [Makefile](Makefile) if adding new source files
- Rebuild with `make` before testing
- Check MQTT publish logic in `deepstream_test5_app_main.c`

### When Modifying Node Server
- Edit [app/server.js](app/server.js)
- No build step required (restart server)
- Process spawn logic handles child lifecycle
- Config generator in separate module for testability
- Server exports functions via `module.exports` for testing; `server.listen` is guarded by `require.main === module`
- Run `npm test` to verify changes

### When Modifying UI
- Edit files in [ui/src/](ui/src/)
- Run `npm run dev` for hot reload during development
- Build with `npm run build` before committing
- MQTT client logic in [ui/src/App.tsx](ui/src/App.tsx)
- Payload parsing logic in [ui/src/lib/parseCount.ts](ui/src/lib/parseCount.ts)
- Run `npm run test:ui` to verify changes

### When Modifying Config Generation
- Edit [app/deepstream/config_generator.js](app/deepstream/config_generator.js)
- Test camera probing with various RTSP URLs
- Ensure grid computation handles edge cases (1, 2, 4, 9 cameras)
- Runtime config written to `app/data/runtime/deepstream_auto.txt`
- Run `npm test` to verify — all 5 exported functions have unit tests

### When Modifying Python MQTT Scripts
- Edit [app/mqtt/person_led_mqtt.py](app/mqtt/person_led_mqtt.py) or [app/mqtt/command_listener.py](app/mqtt/command_listener.py)
- GPIO initialization is deferred to `init_gpio()` (called from `main()`), keeping pure functions importable without Jetson hardware
- Run `npm run test:py` to verify changes

## Diagnostics

### `/diagnose` Skill
A Claude Code skill that runs modular health checks on the surveillance stack.

**Usage in Claude Code:**
```
/diagnose all            # Run all checks
/diagnose mosquitto      # Check only Mosquitto broker
/diagnose cameras        # Check only camera reachability
/diagnose deepstream     # Check only DeepStream process
/diagnose led_notifier   # Check only LED notifier process
/diagnose logs           # Check only recent logs for errors
/diagnose ui_build       # Check only UI build output
/diagnose node_server    # Check only Node server
```

**Standalone usage via SSH:**
```bash
# Run a single check
bash scripts/diagnose/mosquitto.sh

# Run all checks
for script in scripts/diagnose/*.sh; do bash "$script"; done
```

Scripts live in [scripts/diagnose/](scripts/diagnose/). Each prints `[PASS]` or `[FAIL]` and exits 0 or 1. Skill definition: [.claude/skills/diagnose/SKILL.md](.claude/skills/diagnose/SKILL.md).

### `/performance` Skill
A Claude Code skill that collects real-time Jetson hardware metrics and provides optimization suggestions for the DeepStream inference pipeline. All metrics are read from sysfs (no sudo required).

**Usage in Claude Code:**
```
/performance all            # Run all checks + suggestions
/performance gpu            # GPU frequency and utilization
/performance cpu            # CPU frequency and utilization (1s sample)
/performance thermal        # Temperature and throttle proximity
/performance memory         # RAM and swap usage
/performance deepstream     # DeepStream process stats + FPS from logs
/performance network        # Network interface stats
/performance suggestions    # Config-aware optimization recommendations
```

**Standalone usage via SSH:**
```bash
# Run a single check
bash scripts/performance/gpu.sh

# Run all checks
for script in scripts/performance/*.sh; do bash "$script"; done
```

Scripts live in [scripts/performance/](scripts/performance/). Each prints lines prefixed with `[OK]`, `[WARN]`, `[CRIT]`, `[INFO]`, or `[SUGGEST]`. The `suggestions` module correlates live metrics with DeepStream config parameters to recommend specific tuning changes (precision mode, inference interval, resolution, batch-size, tracker settings, model size). Skill definition: [.claude/skills/performance/SKILL.md](.claude/skills/performance/SKILL.md).

## Telegram Integration (Optional)
The project includes optional Telegram bot integration in [telegram_bot/](telegram_bot/) and [app/mqtt/command_listener.py](app/mqtt/command_listener.py) for remote control. See [telegram_bot/README.md](telegram_bot/README.md) if needed.

## Maintaining This File

**IMPORTANT**: When making changes to the project, you MUST update this CLAUDE.md file to reflect:
- New components, files, or architectural changes
- Modified build/run commands or workflows
- New environment variables or configuration options
- Changed dependencies or system requirements
- New debugging procedures or common issues discovered
- Updated file paths or directory structure changes

After completing a task that affects project structure, commands, or architecture:
1. Review this CLAUDE.md for accuracy
2. Update outdated sections
3. Add new relevant information
4. Remove obsolete instructions

Keep updates concise and focused on information that future Claude Code sessions need to work effectively.
