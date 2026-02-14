import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { Writable } from 'stream';

const {
  getDeepstreamEnv,
  getLedEnv,
  isRunning,
  timestampLines,
  createServer,
  processes,
} = require('../../app/server');

// ---------------------------------------------------------------------------
// getDeepstreamEnv
// ---------------------------------------------------------------------------
describe('getDeepstreamEnv', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) delete process.env[key];
    }
    Object.assign(process.env, envBackup);
  });

  it('returns default values when no env vars set', () => {
    delete process.env.DEEPSTREAM_MQTT_HOST;
    delete process.env.MQTT_HOST;
    delete process.env.DEEPSTREAM_MQTT_PORT;
    delete process.env.MQTT_PORT;
    delete process.env.DEEPSTREAM_MQTT_TOPIC;
    delete process.env.MQTT_TOPIC;
    delete process.env.DEEPSTREAM_MQTT_CLIENT_ID;

    const env = getDeepstreamEnv();
    expect(env.MQTT_HOST).toBe('127.0.0.1');
    expect(env.MQTT_PORT).toBe('1883');
    expect(env.MQTT_TOPIC).toBe('deepstream/person_count');
    expect(env.MQTT_CLIENT_ID).toBeUndefined();
  });

  it('prefers DEEPSTREAM_MQTT_HOST over MQTT_HOST', () => {
    process.env.DEEPSTREAM_MQTT_HOST = '10.0.0.1';
    process.env.MQTT_HOST = '192.168.1.1';
    expect(getDeepstreamEnv().MQTT_HOST).toBe('10.0.0.1');
  });

  it('falls back to MQTT_HOST when DEEPSTREAM_MQTT_HOST is unset', () => {
    delete process.env.DEEPSTREAM_MQTT_HOST;
    process.env.MQTT_HOST = '192.168.1.1';
    expect(getDeepstreamEnv().MQTT_HOST).toBe('192.168.1.1');
  });

  it('prefers DEEPSTREAM_MQTT_PORT over MQTT_PORT', () => {
    process.env.DEEPSTREAM_MQTT_PORT = '9999';
    process.env.MQTT_PORT = '8888';
    expect(getDeepstreamEnv().MQTT_PORT).toBe('9999');
  });
});

// ---------------------------------------------------------------------------
// getLedEnv
// ---------------------------------------------------------------------------
describe('getLedEnv', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) delete process.env[key];
    }
    Object.assign(process.env, envBackup);
  });

  it('returns default values when no env vars set', () => {
    delete process.env.LED_MQTT_HOST;
    delete process.env.MQTT_HOST;
    delete process.env.LED_MQTT_PORT;
    delete process.env.MQTT_PORT;
    delete process.env.PERSON_COUNT_TOPIC;
    delete process.env.LED_PIN;
    delete process.env.LED_HOLD_SECONDS;

    const env = getLedEnv();
    expect(env.MQTT_HOST).toBe('127.0.0.1');
    expect(env.MQTT_PORT).toBe('1883');
    expect(env.PERSON_COUNT_TOPIC).toBe('deepstream/person_count');
    expect(env.LED_PIN).toBe('7');
    expect(env.LED_HOLD_SECONDS).toBe('5');
  });

  it('uses custom LED_PIN from env', () => {
    process.env.LED_PIN = '12';
    expect(getLedEnv().LED_PIN).toBe('12');
  });

  it('prefers LED_MQTT_HOST over MQTT_HOST', () => {
    process.env.LED_MQTT_HOST = '10.0.0.2';
    process.env.MQTT_HOST = '192.168.1.1';
    expect(getLedEnv().MQTT_HOST).toBe('10.0.0.2');
  });
});

// ---------------------------------------------------------------------------
// isRunning
// ---------------------------------------------------------------------------
describe('isRunning', () => {
  afterEach(() => {
    // Clean up any test processes
    for (const key of Object.keys(processes)) {
      delete processes[key];
    }
  });

  it('returns false for unknown process name', () => {
    expect(isRunning('nonexistent')).toBe(false);
  });

  it('returns true when process has null exitCode', () => {
    processes.test_proc = { exitCode: null, pid: 999 };
    expect(isRunning('test_proc')).toBe(true);
  });

  it('returns false when process has exitCode', () => {
    processes.test_proc = { exitCode: 0, pid: 999 };
    expect(isRunning('test_proc')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// timestampLines
// ---------------------------------------------------------------------------
describe('timestampLines', () => {
  it('adds ISO timestamp prefix to each non-empty line', () => {
    const chunks = [];
    const stream = new Writable({
      write(chunk, encoding, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });

    timestampLines(Buffer.from('hello\nworld\n'), stream);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T.+\] hello\n$/);
    expect(chunks[1]).toMatch(/^\[\d{4}-\d{2}-\d{2}T.+\] world\n$/);
  });

  it('skips empty lines', () => {
    const chunks = [];
    const stream = new Writable({
      write(chunk, encoding, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });

    timestampLines(Buffer.from('line1\n\nline2\n'), stream);
    expect(chunks).toHaveLength(2);
  });

  it('handles single line without trailing newline', () => {
    const chunks = [];
    const stream = new Writable({
      write(chunk, encoding, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });

    timestampLines(Buffer.from('single'), stream);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('single');
  });
});

// ---------------------------------------------------------------------------
// HTTP Integration Tests
// ---------------------------------------------------------------------------
describe('HTTP server', () => {
  let server;
  let baseUrl;

  beforeEach(async () => {
    server = createServer();
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    // Clean up processes map
    for (const key of Object.keys(processes)) {
      delete processes[key];
    }
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api/status returns running=false when idle', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    const body = await res.json();
    expect(body).toEqual({ running: false, pid: null });
  });

  it('GET /nonexistent returns 404', async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    expect(res.status).toBe(404);
  });

  it('path traversal attempt returns 404', async () => {
    const res = await fetch(`${baseUrl}/../../../etc/passwd`);
    expect(res.status).toBe(404);
  });
});
