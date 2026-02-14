import { describe, it, expect } from 'vitest';
import { parseCount, MedianWindow } from '../../ui/src/lib/parseCount';

describe('parseCount', () => {
  // JSON object payloads
  it('parses count key from JSON object', () => {
    expect(parseCount('{"count": 5}')).toBe(5);
  });

  it('parses person_count key from JSON object', () => {
    expect(parseCount('{"person_count": 3}')).toBe(3);
  });

  it('parses value key from JSON object', () => {
    expect(parseCount('{"value": 7}')).toBe(7);
  });

  it('parses string value in count key', () => {
    expect(parseCount('{"count": "12"}')).toBe(12);
  });

  it('returns null for empty object', () => {
    expect(parseCount('{}')).toBeNull();
  });

  it('returns null for object with non-numeric string value', () => {
    expect(parseCount('{"count": "abc"}')).toBeNull();
  });

  it('prefers count key over person_count', () => {
    expect(parseCount('{"count": 1, "person_count": 2}')).toBe(1);
  });

  // JSON number/string payloads
  it('parses raw JSON number', () => {
    expect(parseCount('42')).toBe(42);
  });

  it('rounds JSON float', () => {
    expect(parseCount('3.7')).toBe(4);
  });

  it('parses JSON string number', () => {
    expect(parseCount('"99"')).toBe(99);
  });

  it('returns null for JSON string non-number', () => {
    expect(parseCount('"hello"')).toBeNull();
  });

  // Plain string fallback (triggers catch branch)
  it('parses plain number string via catch branch', () => {
    // This is not valid JSON by itself but Number() can parse it
    expect(parseCount('5')).toBe(5);
  });

  // Edge cases
  it('returns null for empty string', () => {
    expect(parseCount('')).toBeNull();
  });

  it('returns null for whitespace-only', () => {
    expect(parseCount('   ')).toBeNull();
  });

  it('returns null for garbage string', () => {
    expect(parseCount('not a number')).toBeNull();
  });

  it('handles zero', () => {
    expect(parseCount('{"count": 0}')).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(parseCount('{"count": -1}')).toBe(-1);
  });

  it('rounds float in value key', () => {
    expect(parseCount('{"value": "3.6"}')).toBe(4);
  });
});

describe('MedianWindow', () => {
  it('returns single value when only one entry', () => {
    const w = new MedianWindow(5000);
    expect(w.push(7, 1000)).toBe(7);
  });

  it('returns median of odd number of values', () => {
    const w = new MedianWindow(5000);
    w.push(1, 1000);
    w.push(5, 2000);
    expect(w.push(3, 3000)).toBe(3);
  });

  it('returns median of even number of values', () => {
    const w = new MedianWindow(5000);
    w.push(1, 1000);
    w.push(2, 2000);
    w.push(4, 3000);
    expect(w.push(6, 4000)).toBe(3); // avg(2,4) = 3
  });

  it('evicts entries older than window', () => {
    const w = new MedianWindow(5000);
    w.push(100, 1000);
    w.push(2, 4000);
    // 8 seconds later, first entry is outside window; second is inside
    expect(w.push(4, 8000)).toBe(3); // median of [2, 4]
  });

  it('clear resets the buffer', () => {
    const w = new MedianWindow(5000);
    w.push(10, 1000);
    w.push(20, 2000);
    w.clear();
    expect(w.push(5, 3000)).toBe(5);
  });

  it('handles all entries expired', () => {
    const w = new MedianWindow(5000);
    w.push(10, 1000);
    // 10 seconds later, old entry is gone
    expect(w.push(3, 11000)).toBe(3);
  });
});
