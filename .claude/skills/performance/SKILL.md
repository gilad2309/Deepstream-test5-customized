---
name: performance
description: Analyze real-time Jetson performance metrics and provide DeepStream optimization suggestions
argument-hint: "[all | gpu | cpu | thermal | memory | deepstream | network | suggestions]"
disable-model-invocation: true
allowed-tools: Bash, Read
---

# Performance Analysis

Collect and analyze real-time hardware and software performance metrics for the IoT Smart Home
surveillance system running on NVIDIA Jetson Orin Nano.

## Available modules

Each module is a standalone script in `scripts/performance/`:

| Name | Script | What it reports |
|------|--------|-----------------|
| `gpu` | `scripts/performance/gpu.sh` | GPU frequency, utilization %, governor |
| `cpu` | `scripts/performance/cpu.sh` | Per-core frequency, aggregate utilization % (1s sample) |
| `thermal` | `scripts/performance/thermal.sh` | CPU/GPU/SoC/junction temperatures, throttle proximity |
| `memory` | `scripts/performance/memory.sh` | RAM used/available, swap used/available, top memory processes |
| `deepstream` | `scripts/performance/deepstream.sh` | DeepStream process CPU/MEM/FD/uptime, per-stream FPS from logs |
| `network` | `scripts/performance/network.sh` | RX/TX bytes and errors on active network interfaces |
| `suggestions` | `scripts/performance/suggestions.sh` | Optimization recommendations based on current metrics + DeepStream config |

## Routing

- If `$ARGUMENTS` is empty or `all`: run **every** `.sh` script in `scripts/performance/`, one by one, collecting all output. Run `suggestions.sh` last.
- If `$ARGUMENTS` matches a specific module name (e.g. `gpu`, `thermal`, `suggestions`): run only `scripts/performance/$ARGUMENTS.sh`.
- If `$ARGUMENTS` does not match any known script, tell the user which modules are available.

## Execution

Run each script using Bash. Scripts output structured lines prefixed with:
- `[OK]` - metric within normal range
- `[WARN]` - metric approaching a concerning threshold
- `[CRIT]` - metric at a critical level requiring attention
- `[INFO]` - informational metric with no threshold judgment
- `[SUGGEST]` - actionable optimization recommendation (suggestions module only)

## After running

1. Show the raw output from all executed scripts.
2. For each `[WARN]` or `[CRIT]` result, explain the risk and impact on the surveillance system:
   - Thermal warnings: GPU throttling reduces inference FPS; sustained high temps shorten hardware life
   - Memory warnings: Swap pressure causes latency spikes in DeepStream pipeline
   - GPU utilization warnings: Inference bottleneck, frames may be dropped
   - CPU utilization warnings: Node server and MQTT processing may lag
   - FPS warnings: Detection latency increases, person events delayed
   - Network warnings: Packet drops may cause RTSP stream artifacts or disconnections
3. For `[SUGGEST]` results, explain each recommendation in more detail:
   - What the change does technically
   - Expected performance improvement
   - How to apply the change (which file to edit, what to change)
   - Any trade-offs (accuracy vs speed)
4. End with a summary dashboard table showing all key metrics and their status.
