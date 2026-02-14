/**
 * Rolling time-window median filter.
 * Collects values over `windowMs` and returns the median on each push.
 */
export class MedianWindow {
  private buf: { value: number; ts: number }[] = [];
  constructor(private windowMs: number = 5000) {}

  push(value: number, now: number = Date.now()): number {
    this.buf.push({ value, ts: now });
    const cutoff = now - this.windowMs;
    this.buf = this.buf.filter((e) => e.ts > cutoff);
    return this.median();
  }

  private median(): number {
    const sorted = this.buf.map((e) => e.value).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }
    return sorted[mid];
  }

  clear(): void {
    this.buf = [];
  }
}

/**
 * Parse a person-count value from an MQTT payload string.
 * Accepts JSON objects with count/person_count/value keys,
 * raw JSON numbers, or plain numeric strings.
 * Returns the rounded integer count, or null if unparseable.
 */
export function parseCount(payload: string): number | null {
  const text = payload.trim();
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    if (typeof data === 'number') return Math.round(data);
    if (typeof data === 'string') {
      const num = Number(data);
      return Number.isFinite(num) ? Math.round(num) : null;
    }
    if (data && typeof data === 'object') {
      for (const key of ['count', 'person_count', 'value']) {
        const value = data[key];
        if (typeof value === 'number') return Math.round(value);
        if (typeof value === 'string') {
          const num = Number(value);
          if (Number.isFinite(num)) return Math.round(num);
        }
      }
    }
  } catch {
    const num = Number(text);
    return Number.isFinite(num) ? Math.round(num) : null;
  }
  return null;
}
