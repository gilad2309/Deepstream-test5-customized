/**
 * E2E test: Click "Start Surveillance" and observe system behavior.
 *
 * Checks:
 * 1. UI loads and shows the Start Surveillance button
 * 2. Clicking the button triggers the /api/start call
 * 3. Server responds, DeepStream process spawns
 * 4. UI transitions to "Running" state
 * 5. Person count updates arrive via MQTT
 * 6. DeepStream native X11 window opens (checked via wmctrl/xdotool)
 */

import { chromium } from 'playwright';
import { execSync } from 'child_process';

const BASE_URL = 'http://127.0.0.1:8081';
const TIMEOUT_MS = 30_000;

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

async function run() {
  const results = {
    uiLoaded: false,
    buttonFound: false,
    buttonClicked: false,
    apiStartResponse: null,
    uiTransitionedToRunning: false,
    personCountReceived: false,
    personCountValue: null,
    deepstreamProcessAlive: false,
    deepstreamPid: null,
    nativeWindowDetected: false,
    mqttConnected: false,
    errors: [],
  };

  log('Launching Chromium (headed mode)...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  // Listen for console messages from the page
  page.on('console', (msg) => log(`[BROWSER] ${msg.type()}: ${msg.text()}`));

  try {
    // --- Step 1: Load UI ---
    log('Navigating to UI...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15_000 });
    results.uiLoaded = true;
    log('UI loaded successfully.');

    // Take a screenshot of initial state
    await page.screenshot({ path: 'tests/e2e/screenshots/01_initial_state.png' });
    log('Screenshot: initial state saved.');

    // --- Step 2: Find the Start button ---
    const startButton = page.locator('button', { hasText: 'Start Surveillance' });
    await startButton.waitFor({ state: 'visible', timeout: 5_000 });
    results.buttonFound = true;
    log('Start Surveillance button found and visible.');

    // Check initial state pills
    const idlePill = page.locator('.pill', { hasText: 'Idle' });
    const mqttPill = page.locator('.pill', { hasText: /MQTT/ });
    if (await idlePill.isVisible()) log('Status pill shows: Idle');
    if (await mqttPill.isVisible()) {
      const mqttText = await mqttPill.textContent();
      log(`MQTT pill shows: ${mqttText}`);
      if (mqttText.includes('connected')) results.mqttConnected = true;
    }

    // --- Step 3: Click Start Surveillance ---
    log('Clicking "Start Surveillance" button...');

    // Intercept the /api/start response
    const startResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/start'),
      { timeout: TIMEOUT_MS }
    );

    await startButton.click();
    results.buttonClicked = true;
    log('Button clicked. Waiting for /api/start response...');

    // Take screenshot while starting
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/e2e/screenshots/02_starting.png' });
    log('Screenshot: starting state saved.');

    // Wait for /api/start response
    const startResp = await startResponsePromise;
    const startBody = await startResp.json();
    results.apiStartResponse = startBody;
    log(`/api/start response: ${JSON.stringify(startBody)}`);

    if (!startBody.ok) {
      results.errors.push(`/api/start returned ok=false: ${JSON.stringify(startBody)}`);
      log('WARNING: /api/start indicated failure!');
    }

    // --- Step 4: Check UI transitions to Running ---
    log('Waiting for UI to show "Running" state...');
    const runningPill = page.locator('.pill.on', { hasText: 'Running' });
    try {
      await runningPill.waitFor({ state: 'visible', timeout: 10_000 });
      results.uiTransitionedToRunning = true;
      log('UI transitioned to Running state.');
    } catch {
      results.errors.push('UI did not transition to Running within 10s');
      log('WARNING: UI did not show Running state within timeout.');
    }

    await page.screenshot({ path: 'tests/e2e/screenshots/03_running.png' });
    log('Screenshot: running state saved.');

    // --- Step 5: Check DeepStream process ---
    log('Checking for DeepStream process...');
    try {
      const psOutput = execSync('pgrep -fa deepstream-test5-app', { timeout: 3000 }).toString().trim();
      if (psOutput) {
        results.deepstreamProcessAlive = true;
        const pidMatch = psOutput.match(/^(\d+)/);
        if (pidMatch) results.deepstreamPid = parseInt(pidMatch[1]);
        log(`DeepStream process alive: PID ${results.deepstreamPid}`);
      }
    } catch {
      results.errors.push('DeepStream process not found');
      log('WARNING: DeepStream process not found.');
    }

    // --- Step 6: Wait for person count updates ---
    // TensorRT engine loading on Jetson can take 60-120s, wait up to 180s
    const PERSON_COUNT_TIMEOUT = 180_000;
    log(`Waiting for person count to update (up to ${PERSON_COUNT_TIMEOUT/1000}s, TensorRT engine may be loading)...`);
    const countEl = page.locator('.count');

    // Poll periodically so we can log progress
    const pollStart = Date.now();
    let countReceived = false;
    while (Date.now() - pollStart < PERSON_COUNT_TIMEOUT) {
      const countText = (await countEl.textContent())?.trim();
      if (countText && countText !== '—' && countText !== '--') {
        results.personCountReceived = true;
        results.personCountValue = countText;
        countReceived = true;
        log(`Person count received: ${results.personCountValue}`);
        break;
      }
      // Log progress every 15s
      const elapsed = Math.round((Date.now() - pollStart) / 1000);
      if (elapsed % 15 === 0 && elapsed > 0) {
        // Check if deepstream is still alive
        let dsAlive = false;
        try {
          execSync('pgrep -f deepstream-test5-app', { timeout: 2000 });
          dsAlive = true;
        } catch {}
        log(`  ...waiting (${elapsed}s elapsed, DeepStream ${dsAlive ? 'alive' : 'DEAD'}, count="${countText}")`);
        if (!dsAlive) {
          log('DeepStream process died. Checking logs...');
          try {
            const errTail = execSync('tail -5 app/data/logs/deepstream.err.log 2>/dev/null || true', { timeout: 2000 }).toString().trim();
            if (errTail) log(`  Last errors: ${errTail}`);
          } catch {}
          break;
        }
      }
      await page.waitForTimeout(1000);
    }
    if (!countReceived) {
      const countText = (await countEl.textContent())?.trim();
      results.errors.push(`Person count did not update within ${PERSON_COUNT_TIMEOUT/1000}s (still shows: "${countText}")`);
      log(`WARNING: Person count did not update. Current value: "${countText}"`);
    }

    await page.screenshot({ path: 'tests/e2e/screenshots/04_with_count.png' });
    log('Screenshot: count state saved.');

    // --- Step 7: Check for native DeepStream X11 window ---
    log('Checking for native DeepStream X11 window...');

    // Helper to detect DeepStream window via multiple methods
    const detectWindow = () => {
      // Method 1: search by PID
      if (results.deepstreamPid) {
        try {
          const byPid = execSync(
            `DISPLAY=:1 XAUTHORITY=/run/user/1000/gdm/Xauthority xdotool search --pid ${results.deepstreamPid} 2>/dev/null || true`,
            { timeout: 3000 }
          ).toString().trim();
          if (byPid) {
            const wids = byPid.split('\n');
            log(`Found ${wids.length} window(s) for PID ${results.deepstreamPid}: ${byPid}`);
            // Get window names
            for (const wid of wids) {
              try {
                const name = execSync(
                  `DISPLAY=:1 XAUTHORITY=/run/user/1000/gdm/Xauthority xdotool getwindowname ${wid} 2>/dev/null || true`,
                  { timeout: 2000 }
                ).toString().trim();
                log(`  Window ${wid}: "${name}"`);
              } catch {}
            }
            return wids;
          }
        } catch {}
      }
      // Method 2: search by common DeepStream window names
      const names = ['NVIDIA', 'DeepStream', 'DSTEST', 'deepstream', 'ds-test'];
      for (const name of names) {
        try {
          const byName = execSync(
            `DISPLAY=:1 XAUTHORITY=/run/user/1000/gdm/Xauthority xdotool search --name "${name}" 2>/dev/null || true`,
            { timeout: 2000 }
          ).toString().trim();
          if (byName) {
            log(`Found window by name "${name}": ${byName}`);
            return byName.split('\n');
          }
        } catch {}
      }
      return null;
    };

    let dsWindows = detectWindow();
    if (dsWindows) {
      results.nativeWindowDetected = true;
      log(`DeepStream X11 window detected!`);
      // Try to take a screenshot of the native window using import
      try {
        const wid = dsWindows[0];
        execSync(
          `DISPLAY=:1 XAUTHORITY=/run/user/1000/gdm/Xauthority import -window ${wid} tests/e2e/screenshots/06_deepstream_window.png 2>/dev/null || true`,
          { timeout: 5000 }
        );
        log('Screenshot of DeepStream native window saved.');
      } catch { log('Could not capture DeepStream window screenshot.'); }
    } else {
      log('No DeepStream window found on first check.');
    }

    // If not found yet and process is alive, wait and retry
    if (!results.nativeWindowDetected && results.deepstreamProcessAlive) {
      log('Waiting 15s for native window to appear...');
      await page.waitForTimeout(15_000);
      dsWindows = detectWindow();
      if (dsWindows) {
        results.nativeWindowDetected = true;
        log(`DeepStream window appeared after wait!`);
        try {
          const wid = dsWindows[0];
          execSync(
            `DISPLAY=:1 XAUTHORITY=/run/user/1000/gdm/Xauthority import -window ${wid} tests/e2e/screenshots/06_deepstream_window.png 2>/dev/null || true`,
            { timeout: 5000 }
          );
          log('Screenshot of DeepStream native window saved.');
        } catch { log('Could not capture DeepStream window screenshot.'); }
      } else {
        log('Still no DeepStream window found.');
      }
    }

    // Final screenshot
    await page.screenshot({ path: 'tests/e2e/screenshots/05_final.png' });
    log('Screenshot: final state saved.');

    // Check DeepStream logs for any errors
    log('Checking DeepStream logs...');
    try {
      const errLog = execSync('tail -20 app/data/logs/deepstream.err.log 2>/dev/null || echo "(no error log)"', { timeout: 3000 }).toString();
      if (errLog.trim() && errLog.trim() !== '(no error log)') {
        log(`DeepStream stderr (last 20 lines):\n${errLog}`);
      }
      const outLog = execSync('tail -20 app/data/logs/deepstream.out.log 2>/dev/null || echo "(no output log)"', { timeout: 3000 }).toString();
      if (outLog.trim() && outLog.trim() !== '(no output log)') {
        log(`DeepStream stdout (last 20 lines):\n${outLog}`);
      }
    } catch {}

  } catch (err) {
    results.errors.push(`Fatal: ${err.message}`);
    log(`FATAL ERROR: ${err.message}`);
    await page.screenshot({ path: 'tests/e2e/screenshots/error.png' }).catch(() => {});
  }

  // --- Summary ---
  console.log('\n' + '='.repeat(60));
  console.log('  E2E TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`  UI loaded:                ${results.uiLoaded ? 'PASS' : 'FAIL'}`);
  console.log(`  Button found:             ${results.buttonFound ? 'PASS' : 'FAIL'}`);
  console.log(`  Button clicked:           ${results.buttonClicked ? 'PASS' : 'FAIL'}`);
  console.log(`  API /start ok:            ${results.apiStartResponse?.ok ? 'PASS' : 'FAIL'}`);
  console.log(`  UI -> Running:            ${results.uiTransitionedToRunning ? 'PASS' : 'FAIL'}`);
  console.log(`  DeepStream alive:         ${results.deepstreamProcessAlive ? 'PASS' : 'FAIL'} (PID: ${results.deepstreamPid || 'N/A'})`);
  console.log(`  Person count received:    ${results.personCountReceived ? 'PASS' : 'FAIL'} (value: ${results.personCountValue ?? 'N/A'})`);
  console.log(`  Native window detected:   ${results.nativeWindowDetected ? 'PASS' : 'FAIL'}`);
  console.log(`  MQTT connected:           ${results.mqttConnected ? 'PASS' : 'FAIL'}`);
  if (results.errors.length > 0) {
    console.log(`\n  ERRORS (${results.errors.length}):`);
    results.errors.forEach((e, i) => console.log(`    ${i + 1}. ${e}`));
  }
  console.log('='.repeat(60) + '\n');

  // Keep browser open for 5s so user can see the result
  log('Keeping browser open for 5 seconds...');
  await page.waitForTimeout(5000);

  await browser.close();
  log('Browser closed. Test complete.');

  // Exit with appropriate code
  const passed = results.uiLoaded && results.buttonClicked && results.deepstreamProcessAlive;
  process.exit(passed ? 0 : 1);
}

run().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
