// Minimal local web server + native DeepStream launcher.
// - Serves static files from ui/dist.
// - POST /api/start starts DeepStream (native config) and LED notifier.
// - GET /api/status returns whether DeepStream is running.

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const {
  buildDeepstreamConfig,
  readCameraList,
  resolveCameras
} = require('./deepstream/config_generator');

const BACKEND_DIR = __dirname;
const BASE_DIR = path.join(__dirname, '..');
const UI_ROOT = path.join(BASE_DIR, 'ui', 'dist');
const LOG_DIR = path.join(BACKEND_DIR, 'data', 'logs');
const RUNTIME_DIR = path.join(BACKEND_DIR, 'data', 'runtime');
const DS_YOLO_DIR = path.join(BACKEND_DIR, 'deepstream', 'configs', 'DeepStream-Yolo');
const PORT = 8081;

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

function ensureDirs() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR, { recursive: true });
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

function timestampLines(data, stream) {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line) stream.write(`[${new Date().toISOString()}] ${line}\n`);
  }
}

function startProcess(name, cmd, args, opts = {}) {
  if (isRunning(name)) return { status: 'already_running', pid: processes[name].pid };
  ensureDirs();
  const outPath = path.join(LOG_DIR, `${name}.out.log`);
  const errPath = path.join(LOG_DIR, `${name}.err.log`);
  const outStream = fs.createWriteStream(outPath, { flags: 'w' });
  const errStream = fs.createWriteStream(errPath, { flags: 'w' });
  const child = spawn(cmd, args, {
    cwd: opts.cwd || BACKEND_DIR,
    env: { ...process.env, ...opts.env },
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (data) => timestampLines(data, outStream));
  child.stderr.on('data', (data) => timestampLines(data, errStream));
  processes[name] = child;
  child.on('exit', (code, signal) => {
    delete processes[name];
    errStream.write(`[${new Date().toISOString()}] [${name}] exited code=${code} signal=${signal}\n`);
    outStream.end();
    errStream.end();
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

async function handleStart(req, res) {
  const results = {};
  // Ensure stale DeepStream instances are not holding the RTSP source.
  killByPattern('deepstream-test5-app');
  killByPattern('person_led_mqtt.py');
  // Let old processes release RTSP sessions and GPIO before respawning.
  await new Promise((r) => setTimeout(r, 500));
  ensureDirs();

  const camerasFile = process.env.CAMERAS_FILE || path.join(BASE_DIR, 'app', 'config', 'cameras.txt');
  const configured = readCameraList(camerasFile);
  const activeUrls = await resolveCameras(configured);
  const useTracker = process.env.USE_TRACKER === '1';
  const configOpts = {
    urls: activeUrls,
    inferConfig: path.join(DS_YOLO_DIR, 'config_infer_primary_yoloV8.txt'),
    useTracker
  };
  if (useTracker) {
    configOpts.trackerConfig = path.join(DS_YOLO_DIR, 'config_tracker_NvDCF_perf.yml');
    configOpts.trackerLib = path.join(BACKEND_DIR, 'deepstream', 'lib', 'libnvds_nvmultiobjecttracker.so');
  }
  const configBody = buildDeepstreamConfig(configOpts);
  const generatedConfig = path.join(RUNTIME_DIR, 'deepstream_auto.txt');
  fs.writeFileSync(generatedConfig, configBody);
  results.deepstream = startProcess(
    'deepstream',
    path.join(BACKEND_DIR, 'deepstream', 'deepstream-test5-app'),
    ['-c', generatedConfig],
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
  res.end(
    JSON.stringify({
      ok: true,
      running: isRunning('deepstream'),
      cameras: { configured: configured.length, active: activeUrls.length },
      results
    })
  );
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

function createServer() {
  return http.createServer((req, res) => {
    const key = `${req.method} ${req.url.split('?')[0]}`;
    if (key === 'POST /api/start') return handleStart(req, res);
    if (key === 'GET /api/status') return handleStatus(req, res);
    serveStatic(req, res);
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Local server running on http://127.0.0.1:${PORT}`);
    console.log(`Serving static files from ${UI_ROOT}`);
    console.log('Endpoints: POST /api/start, GET /api/status');
  });

  process.on('SIGINT', () => {
    Object.values(processes).forEach((child) => child.kill('SIGTERM'));
    process.exit(0);
  });
}

module.exports = {
  createServer,
  getDeepstreamEnv,
  getLedEnv,
  isRunning,
  timestampLines,
  serveStatic,
  handleStart,
  handleStatus,
  processes,
};
