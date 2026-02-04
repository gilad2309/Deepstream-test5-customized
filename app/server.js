// Minimal local web server + native DeepStream launcher.
// - Serves static files from ui/dist.
// - POST /api/start starts DeepStream (native config) and LED notifier.
// - GET /api/status returns whether DeepStream is running.

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

const BACKEND_DIR = __dirname;
const BASE_DIR = path.join(__dirname, '..');
const UI_ROOT = path.join(BASE_DIR, 'ui', 'dist');
const LOG_DIR = path.join(BACKEND_DIR, 'data', 'logs');
const PORT = 8081;
const CONFIG_NATIVE = path.join(
  BACKEND_DIR,
  'deepstream',
  'configs/DeepStream-Yolo/deepstream_app_config_native.txt'
);

const processes = {};

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function isRunning(name) {
  const proc = processes[name];
  return Boolean(proc && proc.exitCode === null);
}

function killByPattern(pattern) {
  try {
    spawnSync('pkill', ['-f', pattern], { stdio: 'ignore' });
  } catch {
    // Best-effort cleanup.
  }
}

function startProcess(name, cmd, args, opts = {}) {
  if (isRunning(name)) return { status: 'already_running', pid: processes[name].pid };
  ensureLogDir();
  const stdout = fs.openSync(path.join(LOG_DIR, `${name}.out.log`), 'a');
  const stderr = fs.openSync(path.join(LOG_DIR, `${name}.err.log`), 'a');
  const child = spawn(cmd, args, {
    cwd: opts.cwd || BACKEND_DIR,
    env: { ...process.env, ...opts.env },
    detached: false,
    stdio: ['ignore', stdout, stderr]
  });
  processes[name] = child;
  child.on('exit', (code, signal) => {
    delete processes[name];
    const msg = `[${name}] exited code=${code} signal=${signal}\n`;
    fs.appendFileSync(path.join(LOG_DIR, `${name}.err.log`), msg);
  });
  return { status: 'started', pid: child.pid };
}

function getDeepstreamEnv() {
  return {
    MQTT_HOST:
      process.env.DEEPSTREAM_MQTT_HOST || process.env.MQTT_HOST || '127.0.0.1',
    MQTT_PORT:
      process.env.DEEPSTREAM_MQTT_PORT || process.env.MQTT_PORT || '1883',
    MQTT_TOPIC:
      process.env.DEEPSTREAM_MQTT_TOPIC || process.env.MQTT_TOPIC || 'deepstream/person_count',
    MQTT_CLIENT_ID: process.env.DEEPSTREAM_MQTT_CLIENT_ID || undefined
  };
}

function getLedEnv() {
  return {
    MQTT_HOST: process.env.LED_MQTT_HOST || process.env.MQTT_HOST || '127.0.0.1',
    MQTT_PORT: process.env.LED_MQTT_PORT || process.env.MQTT_PORT || '1883',
    PERSON_COUNT_TOPIC: process.env.PERSON_COUNT_TOPIC || 'deepstream/person_count',
    LED_PIN: process.env.LED_PIN || '7',
    LED_HOLD_SECONDS: process.env.LED_HOLD_SECONDS || '5'
  };
}

function handleStart(req, res) {
  const results = {};
  // Ensure stale DeepStream instances are not holding the RTSP source.
  killByPattern('deepstream-test5-app');
  // Ensure stale LED notifier isn't holding GPIO.
  killByPattern('person_led_mqtt.py');
  results.deepstream = startProcess(
    'deepstream',
    path.join(BACKEND_DIR, 'deepstream', 'deepstream-test5-app'),
    ['-c', CONFIG_NATIVE],
    {
      // Run from config directory so all relative paths resolve correctly.
      cwd: path.join(BACKEND_DIR, 'deepstream', 'configs', 'DeepStream-Yolo'),
      env: getDeepstreamEnv()
    }
  );
  results.led_notifier = startProcess(
    'led_notifier',
    'python3',
    [path.join(BACKEND_DIR, 'mqtt', 'person_led_mqtt.py')],
    { env: getLedEnv() }
  );
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, running: isRunning('deepstream'), results }));
}

function handleStatus(req, res) {
  const running = isRunning('deepstream');
  const pid = running ? processes.deepstream.pid : null;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ running, pid }));
}

function serveStatic(req, res) {
  let pathname = req.url.split('?')[0];
  if (pathname === '/') pathname = 'index.html';
  const requestPath = pathname.replace(/^\/+/, '');
  const filePath = path.join(UI_ROOT, requestPath);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(UI_ROOT)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    const ext = path.extname(resolved).toLowerCase();
    const ct = mime[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct });
    fs.createReadStream(resolved).pipe(res);
    return;
  }
  res.writeHead(404);
  res.end('Not found');
}

const server = http.createServer((req, res) => {
  const key = `${req.method} ${req.url.split('?')[0]}`;
  if (key === 'POST /api/start') return handleStart(req, res);
  if (key === 'GET /api/status') return handleStatus(req, res);
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Local server running on http://127.0.0.1:${PORT}`);
  console.log(`Serving static files from ${UI_ROOT}`);
  console.log('Endpoints: POST /api/start, GET /api/status');
});

process.on('SIGINT', () => {
  Object.values(processes).forEach((child) => child.kill('SIGTERM'));
  process.exit(0);
});
