#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODULE="cpu"

# Governor
governor=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo "unknown")

# Per-core frequencies
max_freq_khz=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq 2>/dev/null || echo "0")
max_freq_mhz=$((max_freq_khz / 1000))

core_freqs=""
for cpu_dir in /sys/devices/system/cpu/cpu[0-9]*; do
    [ -d "$cpu_dir/cpufreq" ] || continue
    cpu_name=$(basename "$cpu_dir")
    freq_khz=$(cat "$cpu_dir/cpufreq/scaling_cur_freq" 2>/dev/null || echo "0")
    freq_mhz=$((freq_khz / 1000))
    core_freqs="${core_freqs}${cpu_name}:${freq_mhz} "
done
echo "[INFO] $MODULE: frequencies (MHz, max=$max_freq_mhz): ${core_freqs}(governor: $governor)"

# CPU utilization: two-sample delta from /proc/stat (1 second apart)
# cpu line format: cpu user nice system idle iowait irq softirq steal guest guest_nice
read_cpu_total() {
    local line
    line=$(head -1 /proc/stat)
    local vals
    vals=(${line#cpu })
    local total=0
    for v in "${vals[@]}"; do total=$((total + v)); done
    # idle = idle + iowait (fields 3 and 4, 0-indexed)
    local idle=$(( ${vals[3]} + ${vals[4]} ))
    echo "$total $idle"
}

sample1=$(read_cpu_total)
sleep 1
sample2=$(read_cpu_total)

total1=$(echo "$sample1" | awk '{print $1}')
idle1=$(echo "$sample1" | awk '{print $2}')
total2=$(echo "$sample2" | awk '{print $1}')
idle2=$(echo "$sample2" | awk '{print $2}')

total_delta=$((total2 - total1))
idle_delta=$((idle2 - idle1))

if [ "$total_delta" -gt 0 ]; then
    busy_delta=$((total_delta - idle_delta))
    cpu_pct=$(( (busy_delta * 1000) / total_delta ))
    cpu_pct_int=$((cpu_pct / 10))
    cpu_pct_frac=$((cpu_pct % 10))
    cpu_display="${cpu_pct_int}.${cpu_pct_frac}"
else
    cpu_display="N/A"
    cpu_pct=0
fi

# Count cores
core_count=$(nproc 2>/dev/null || echo "6")

if [ "$cpu_pct" -ge 900 ]; then
    echo "[CRIT] $MODULE: utilization ${cpu_display}% -- CPU saturated ($core_count cores)"
    exit 1
elif [ "$cpu_pct" -ge 750 ]; then
    echo "[WARN] $MODULE: utilization ${cpu_display}% -- high load ($core_count cores)"
else
    echo "[OK] $MODULE: utilization ${cpu_display}% ($core_count cores)"
fi
