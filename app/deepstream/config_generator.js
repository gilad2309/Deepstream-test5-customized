const fs = require('fs');
const net = require('net');
const path = require('path');

function readCameraList(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function probeRtsp(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolve(false);
      return;
    }
    const port = parsed.port ? Number(parsed.port) : 554;
    const host = parsed.hostname;
    if (!host) {
      resolve(false);
      return;
    }
    const socket = net.connect(port, host);
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

function computeGrid(count) {
  if (count <= 1) return { rows: 1, columns: 1 };
  if (count === 2) return { rows: 1, columns: 2 };
  if (count <= 4) return { rows: 2, columns: 2 };
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return { rows, columns };
}

function buildDeepstreamConfig({
  urls,
  inferConfig,
  trackerConfig,
  trackerLib,
  tiledWidth = 1920,
  tiledHeight = 1080,
  streammuxWidth = 1920,
  streammuxHeight = 1080
}) {
  const count = Math.max(1, urls.length);
  const { rows, columns } = computeGrid(count);
  const sources = urls
    .map((url, index) => {
      const lines = [
        `[source${index}]`,
        'enable=1',
        'type=4',
        `uri=${url}`,
        index === 0 ? `num-sources=${count}` : null,
        'gpu-id=0',
        'cudadec-memtype=0',
        '',
        ''
      ].filter(Boolean);
      return lines.join('\n');
    })
    .join('\n');

  return [
    '[application]',
    'enable-perf-measurement=1',
    'perf-measurement-interval-sec=5',
    '',
    '[tiled-display]',
    'enable=1',
    `rows=${rows}`,
    `columns=${columns}`,
    `width=${tiledWidth}`,
    `height=${tiledHeight}`,
    'gpu-id=0',
    'nvbuf-memory-type=0',
    '',
    sources,
    '[sink0]',
    'enable=1',
    'type=2',
    'sync=0',
    'gpu-id=0',
    'nvbuf-memory-type=0',
    '',
    '[sink1]',
    'enable=0',
    '',
    '[osd]',
    'enable=1',
    'gpu-id=0',
    'border-width=3',
    'text-size=15',
    'text-color=1;1;1;1;',
    'text-bg-color=0.3;0.3;0.3;1',
    'font=Serif',
    'show-clock=0',
    'clock-x-offset=800',
    'clock-y-offset=820',
    'clock-text-size=12',
    'clock-color=1;0;0;0',
    'nvbuf-memory-type=0',
    '',
    '[streammux]',
    'gpu-id=0',
    'live-source=1',
    `batch-size=${count}`,
    'batched-push-timeout=10000   # lower batching delay to trim latency (µs)',
    `width=${streammuxWidth}`,
    `height=${streammuxHeight}`,
    'enable-padding=1',
    'nvbuf-memory-type=0',
    '',
    '[primary-gie]',
    'enable=1',
    'gpu-id=0',
    'gie-unique-id=1',
    'nvbuf-memory-type=0',
    `config-file=${inferConfig}`,
    '',
    '[tracker]',
    'enable=1',
    'tracker-width=640',
    'tracker-height=384',
    `ll-lib-file=${trackerLib}`,
    `ll-config-file=${trackerConfig}`,
    'gpu-id=0',
    '',
    '[tests]',
    'file-loop=0',
    ''
  ].join('\n');
}

async function resolveCameras(urls) {
  const reachable = [];
  for (const url of urls) {
    // eslint-disable-next-line no-await-in-loop
    if (await probeRtsp(url)) reachable.push(url);
  }
  return reachable.length ? reachable : urls.slice(0, 1);
}

module.exports = {
  buildDeepstreamConfig,
  computeGrid,
  probeRtsp,
  readCameraList,
  resolveCameras
};
