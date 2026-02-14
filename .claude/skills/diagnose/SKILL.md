---
name: diagnose
description: Diagnose the IoT Smart Home surveillance stack health
argument-hint: "[all | mosquitto | cameras | deepstream | led_notifier | logs | ui_build | node_server]"
disable-model-invocation: true
allowed-tools: Bash, Read
---

# System Diagnostics

Run diagnostic checks on the IoT Smart Home surveillance stack.

## Available checks

Each check is a standalone script in `scripts/diagnose/`:

| Name | Script | What it checks |
|------|--------|----------------|
| `mosquitto` | `scripts/diagnose/mosquitto.sh` | Mosquitto service running, ports 1883 and 9001 listening |
| `cameras` | `scripts/diagnose/cameras.sh` | RTSP camera reachability from `app/config/cameras.txt` |
| `deepstream` | `scripts/diagnose/deepstream.sh` | DeepStream process alive |
| `led_notifier` | `scripts/diagnose/led_notifier.sh` | LED notifier process alive |
| `logs` | `scripts/diagnose/logs.sh` | Recent log files for errors |
| `ui_build` | `scripts/diagnose/ui_build.sh` | UI build output exists |
| `node_server` | `scripts/diagnose/node_server.sh` | Node server responding on port 8081 |

## Routing

- If `$ARGUMENTS` is empty or `all`: run **every** `.sh` script in `scripts/diagnose/`, one by one, collecting all output.
- If `$ARGUMENTS` matches a specific component name (e.g. `mosquitto`, `cameras`): run only `scripts/diagnose/$ARGUMENTS.sh`.
- If `$ARGUMENTS` does not match any known script, tell the user which components are available.

## Execution

Run each script using Bash. Scripts output lines prefixed with `[PASS]` or `[FAIL]`.

## After running

1. Show the raw output from all executed scripts.
2. For each `[FAIL]` result, explain what is likely wrong and suggest a specific fix:
   - `mosquitto` fail → suggest `sudo systemctl start mosquitto` or check `/etc/mosquitto/conf.d/ws.conf`
   - `cameras` fail → camera may be offline, wrong IP, or wrong credentials; suggest checking network and `app/config/cameras.txt`
   - `deepstream` fail → not running; user needs to click "Start Surveillance" in the UI or check if the binary exists (`make` to rebuild)
   - `led_notifier` fail → not running; starts automatically with DeepStream via `/api/start`
   - `logs` fail → show the error lines found and explain what they mean
   - `ui_build` fail → suggest running `cd ui && npm run build`
   - `node_server` fail → suggest running `npm run serve` from project root
3. End with a summary table showing each component and its PASS/FAIL status.
