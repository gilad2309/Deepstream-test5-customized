#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODULE="suggestions"

RUNTIME_CONFIG="${PROJECT_ROOT}/app/data/runtime/deepstream_auto.txt"
DS_YOLO_DIR="${PROJECT_ROOT}/app/deepstream/configs/DeepStream-Yolo"
INFER_CONFIG="${DS_YOLO_DIR}/config_infer_primary_yoloV8.txt"
TRACKER_CONFIG="${DS_YOLO_DIR}/config_tracker_NvDCF_perf.yml"
LOG_FILE="${PROJECT_ROOT}/app/data/logs/deepstream.out.log"

suggestion_count=0
emit() {
    suggestion_count=$((suggestion_count + 1))
    echo "[SUGGEST] $MODULE: $1"
}

# ── Collect current system metrics ──────────────────────────────────────

# GPU load (permille 0-1000)
gpu_load_raw=$(cat /sys/devices/platform/17000000.gpu/load 2>/dev/null || echo "0")

# Junction temperature (millidegrees C)
tj_temp_mc=$(cat /sys/class/thermal/thermal_zone8/temp 2>/dev/null || echo "0")
tj_temp_c=$((tj_temp_mc / 1000))

# Memory usage
mem_total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo "1")
mem_avail_kb=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo "1")
mem_used_pct=$(( (mem_total_kb - mem_avail_kb) * 100 / mem_total_kb ))

# ── Read DeepStream config parameters ──────────────────────────────────

# Inference config
network_mode=""
infer_interval=""
infer_batch_size=""
topk=""
onnx_file=""

if [ -f "$INFER_CONFIG" ]; then
    network_mode=$(grep -E '^network-mode=' "$INFER_CONFIG" 2>/dev/null | head -1 | cut -d= -f2 | tr -d ' ' || true)
    infer_interval=$(grep -E '^interval=' "$INFER_CONFIG" 2>/dev/null | head -1 | cut -d= -f2 | tr -d ' ' || true)
    infer_batch_size=$(grep -E '^batch-size=' "$INFER_CONFIG" 2>/dev/null | head -1 | cut -d= -f2 | tr -d ' ' || true)
    topk=$(grep -E '^topk=' "$INFER_CONFIG" 2>/dev/null | head -1 | cut -d= -f2 | tr -d ' ' || true)
    onnx_file=$(grep -E '^onnx-file=' "$INFER_CONFIG" 2>/dev/null | head -1 | cut -d= -f2 | tr -d ' ' || true)
else
    echo "[WARN] $MODULE: inference config not found at $INFER_CONFIG"
fi

# Runtime config (streammux, sources, tracker)
smux_width=""
smux_height=""
smux_batch=""
source_count="0"
tracker_width=""
tracker_height=""

if [ -f "$RUNTIME_CONFIG" ]; then
    # Extract streammux section values (avoid collisions with tiled-display width/height)
    smux_section=$(grep -A20 '^\[streammux\]' "$RUNTIME_CONFIG" 2>/dev/null || true)
    smux_width=$(echo "$smux_section" | grep -m1 '^width=' | cut -d= -f2 | tr -d ' ' || true)
    smux_height=$(echo "$smux_section" | grep -m1 '^height=' | cut -d= -f2 | tr -d ' ' || true)
    smux_batch=$(echo "$smux_section" | grep -m1 '^batch-size=' | cut -d= -f2 | tr -d ' ' || true)

    source_count=$(grep -c '^\[source[0-9]' "$RUNTIME_CONFIG" 2>/dev/null || echo "0")

    tracker_section=$(grep -A10 '^\[tracker\]' "$RUNTIME_CONFIG" 2>/dev/null || true)
    tracker_width=$(echo "$tracker_section" | grep -m1 '^tracker-width=' | cut -d= -f2 | tr -d ' ' || true)
    tracker_height=$(echo "$tracker_section" | grep -m1 '^tracker-height=' | cut -d= -f2 | tr -d ' ' || true)
else
    echo "[WARN] $MODULE: runtime config not found at $RUNTIME_CONFIG"
fi

# Tracker config (feature level)
feature_img_level=""
if [ -f "$TRACKER_CONFIG" ]; then
    feature_img_level=$(grep -E 'featureImgSizeLevel:' "$TRACKER_CONFIG" 2>/dev/null | head -1 | awk '{print $2}' || true)
fi

# FPS from log (last data line)
first_fps_int=0
if [ -f "$LOG_FILE" ]; then
    last_fps_line=$(grep '\*\*PERF:' "$LOG_FILE" 2>/dev/null | grep -v 'FPS [0-9]' | tail -1 || true)
    if [ -n "$last_fps_line" ]; then
        first_fps=$(echo "$last_fps_line" | grep -oP '[0-9]+\.[0-9]+' | head -1 || echo "0")
        first_fps_int=${first_fps%%.*}
    fi
fi

# ── Summary line ───────────────────────────────────────────────────────

gpu_pct=$((gpu_load_raw / 10))
echo "[INFO] $MODULE: analyzing config vs metrics (GPU: ${gpu_pct}%, tj: ${tj_temp_c}C, RAM: ${mem_used_pct}%, streams: ${source_count})"

# ── Rule engine ────────────────────────────────────────────────────────

# RULE 1: FP32 -> FP16
if [ "$network_mode" = "0" ]; then
    emit "Using FP32 precision (network-mode=0). Switch to FP16 (network-mode=2) in config_infer_primary_yoloV8.txt for ~40% GPU load reduction with minimal accuracy loss. Delete the .engine file to force rebuild on next start."
fi

# RULE 2: High GPU + inference every frame
if [ "$gpu_load_raw" -ge 750 ] && [ -n "$infer_interval" ] && [ "$infer_interval" -le 1 ] 2>/dev/null; then
    emit "GPU at ${gpu_pct}% with inference interval=${infer_interval} (every frame). Increase interval to 2-3 in config_infer_primary_yoloV8.txt to skip frames and reduce GPU load proportionally. Trade-off: slightly higher detection latency."
fi

# RULE 3: Full HD streammux with moderate+ GPU
if [ "$gpu_load_raw" -ge 600 ] && [ -n "$smux_width" ] && [ "$smux_width" -ge 1920 ] 2>/dev/null; then
    emit "Streammux at ${smux_width}x${smux_height} with GPU at ${gpu_pct}%. Reduce to 1280x720 in config_generator.js (streammuxWidth/streammuxHeight) for ~44% fewer pixels. Trade-off: smaller objects harder to detect."
fi

# RULE 4: Inference batch-size mismatch with camera count
if [ -n "$infer_batch_size" ] && [ -n "$source_count" ] && [ "$source_count" -gt 0 ] 2>/dev/null; then
    if [ "$infer_batch_size" != "$source_count" ] 2>/dev/null; then
        emit "Inference batch-size=${infer_batch_size} but ${source_count} camera(s) configured. Set batch-size=${source_count} in config_infer_primary_yoloV8.txt and delete the .engine file to rebuild for optimal GPU utilization."
    fi
fi

# RULE 5: Tracker feature image size level too high under GPU load
if [ "$gpu_load_raw" -ge 700 ] && [ -n "$feature_img_level" ] && [ "$feature_img_level" -ge 3 ] 2>/dev/null; then
    emit "Tracker featureImgSizeLevel=${feature_img_level} with GPU at ${gpu_pct}%. Reduce to 1 or 2 in config_tracker_NvDCF_perf.yml for lower tracker GPU usage. Trade-off: slightly less robust re-identification."
fi

# RULE 6: Thermal throttling proximity
if [ "$tj_temp_c" -ge 85 ]; then
    emit "Junction temperature at ${tj_temp_c}C (throttle at 95C). Reduce GPU workload: increase inference interval, lower resolution, or switch to FP16/INT8. Also check case ventilation and ambient temperature."
fi

# RULE 7: Memory pressure
if [ "$mem_used_pct" -ge 80 ]; then
    suggest_text="RAM at ${mem_used_pct}% used. Consider: "
    if [ "$network_mode" = "0" ]; then
        suggest_text="${suggest_text}switch to FP16 (smaller engine footprint), "
    fi
    suggest_text="${suggest_text}reduce topk from ${topk:-300} to 100, reduce maxTargetsPerStream in tracker config."
    emit "$suggest_text"
fi

# RULE 8: Model size vs GPU headroom
if echo "$onnx_file" | grep -qi "yolo11s" 2>/dev/null; then
    if [ "$gpu_load_raw" -ge 800 ]; then
        emit "Using yolo11s (small) model with GPU at ${gpu_pct}%. Consider yolo11n (nano) for ~40% less compute at some accuracy cost. Update onnx-file and delete .engine in config_infer_primary_yoloV8.txt."
    elif [ "$gpu_load_raw" -lt 400 ]; then
        emit "Using yolo11s (small) model with GPU at only ${gpu_pct}%. You have headroom for yolo11m (medium) for better detection accuracy. Update onnx-file and delete .engine in config_infer_primary_yoloV8.txt."
    fi
fi

# RULE 9: Zero FPS while DeepStream is running
if [ "$first_fps_int" -eq 0 ] 2>/dev/null && pgrep -f deepstream-test5-app >/dev/null 2>&1; then
    emit "DeepStream running but FPS is 0. This is likely a camera/RTSP connectivity issue, not a tuning problem. Run: /diagnose cameras"
fi

# RULE 10: Tracker resolution under GPU load
if [ "$gpu_load_raw" -ge 700 ] && [ -n "$tracker_width" ] && [ "$tracker_width" -ge 640 ] 2>/dev/null; then
    emit "Tracker at ${tracker_width}x${tracker_height} with GPU at ${gpu_pct}%. Reduce to 480x288 or 320x192 in config_generator.js (tracker-width/tracker-height) for lower tracking overhead."
fi

# ── Summary ────────────────────────────────────────────────────────────

if [ "$suggestion_count" -eq 0 ]; then
    echo "[OK] $MODULE: no optimization suggestions -- system appears well-tuned"
else
    echo "[INFO] $MODULE: ${suggestion_count} suggestion(s) generated"
fi
