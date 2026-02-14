import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  computeGrid,
  buildDeepstreamConfig,
  readCameraList,
  probeRtsp,
  resolveCameras,
} = require('../../app/deepstream/config_generator');

// ---------------------------------------------------------------------------
// computeGrid
// ---------------------------------------------------------------------------
describe('computeGrid', () => {
  it('returns 1x1 for count=0', () => {
    expect(computeGrid(0)).toEqual({ rows: 1, columns: 1 });
  });

  it('returns 1x1 for count=1', () => {
    expect(computeGrid(1)).toEqual({ rows: 1, columns: 1 });
  });

  it('returns 1x2 for count=2', () => {
    expect(computeGrid(2)).toEqual({ rows: 1, columns: 2 });
  });

  it('returns 2x2 for count=3', () => {
    expect(computeGrid(3)).toEqual({ rows: 2, columns: 2 });
  });

  it('returns 2x2 for count=4', () => {
    expect(computeGrid(4)).toEqual({ rows: 2, columns: 2 });
  });

  it('returns correct grid for count=5', () => {
    const grid = computeGrid(5);
    expect(grid.rows * grid.columns).toBeGreaterThanOrEqual(5);
    expect(grid.columns).toBe(3);
  });

  it('returns 3x3 for count=9', () => {
    expect(computeGrid(9)).toEqual({ rows: 3, columns: 3 });
  });

  it('returns 4x4 for count=16', () => {
    expect(computeGrid(16)).toEqual({ rows: 4, columns: 4 });
  });
});

// ---------------------------------------------------------------------------
// buildDeepstreamConfig
// ---------------------------------------------------------------------------
describe('buildDeepstreamConfig', () => {
  const baseOpts = {
    urls: ['rtsp://cam1:554/stream'],
    inferConfig: '/path/to/infer.txt',
    trackerConfig: '/path/to/tracker.yml',
    trackerLib: '/path/to/tracker.so',
  };

  it('generates config with a single source', () => {
    const config = buildDeepstreamConfig(baseOpts);
    expect(config).toContain('[source0]');
    expect(config).toContain('uri=rtsp://cam1:554/stream');
    expect(config).toContain('batch-size=1');
    expect(config).toContain('rows=1');
    expect(config).toContain('columns=1');
  });

  it('generates multiple source sections', () => {
    const config = buildDeepstreamConfig({
      ...baseOpts,
      urls: ['rtsp://cam1:554/s', 'rtsp://cam2:554/s', 'rtsp://cam3:554/s'],
    });
    expect(config).toContain('[source0]');
    expect(config).toContain('[source1]');
    expect(config).toContain('[source2]');
    expect(config).toContain('batch-size=3');
    expect(config).toContain('rows=2');
    expect(config).toContain('columns=2');
  });

  it('uses batch-size=1 for empty url list', () => {
    const config = buildDeepstreamConfig({ ...baseOpts, urls: [] });
    expect(config).toContain('batch-size=1');
  });

  it('includes inference path', () => {
    const config = buildDeepstreamConfig(baseOpts);
    expect(config).toContain('config-file=/path/to/infer.txt');
  });

  it('omits tracker section by default (useTracker=false)', () => {
    const config = buildDeepstreamConfig(baseOpts);
    expect(config).not.toContain('[tracker]');
    expect(config).not.toContain('ll-config-file=');
    expect(config).not.toContain('ll-lib-file=');
  });

  it('includes tracker section when useTracker=true', () => {
    const config = buildDeepstreamConfig({ ...baseOpts, useTracker: true });
    expect(config).toContain('[tracker]');
    expect(config).toContain('ll-config-file=/path/to/tracker.yml');
    expect(config).toContain('ll-lib-file=/path/to/tracker.so');
  });

  it('applies custom tiled dimensions', () => {
    const config = buildDeepstreamConfig({
      ...baseOpts,
      tiledWidth: 1280,
      tiledHeight: 720,
    });
    expect(config).toMatch(/\[tiled-display\][\s\S]*width=1280/);
    expect(config).toMatch(/\[tiled-display\][\s\S]*height=720/);
  });

  it('applies custom streammux dimensions', () => {
    const config = buildDeepstreamConfig({
      ...baseOpts,
      streammuxWidth: 1280,
      streammuxHeight: 720,
    });
    expect(config).toMatch(/\[streammux\][\s\S]*width=1280/);
    expect(config).toMatch(/\[streammux\][\s\S]*height=720/);
  });

  it('does not add num-sources to avoid duplicating RTSP sessions', () => {
    const config = buildDeepstreamConfig({
      ...baseOpts,
      urls: ['rtsp://a:554/s', 'rtsp://b:554/s'],
    });
    const lines = config.split('\n');
    const numSourcesLines = lines.filter((l) => l.includes('num-sources='));
    expect(numSourcesLines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// readCameraList (mocked fs)
// ---------------------------------------------------------------------------
describe('readCameraList', () => {
  const fs = require('fs');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array for missing file', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(readCameraList('/nonexistent')).toEqual([]);
  });

  it('parses lines from a file', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'rtsp://cam1:554/s\nrtsp://cam2:554/s\n'
    );
    expect(readCameraList('/cameras.txt')).toEqual([
      'rtsp://cam1:554/s',
      'rtsp://cam2:554/s',
    ]);
  });

  it('filters blank lines', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'rtsp://cam1:554/s\n\n\nrtsp://cam2:554/s\n'
    );
    expect(readCameraList('/cameras.txt')).toHaveLength(2);
  });

  it('filters comment lines', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      '# a comment\nrtsp://cam1:554/s\n# another\n'
    );
    expect(readCameraList('/cameras.txt')).toEqual(['rtsp://cam1:554/s']);
  });

  it('trims whitespace from lines', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      '  rtsp://cam1:554/s  \n'
    );
    expect(readCameraList('/cameras.txt')).toEqual(['rtsp://cam1:554/s']);
  });
});

// ---------------------------------------------------------------------------
// probeRtsp (mocked net)
// ---------------------------------------------------------------------------
describe('probeRtsp', () => {
  const net = require('net');
  const { EventEmitter } = require('events');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockSocket(event) {
    const socket = new EventEmitter();
    socket.setTimeout = vi.fn();
    socket.destroy = vi.fn();
    vi.spyOn(net, 'connect').mockImplementation(() => {
      process.nextTick(() => socket.emit(event));
      return socket;
    });
    return socket;
  }

  it('resolves true on successful connect', async () => {
    mockSocket('connect');
    expect(await probeRtsp('rtsp://cam:554/stream')).toBe(true);
  });

  it('resolves false on timeout', async () => {
    mockSocket('timeout');
    expect(await probeRtsp('rtsp://cam:554/stream')).toBe(false);
  });

  it('resolves false on error', async () => {
    mockSocket('error');
    expect(await probeRtsp('rtsp://cam:554/stream')).toBe(false);
  });

  it('resolves false for invalid URL', async () => {
    expect(await probeRtsp('not a url')).toBe(false);
  });

  it('uses port from URL when specified', async () => {
    mockSocket('connect');
    await probeRtsp('rtsp://cam:8554/stream');
    expect(net.connect).toHaveBeenCalledWith(8554, 'cam');
  });

  it('defaults to port 554 when not specified', async () => {
    mockSocket('connect');
    await probeRtsp('rtsp://cam/stream');
    expect(net.connect).toHaveBeenCalledWith(554, 'cam');
  });
});

// ---------------------------------------------------------------------------
// resolveCameras (mock net.connect to control probeRtsp behavior)
// ---------------------------------------------------------------------------
describe('resolveCameras', () => {
  const net = require('net');
  const { EventEmitter } = require('events');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockSocketSequence(results) {
    let callIndex = 0;
    vi.spyOn(net, 'connect').mockImplementation(() => {
      const socket = new EventEmitter();
      socket.setTimeout = vi.fn();
      socket.destroy = vi.fn();
      const result = results[callIndex++] ?? false;
      process.nextTick(() => socket.emit(result ? 'connect' : 'error'));
      return socket;
    });
  }

  it('returns all urls when all reachable', async () => {
    mockSocketSequence([true, true]);
    const urls = ['rtsp://a:554/s', 'rtsp://b:554/s'];
    expect(await resolveCameras(urls)).toEqual(urls);
  });

  it('returns only reachable urls', async () => {
    mockSocketSequence([false, true]);
    expect(await resolveCameras(['rtsp://a:554/s', 'rtsp://b:554/s'])).toEqual([
      'rtsp://b:554/s',
    ]);
  });

  it('falls back to first url when none reachable', async () => {
    mockSocketSequence([false, false]);
    expect(await resolveCameras(['rtsp://a:554/s', 'rtsp://b:554/s'])).toEqual([
      'rtsp://a:554/s',
    ]);
  });

  it('returns empty array for empty input', async () => {
    expect(await resolveCameras([])).toEqual([]);
  });
});
