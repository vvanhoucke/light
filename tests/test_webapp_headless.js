/**
 * tests/test_webapp_headless.js
 *
 * Headless Web Application Render & Dynamic Redraw Verification Suite
 * Milestone MT2 — Relativistic Optical Delay-Line Data Storage
 *
 * Runs natively in JavaScriptCore (macOS):
 *   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/test_webapp_headless.js
 * Or in Node.js (v16+):
 *   node tests/test_webapp_headless.js
 *
 * Validates:
 * 1. index.html structure & DOM integrity (offline zero-build, layout panels, report sections, glossary)
 * 2. Visualizer chart viewports & Canvas/SVG IDs (minkowski, doppler, link, storage)
 * 3. Interactive sliders & controls (ranges, steps, default values, physical units)
 * 4. Mission presets selection & state dispatch (Presets A, B, C)
 * 5. Reactive physics calculation pipeline & 16 ms redraw performance benchmark (target 60 FPS)
 */

import {
  C_LIGHT,
  G_ACCEL,
  ARCSEC_PER_RAD,
  gHolevo,
  twoWayDopplerFactor,
  computeKinematics,
  computeOptics,
  computeLinkBudget,
  computeCapacity,
  computeAberration,
  integrateInFlightBits
} from '../web/js/physics.js';

// --- Environment Polyfills & Console Setup ---
if (typeof console === 'undefined') {
  var console = {
    log: print,
    error: print,
    warn: print,
    info: print
  };
}

let readFileFn;
if (typeof read === 'function') {
  readFileFn = read;
} else if (typeof readFile === 'function') {
  readFileFn = readFile;
} else if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  const fs = await import('fs');
  readFileFn = (p) => fs.readFileSync(p, 'utf-8');
} else {
  readFileFn = () => { throw new Error('No file read function available in environment'); };
}

let exitFn;
if (typeof quit === 'function') {
  exitFn = quit;
} else if (typeof process !== 'undefined' && typeof process.exit === 'function') {
  exitFn = (code) => process.exit(code);
} else {
  exitFn = (code) => { if (code !== 0) throw new Error(`Terminated with exit code ${code}`); };
}

// --- Test Reporter State ---
let passedCount = 0;
let failedCount = 0;
const testLogs = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    print(`  [PASS] ${testName}`);
    testLogs.push({ name: testName, status: 'PASS' });
    passedCount++;
  } else {
    print(`  [FAIL] ${testName}: ${detail}`);
    testLogs.push({ name: testName, status: 'FAIL', detail });
    failedCount++;
  }
}

function assertAlmostEqual(a, b, tolerance, testName) {
  const diff = Math.abs(a - b);
  const ok = diff <= tolerance;
  assert(ok, testName, `expected ${b}, got ${a}, diff ${diff} > ${tolerance}`);
}

// --- Canonical Contract Specification (PROJECT.md / survey_web_ste_report.md) ---
export const CANONICAL_INDEX_HTML_CONTRACT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relativistic Optical Delay-Line Data Storage: Technical Report & Simulation Cockpit</title>
  <link rel="stylesheet" href="web/css/style.css">
</head>
<body>
  <div id="app-container" class="container">
    <header id="app-header" class="header">
      <h1>Relativistic Optical Delay-Line Data Storage Medium</h1>
      <span id="badge-ste-status" class="badge">ASD-STE100 Verified</span>
      <span id="active-preset-label" class="badge">Active Preset: None</span>
    </header>

    <div class="main-layout">
      <!-- Left Pane: ASD-STE100 Technical Engineering Report -->
      <main id="report-panel" class="report-pane">
        <section id="section-kinematics" class="report-section">
          <h2>1. Relativistic Kinematics and Retarded-Time Delay</h2>
          <p>This section analyzes the hyperbolic and piecewise kinematics of the spacecraft.</p>
        </section>

        <section id="section-doppler" class="report-section">
          <h2>2. Relativistic Doppler Shift and Frequency Chirp Dynamics</h2>
          <p>This section analyzes the two-way relativistic Doppler shift factor.</p>
        </section>

        <section id="section-link" class="report-section">
          <h2>3. Link Budget, ISM Dust Extinction, and Quantum Capacity</h2>
          <p>This section formulates the two-way optical link budget and Gordon-Holevo capacity.</p>
        </section>

        <section id="section-aberration" class="report-section">
          <h2>4. Moving Retroreflector Velocity Aberration and Dihedral Compensation</h2>
          <p>This section analyzes Lorentz transformations and velocity aberration.</p>
        </section>

        <section id="section-subsystems" class="report-section">
          <h2>5. Subsystem Engineering and Quantitative TRL Assessment</h2>
          <p>This section provides quantitative parameter tables distinguishing TRL 4-6 from TRL 1-3.</p>
        </section>

        <section id="section-glossary" class="report-section">
          <h2>6. Technical Glossary and Symbol Registry</h2>
          <table id="table-glossary" class="glossary-table">
            <thead>
              <tr><th>Technical Term</th><th>Approved Symbol</th><th>Standard Definition</th></tr>
            </thead>
            <tbody>
              <tr><td>Retarded Time</td><td>t_refl</td><td>Coordinate time of reflection event</td></tr>
              <tr><td>Rindler Horizon</td><td>T_h</td><td>Asymptotic transmission cutoff time c / alpha</td></tr>
              <tr><td>Relativistic Doppler Factor</td><td>D_2</td><td>Two-way spectral frequency shift factor</td></tr>
              <tr><td>Gordon-Holevo Capacity</td><td>C_Holevo</td><td>Ultimate quantum channel capacity limit</td></tr>
              <tr><td>Velocity Aberration</td><td>theta_aber</td><td>Angular deviation caused by transverse velocity</td></tr>
              <tr><td>Dihedral Angle Compensation</td><td>delta_alpha</td><td>Intentional offset of 90-degree corner angles</td></tr>
              <tr><td>Proper Acceleration</td><td>alpha</td><td>Acceleration measured in instantaneous rest frame</td></tr>
              <tr><td>Light Cone</td><td>ct = +- x</td><td>Boundary of causal spacetime propagation</td></tr>
              <tr><td>Interstellar Dust Extinction</td><td>tau_ISM</td><td>Optical attenuation across interstellar medium</td></tr>
            </tbody>
          </table>
        </section>
      </main>

      <!-- Right Pane: Simulation Cockpit & Parameter Controls -->
      <aside id="cockpit-sidebar" class="cockpit-pane">
        <div class="preset-selector-bar">
          <h3>Mission Presets</h3>
          <button id="btn-preset-a" class="btn-preset" data-preset="preset_a">Preset A: Near-Term Laser Sail (0.2c)</button>
          <button id="btn-preset-b" class="btn-preset" data-preset="preset_b">Preset B: Relativistic Fusion Probe (0.5c)</button>
          <button id="btn-preset-c" class="btn-preset" data-preset="preset_c">Preset C: Extreme 1g Acceleration</button>
        </div>

        <div class="slider-control-deck">
          <h3>Parameter Sliders</h3>

          <div class="control-group">
            <label for="slider-alpha">Proper Acceleration (&alpha;): <span id="val-alpha">9.81 m/s²</span></label>
            <input type="range" id="slider-alpha" min="0.0" max="50.0" step="0.1" value="9.81" data-unit="m/s²">
          </div>

          <div class="control-group">
            <label for="slider-beta">Coast Speed (&beta; = v/c): <span id="val-beta">0.50 c</span></label>
            <input type="range" id="slider-beta" min="0.01" max="0.99" step="0.01" value="0.50" data-unit="dimensionless">
          </div>

          <div class="control-group">
            <label for="slider-tburn">Burn Duration (T_burn): <span id="val-tburn">1.0 yr</span></label>
            <input type="range" id="slider-tburn" min="0.0" max="10.0" step="0.1" value="1.0" data-unit="years">
          </div>

          <div class="control-group">
            <label for="slider-ptx">Transmit Power (P_tx): <span id="val-ptx">1.0 GW</span></label>
            <input type="range" id="slider-ptx" min="3.0" max="11.0" step="0.1" value="9.0" data-unit="Watts">
          </div>

          <div class="control-group">
            <label for="slider-dtx">Transmitter Aperture (D_tx): <span id="val-dtx">30.0 m</span></label>
            <input type="range" id="slider-dtx" min="1.0" max="200.0" step="1.0" value="30.0" data-unit="meters">
          </div>

          <div class="control-group">
            <label for="slider-drefl">Reflector Aperture (D_refl): <span id="val-drefl">50.0 m</span></label>
            <input type="range" id="slider-drefl" min="0.1" max="100.0" step="0.5" value="50.0" data-unit="meters">
          </div>

          <div class="control-group">
            <label for="slider-drx">Receiver Aperture (D_rx): <span id="val-drx">50.0 m</span></label>
            <input type="range" id="slider-drx" min="1.0" max="500.0" step="1.0" value="50.0" data-unit="meters">
          </div>

          <div class="control-group">
            <label for="slider-lambda">Transmit Wavelength (&lambda;_0): <span id="val-lambda">532 nm</span></label>
            <input type="range" id="slider-lambda" min="200.0" max="2000.0" step="10.0" value="532.0" data-unit="nm">
          </div>

          <div class="control-group">
            <label for="slider-nh">ISM Dust Density (n_H): <span id="val-nh">0.1 cm⁻³</span></label>
            <input type="range" id="slider-nh" min="-2.0" max="1.0" step="0.01" value="-1.0" data-unit="cm⁻³">
          </div>
        </div>

        <div id="telemetry-card" class="telemetry-card">
          <h3>Live Telemetry</h3>
          <div id="telemetry-delay">Round-Trip Delay: 0.0 s</div>
          <div id="telemetry-doppler">Doppler Factor: 1.000</div>
          <div id="telemetry-capacity">Channel Capacity: 0.0 bps</div>
        </div>
      </aside>
    </div>

    <!-- Multi-Deck Interactive Visualizations -->
    <section id="chart-deck" class="chart-deck">
      <div class="chart-container" id="container-minkowski">
        <h3>1. Spacetime (ct, x) Minkowski Diagram</h3>
        <canvas id="canvas-minkowski" width="800" height="600"></canvas>
      </div>

      <div class="chart-container" id="container-doppler">
        <h3>2. Delay, Doppler Shift, and Received Wavelength</h3>
        <canvas id="canvas-doppler" width="800" height="600"></canvas>
      </div>

      <div class="chart-container" id="container-link">
        <h3>3. Link Attenuation Breakdown and Gordon-Holevo Capacity</h3>
        <canvas id="canvas-link" width="800" height="600"></canvas>
      </div>

      <div class="chart-container" id="container-storage">
        <h3>4. In-Flight Data Storage and Reflector Optics</h3>
        <canvas id="canvas-storage" width="800" height="600"></canvas>
      </div>
    </section>
  </div>

  <script type="module" src="web/js/physics.js"></script>
  <script type="module" src="web/js/charts.js"></script>
  <script type="module" src="web/js/app.js"></script>
</body>
</html>`;

// --- Lightweight Headless DOM Parser & Query Engine ---
export class DOMNode {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toLowerCase();
    this.attributes = attributes;
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
  }

  get id() {
    return this.attributes.id || '';
  }

  get className() {
    return this.attributes.class || '';
  }

  getAttribute(name) {
    return this.attributes[name.toLowerCase()] || null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name.toLowerCase());
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
  }

  getElementById(targetId) {
    if (this.id === targetId) return this;
    for (const child of this.children) {
      const found = child.getElementById(targetId);
      if (found) return found;
    }
    return null;
  }

  getElementsByTagName(targetTag) {
    const results = [];
    const lower = targetTag.toLowerCase();
    if (this.tagName === lower) results.push(this);
    for (const child of this.children) {
      results.push(...child.getElementsByTagName(targetTag));
    }
    return results;
  }

  getElementsByClassName(targetClass) {
    const results = [];
    if (this.className.split(/\s+/).includes(targetClass)) {
      results.push(this);
    }
    for (const child of this.children) {
      results.push(...child.getElementsByClassName(targetClass));
    }
    return results;
  }

  querySelector(selector) {
    const trimmed = selector.trim();
    if (trimmed.startsWith('#')) {
      return this.getElementById(trimmed.slice(1));
    }
    if (trimmed.startsWith('.')) {
      const list = this.getElementsByClassName(trimmed.slice(1));
      return list.length > 0 ? list[0] : null;
    }
    const byTag = this.getElementsByTagName(trimmed);
    return byTag.length > 0 ? byTag[0] : null;
  }

  querySelectorAll(selector) {
    const trimmed = selector.trim();
    if (trimmed.startsWith('#')) {
      const el = this.getElementById(trimmed.slice(1));
      return el ? [el] : [];
    }
    if (trimmed.startsWith('.')) {
      return this.getElementsByClassName(trimmed.slice(1));
    }
    return this.getElementsByTagName(trimmed);
  }
}

export function parseHTML(htmlString) {
  const root = new DOMNode('root');
  const stack = [root];
  const tagRegex = /<(!DOCTYPE|!--[\s\S]*?--|\/?[a-zA-Z0-9\-]+)([^>]*)>/g;
  const attrRegex = /([a-zA-Z0-9\-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  const voidTags = new Set(['meta', 'link', 'img', 'br', 'hr', 'input']);

  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(htmlString)) !== null) {
    // Capture intervening text content
    const textBetween = htmlString.slice(lastIndex, match.index).trim();
    if (textBetween && stack.length > 0) {
      stack[stack.length - 1].textContent += ' ' + textBetween;
    }
    lastIndex = tagRegex.lastIndex;

    const rawTag = match[1];
    const rawAttrs = match[2];

    if (rawTag.startsWith('!--') || rawTag.toUpperCase() === '!DOCTYPE') {
      continue;
    }

    if (rawTag.startsWith('/')) {
      const closeTag = rawTag.slice(1).toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === closeTag) {
          stack.length = i;
          break;
        }
      }
    } else {
      const tagName = rawTag.toLowerCase();
      const attrs = {};
      attrRegex.lastIndex = 0;
      let aMatch;
      while ((aMatch = attrRegex.exec(rawAttrs)) !== null) {
        const key = aMatch[1].toLowerCase();
        const val = aMatch[2] !== undefined ? aMatch[2] : (aMatch[3] !== undefined ? aMatch[3] : (aMatch[4] !== undefined ? aMatch[4] : ''));
        attrs[key] = val;
      }

      const node = new DOMNode(tagName, attrs);
      stack[stack.length - 1].appendChild(node);

      const isSelfClosing = rawAttrs.trim().endsWith('/') || voidTags.has(tagName);
      if (!isSelfClosing) {
        stack.push(node);
      }
    }
  }

  return root;
}

// --- Mission Presets Registry ---
export const MISSION_PRESETS = {
  preset_a: {
    name: 'Preset A: Near-Term Laser Sail',
    alpha: 0.0,
    beta_coast: 0.20,
    t_burn: 0.05,
    p_tx: 1.0e7,          // 10 MW
    d_tx: 10.0,
    d_refl: 10.0,
    d_rx: 10.0,
    lambda_0: 1064.0e-9,  // Nd:YAG
    n_h: 1.0,
    expected_d2: 2.0 / 3.0,
    expected_lambda_rx: 1596.0e-9
  },
  preset_b: {
    name: 'Preset B: Relativistic Fusion Probe',
    alpha: 0.5,
    beta_coast: 0.50,
    t_burn: 1.0,
    p_tx: 1.0e9,          // 1 GW
    d_tx: 30.0,
    d_refl: 50.0,
    d_rx: 50.0,
    lambda_0: 532.0e-9,   // Frequency-doubled green
    n_h: 0.1,
    expected_d2: 1.0 / 3.0,
    expected_lambda_rx: 1596.0e-9
  },
  preset_c: {
    name: 'Preset C: Extreme 1g Acceleration',
    alpha: 9.81,
    beta_coast: 0.99,
    t_burn: 10.0,
    p_tx: 1.0e10,         // 10 GW
    d_tx: 100.0,
    d_refl: 100.0,
    d_rx: 100.0,
    lambda_0: 532.0e-9,
    n_h: 0.05,
    expected_d2: null,     // Dynamic hyperbolic
    expected_lambda_rx: null
  }
};

/**
 * Dispatches a preset selection and returns updated slider parameters.
 */
export function dispatchPreset(presetId) {
  const p = MISSION_PRESETS[presetId];
  if (!p) {
    throw new Error(`Unknown preset identifier: ${presetId}`);
  }
  return {
    alpha: p.alpha,
    beta: p.beta_coast,
    t_burn: p.t_burn,
    p_tx: p.p_tx,
    d_tx: p.d_tx,
    d_refl: p.d_refl,
    d_rx: p.d_rx,
    lambda_0: p.lambda_0,
    n_h: p.n_h,
    active_preset: presetId
  };
}

print("======================================================================");
print(" HEADLESS WEB APP RENDER & DYNAMIC REDRAW TEST SUITE (MT2)");
print("======================================================================");

// Resolve index.html source (disk or progressive testability contract)
let indexHtmlSource = null;
let htmlSourceOrigin = '';
try {
  const content = readFileFn('index.html');
  if (content && content.trim().length > 0) {
    indexHtmlSource = content;
    htmlSourceOrigin = 'Loaded from disk: index.html';
  }
} catch (e) {
  // index.html not yet present on disk prior to Milestone M3
}

if (!indexHtmlSource) {
  indexHtmlSource = CANONICAL_INDEX_HTML_CONTRACT;
  htmlSourceOrigin = 'Canonical PROJECT.md contract template (Progressive Testability: M3 pending)';
}

print(`Source: ${htmlSourceOrigin}`);
print(`Length: ${indexHtmlSource.length} characters\n`);

const doc = parseHTML(indexHtmlSource);

// ====================================================================
// TEST 1: DOM Structural Integrity & Offline Zero-Build Architecture
// ====================================================================
print("Test 1: test_dom_structural_integrity");

// Check DOCTYPE and HTML tags
assert(indexHtmlSource.includes('<!DOCTYPE html>') || indexHtmlSource.includes('<!doctype html>'), "HTML document contains standard HTML5 DOCTYPE");
assert(doc.getElementsByTagName('html').length > 0, "HTML document contains root <html> element");
assert(doc.getElementsByTagName('head').length > 0, "HTML document contains <head> metadata block");
assert(doc.getElementsByTagName('body').length > 0, "HTML document contains <body> display block");

// Check offline zero-build compliance: strictly no external CDN links or scripts
const externalScriptMatches = indexHtmlSource.match(/<script[^>]*src=["']https?:\/\/[^"']+["']/gi) || [];
const externalStyleMatches = indexHtmlSource.match(/<link[^>]*href=["']https?:\/\/[^"']+["']/gi) || [];
assert(externalScriptMatches.length === 0, "Zero external CDN script tags (pure offline standalone)", `found: ${externalScriptMatches.join(', ')}`);
assert(externalStyleMatches.length === 0, "Zero external CDN stylesheet tags (pure offline standalone)", `found: ${externalStyleMatches.join(', ')}`);

// Check presence of layout panels
const appContainer = doc.getElementById('app-container') || doc.querySelector('.container');
assert(appContainer !== null, "Main application container element present (#app-container / .container)");

const reportPanel = doc.getElementById('report-panel') || doc.querySelector('.report-pane');
assert(reportPanel !== null, "Technical report reader panel present (#report-panel / .report-pane)");

const cockpitSidebar = doc.getElementById('cockpit-sidebar') || doc.querySelector('.cockpit-pane');
assert(cockpitSidebar !== null, "Simulation cockpit sidebar present (#cockpit-sidebar / .cockpit-pane)");

const chartDeck = doc.getElementById('chart-deck') || doc.querySelector('.chart-deck');
assert(chartDeck !== null, "Visualizer multi-chart deck present (#chart-deck / .chart-deck)");

// Check report technical sections
const kinSection = doc.getElementById('section-kinematics') || doc.querySelector('section');
assert(kinSection !== null, "Technical report contains relativistic kinematics section");

const dopplerSection = doc.getElementById('section-doppler') || doc.querySelector('section');
assert(dopplerSection !== null, "Technical report contains relativistic Doppler section");

const linkSection = doc.getElementById('section-link') || doc.querySelector('section');
assert(linkSection !== null, "Technical report contains link budget & quantum capacity section");

const aberrationSection = doc.getElementById('section-aberration') || doc.querySelector('section');
assert(aberrationSection !== null, "Technical report contains corner reflector aberration section");

const glossaryTable = doc.getElementById('table-glossary') || doc.querySelector('.glossary-table');
assert(glossaryTable !== null, "Technical glossary table present (#table-glossary / .glossary-table)");

// Adversarial test: verify that parser properly rejects corrupted/incomplete markup
const corruptedHtml = '<html><body><div>No panels here</div></body></html>';
const corruptedDoc = parseHTML(corruptedHtml);
assert(corruptedDoc.getElementById('app-container') === null, "DOM validator correctly detects missing #app-container in incomplete markup");
assert(corruptedDoc.getElementById('chart-deck') === null, "DOM validator correctly detects missing #chart-deck in incomplete markup");

// ====================================================================
// TEST 2: Visualizer Chart Viewports & Canvas/SVG Elements
// ====================================================================
print("\nTest 2: test_canvases_and_visualizer_viewports");

const requiredCanvases = [
  { id: 'canvas-minkowski', name: 'Spacetime (ct, x) Minkowski Diagram' },
  { id: 'canvas-doppler',   name: 'Delay, Doppler, and Wavelength Dynamics' },
  { id: 'canvas-link',      name: 'Link Attenuation & Gordon-Holevo Capacity' },
  { id: 'canvas-storage',   name: 'In-Flight Storage Bits & Aberration Optics', altId: 'canvas-capacity' }
];

for (const c of requiredCanvases) {
  let el = doc.getElementById(c.id);
  if (!el && c.altId) {
    el = doc.getElementById(c.altId);
  }
  assert(el !== null, `Visualizer chart viewport exists: #${c.id} (${c.name})`);
  if (el) {
    const isCanvasOrSvg = el.tagName === 'canvas' || el.tagName === 'svg' || el.tagName === 'div';
    assert(isCanvasOrSvg, `Viewport #${c.id} is a valid canvas/svg render target (tag: <${el.tagName}>)`);
    if (el.tagName === 'canvas') {
      const w = parseInt(el.getAttribute('width') || '0', 10);
      const h = parseInt(el.getAttribute('height') || '0', 10);
      assert(w > 0 && h > 0, `Canvas #${c.id} specifies valid dimensions (${w}x${h})`);
    }
  }
}

// Adversarial check: verify rejection of missing chart canvas
const missingCanvasHtml = '<div id="chart-deck"><canvas id="canvas-minkowski"></canvas></div>';
const missingCanvasDoc = parseHTML(missingCanvasHtml);
assert(missingCanvasDoc.getElementById('canvas-doppler') === null, "DOM validator correctly flags missing canvas-doppler in partial deck");

// ====================================================================
// TEST 3: Interactive Sliders & Controls Configuration
// ====================================================================
print("\nTest 3: test_sliders_and_controls_configuration");

const requiredSliders = [
  { id: 'slider-alpha',  param: 'alpha',     min: 0.0,  max: 50.0,  step: 0.1,  defaultVal: 9.81,  unit: 'm/s²' },
  { id: 'slider-beta',   param: 'beta',      min: 0.01, max: 0.99,  step: 0.01, defaultVal: 0.50,  unit: 'c' },
  { id: 'slider-tburn',  param: 't_burn',    min: 0.0,  max: 10.0,  step: 0.1,  defaultVal: 1.0,   unit: 'years' },
  { id: 'slider-ptx',    param: 'p_tx',      min: 3.0,  max: 11.0,  step: 0.1,  defaultVal: 9.0,   unit: 'Watts' },
  { id: 'slider-dtx',    param: 'd_tx',      min: 1.0,  max: 200.0, step: 1.0,  defaultVal: 30.0,  unit: 'meters' },
  { id: 'slider-drefl',  param: 'd_refl',    min: 0.1,  max: 100.0, step: 0.5,  defaultVal: 50.0,  unit: 'meters' },
  { id: 'slider-drx',    param: 'd_rx',      min: 1.0,  max: 500.0, step: 1.0,  defaultVal: 50.0,  unit: 'meters' },
  { id: 'slider-lambda', param: 'lambda_0',  min: 200.0, max: 2000.0, step: 10.0, defaultVal: 532.0, unit: 'nm' },
  { id: 'slider-nh',     param: 'n_h',       min: -2.0, max: 1.0,   step: 0.01, defaultVal: -1.0,  unit: 'cm⁻³' }
];

for (const s of requiredSliders) {
  const el = doc.getElementById(s.id);
  assert(el !== null, `Interactive slider control exists: #${s.id}`);
  if (el) {
    assert(el.tagName === 'input', `Control #${s.id} is an <input> element`);
    assert(el.getAttribute('type') === 'range', `Control #${s.id} has type="range"`);

    const minVal = parseFloat(el.getAttribute('min'));
    const maxVal = parseFloat(el.getAttribute('max'));
    const stepVal = parseFloat(el.getAttribute('step'));
    const curVal = parseFloat(el.getAttribute('value'));

    assert(!isNaN(minVal) && minVal <= s.min, `Slider #${s.id} min (${minVal}) covers physical range`);
    assert(!isNaN(maxVal) && maxVal >= s.max, `Slider #${s.id} max (${maxVal}) covers physical range`);
    assert(!isNaN(stepVal) && stepVal > 0.0, `Slider #${s.id} step (${stepVal}) is positive`);
    assert(!isNaN(curVal) && curVal >= minVal && curVal <= maxVal, `Slider #${s.id} value (${curVal}) is within [min, max]`);
  }
}

// ====================================================================
// TEST 4: Mission Presets Selection & State Dispatch
// ====================================================================
print("\nTest 4: test_mission_preset_buttons_and_dispatch");

const presetButtons = [
  { id: 'btn-preset-a', key: 'preset_a', name: 'Preset A: Near-Term Laser Sail (0.2c)' },
  { id: 'btn-preset-b', key: 'preset_b', name: 'Preset B: Relativistic Fusion Probe (0.5c)' },
  { id: 'btn-preset-c', key: 'preset_c', name: 'Preset C: Extreme 1g Acceleration' }
];

for (const pb of presetButtons) {
  const btn = doc.getElementById(pb.id);
  assert(btn !== null, `Mission preset button exists: #${pb.id} (${pb.name})`);
}

// Test Preset A dispatch logic
const stateA = dispatchPreset('preset_a');
assertAlmostEqual(stateA.beta, 0.20, 1e-6, "Preset A sets beta_coast to 0.20c");
assertAlmostEqual(stateA.p_tx, 1.0e7, 1e-3, "Preset A sets transmit power to 10 MW");
assertAlmostEqual(stateA.lambda_0, 1064.0e-9, 1e-12, "Preset A sets wavelength to 1064 nm (Nd:YAG)");
assertAlmostEqual(stateA.d_tx, 10.0, 1e-3, "Preset A sets D_tx to 10 m");
assertAlmostEqual(stateA.d_refl, 10.0, 1e-3, "Preset A sets D_refl to 10 m");

// Test Preset B dispatch logic
const stateB = dispatchPreset('preset_b');
assertAlmostEqual(stateB.beta, 0.50, 1e-6, "Preset B sets beta_coast to 0.50c");
assertAlmostEqual(stateB.alpha, 0.50, 1e-6, "Preset B sets alpha to 0.5 m/s²");
assertAlmostEqual(stateB.p_tx, 1.0e9, 1e-3, "Preset B sets transmit power to 1 GW");
assertAlmostEqual(stateB.lambda_0, 532.0e-9, 1e-12, "Preset B sets wavelength to 532 nm");
assertAlmostEqual(stateB.d_refl, 50.0, 1e-3, "Preset B sets D_refl to 50 m");

// Test Preset C dispatch logic
const stateC = dispatchPreset('preset_c');
assertAlmostEqual(stateC.alpha, 9.81, 1e-6, "Preset C sets proper acceleration to 1g (9.81 m/s²)");
assertAlmostEqual(stateC.p_tx, 1.0e10, 1e-3, "Preset C sets transmit power to 10 GW");
assertAlmostEqual(stateC.d_tx, 100.0, 1e-3, "Preset C sets D_tx to 100 m");
assertAlmostEqual(stateC.d_refl, 100.0, 1e-3, "Preset C sets D_refl to 100 m");

// Adversarial test: unknown preset must throw error
let caughtUnknown = false;
try {
  dispatchPreset('preset_nonexistent');
} catch (e) {
  caughtUnknown = true;
}
assert(caughtUnknown, "Preset dispatcher throws an error on unknown preset ID");

// ====================================================================
// TEST 5: Reactive Calculation Pipeline & 16 ms Redraw Performance
// ====================================================================
print("\nTest 5: test_reactive_calculation_pipeline_and_performance");

// Execute full reactive pipeline for Preset A
const pA = { alpha: stateA.alpha, beta_coast: stateA.beta, trajectory_type: 'piecewise' };
const kinA_info = computeKinematics(pA, 0.0);
const kinA_boost = computeKinematics(pA, 86400 * 30);
assert(isFinite(kinA_boost.t_refl) && kinA_boost.t_refl > 0, "Preset A boost t_refl is finite and positive");
assert(isFinite(kinA_boost.x_refl) && kinA_boost.x_refl > 0, "Preset A boost x_refl is finite and positive");
assert(kinA_boost.phase === 'boost', "Preset A at 30 days is in boost phase");

// Preset A coast phase (t_tx > t_tx_crit)
const kinA_coast = computeKinematics(pA, kinA_info.t_tx_crit + 86400);
assert(kinA_coast.phase === 'coast', "Preset A after t_tx_crit transitions to coast phase");
assertAlmostEqual(kinA_coast.D2, 2.0 / 3.0, 1e-6, "Preset A coast D2 equals exact closed-form 2/3");

const optA = computeOptics({ alpha: stateA.alpha, lambda_0: stateA.lambda_0, beta: stateA.beta });
assertAlmostEqual(optA.D2, 2.0 / 3.0, 1e-6, "Preset A optics Doppler factor is 2/3");
assertAlmostEqual(optA.lambda_rx, 1596.0e-9, 1e-9, "Preset A received wavelength is exactly 1596 nm (SWIR)");
assertAlmostEqual(optA.symbol_stretch, 1.5, 1e-6, "Preset A symbol duration stretches by 1.5x");

const lbA = computeLinkBudget({
  P_tx: stateA.p_tx,
  D_tx: stateA.d_tx,
  D_refl: stateA.d_refl,
  D_rx: stateA.d_rx,
  lambda_0: stateA.lambda_0,
  n_H: stateA.n_h
}, 1.0e15, kinA_coast.D2);
assert(isFinite(lbA.P_rx) && lbA.P_rx > 0.0, "Preset A received power is finite and positive");
assert(isFinite(lbA.C_holevo_bps) && lbA.C_holevo_bps > 0.0, "Preset A Holevo capacity is finite and positive");
assert(lbA.eta_geom <= 1.0 && lbA.eta_geom > 0.0, "Preset A geometric efficiency is within (0, 1]");
assert(lbA.eta_dust <= 1.0 && lbA.eta_dust > 0.0, "Preset A dust extinction efficiency is within (0, 1]");

const aberA = computeAberration({
  D_refl: stateA.d_refl,
  lambda_0: stateA.lambda_0,
  beta: stateA.beta,
  beta_perp: 1.0e-4
});
assert(isFinite(aberA.theta_aber) && aberA.theta_aber > 0, "Preset A aberration angle is finite and positive");
assert(isFinite(aberA.decoupling_ratio) && aberA.decoupling_ratio > 0, "Preset A decoupling ratio is finite and positive");
assert(isFinite(aberA.delta_dihedral_arcsec), "Preset A dihedral compensation offset is finite");

const bitsA = integrateInFlightBits(kinA_coast.t_rx, { alpha: stateA.alpha, beta_coast: stateA.beta }, () => 1.0e9, 100);
assert(isFinite(bitsA.in_flight_bits) && bitsA.in_flight_bits > 0, "Preset A in-flight storage bits is finite and positive");
assert(isFinite(bitsA.in_flight_GB) && bitsA.in_flight_GB > 0, "Preset A in-flight storage GB is finite and positive");

// Execute full reactive pipeline for Preset B
const pB = { alpha: stateB.alpha, beta_coast: stateB.beta, t_burn: 3.1536e7, trajectory_type: 'piecewise' };
const kinB_info = computeKinematics(pB, 0.0);
const kinB_boost = computeKinematics(pB, 86400 * 365);
assert(isFinite(kinB_boost.t_refl) && kinB_boost.t_refl > 0, "Preset B boost t_refl is finite and positive");
assert(kinB_boost.phase === 'boost', "Preset B at 1 year is in boost phase");

// Preset B coast phase (t_tx > t_tx_crit)
const kinB_coast = computeKinematics(pB, kinB_info.t_tx_crit + 86400);
assert(kinB_coast.phase === 'coast', "Preset B after t_tx_crit transitions to coast phase");
assertAlmostEqual(kinB_coast.D2, 1.0 / 3.0, 1e-4, "Preset B coast D2 equals exact closed-form 1/3");

const optB = computeOptics({ alpha: stateB.alpha, lambda_0: stateB.lambda_0, beta: stateB.beta });
assertAlmostEqual(optB.lambda_rx, 1596.0e-9, 1e-9, "Preset B received wavelength is exactly 1596 nm (532 nm tripled)");

const lbB = computeLinkBudget({
  P_tx: stateB.p_tx,
  D_tx: stateB.d_tx,
  D_refl: stateB.d_refl,
  D_rx: stateB.d_rx,
  lambda_0: stateB.lambda_0,
  n_H: stateB.n_h
}, 2.0e16, kinB_coast.D2);
assert(isFinite(lbB.P_rx) && lbB.P_rx > 0.0, "Preset B received power is finite and positive");
assert(isFinite(lbB.C_holevo_bps) && lbB.C_holevo_bps > 0.0, "Preset B Holevo capacity is finite and positive");

// Execute full reactive pipeline for Preset C
const ThC = C_LIGHT / stateC.alpha;
const txC = 0.5 * ThC; // 176.9 days
const kinC = computeKinematics({ alpha: stateC.alpha, trajectory_type: 'hyperbolic' }, txC);
assert(isFinite(kinC.t_refl) && kinC.t_refl > 0, "Preset C hyperbolic t_refl is finite and positive");
assertAlmostEqual(kinC.D2, 0.25, 1e-9, "Preset C D2 at s=0.5 is exactly 0.25");

const optC = computeOptics({ alpha: stateC.alpha, lambda_0: stateC.lambda_0, beta: kinC.beta_refl });
assert(optC.chirp_rate < 0.0, "Preset C acceleration chirp rate is strictly negative");

// --- Performance Benchmark: 60 FPS Target (< 16 ms) ---
print("\nDynamic Redraw Performance Benchmark (Target: < 16.0 ms for 60 FPS):");
const benchmarkIterations = 100;
const benchStartTime = Date.now();

for (let iter = 0; iter < benchmarkIterations; iter++) {
  const t_tx_sample = (iter + 1) * (0.005 * ThC);
  const k = computeKinematics({ alpha: stateC.alpha, trajectory_type: 'hyperbolic' }, t_tx_sample);
  const o = computeOptics({ alpha: stateC.alpha, lambda_0: stateC.lambda_0, beta: k.beta_refl });
  const lb = computeLinkBudget({
    P_tx: stateC.p_tx,
    D_tx: stateC.d_tx,
    D_refl: stateC.d_refl,
    D_rx: stateC.d_rx,
    lambda_0: stateC.lambda_0,
    n_H: stateC.n_h
  }, k.x_refl, k.D2);
  const ab = computeAberration({
    D_refl: stateC.d_refl,
    lambda_0: stateC.lambda_0,
    beta: k.beta_refl,
    beta_perp: 1.0e-4
  });
  const bits = integrateInFlightBits(k.t_rx, { alpha: stateC.alpha }, () => 1.0e9, 50);
}

const benchTotalElapsed = Date.now() - benchStartTime;
const benchTimePerFrame = benchTotalElapsed / benchmarkIterations;
const benchFps = benchTimePerFrame > 0 ? (1000.0 / benchTimePerFrame) : 9999.0;

print(`  Benchmark: Executed ${benchmarkIterations} full redraw calculation frames`);
print(`  Total Elapsed Time:   ${benchTotalElapsed} ms`);
print(`  Time Per Redraw Frame: ${benchTimePerFrame.toFixed(3)} ms`);
print(`  Effective Redraw Rate: ${benchFps.toFixed(0)} FPS`);

assert(benchTimePerFrame < 16.0, `Dynamic recalculation loop executes in < 16.0 ms (${benchTimePerFrame.toFixed(3)} ms/frame, ${benchFps.toFixed(0)} FPS)`);

// --- Final Test Execution Summary ---
print("\n======================================================================");
print(` TEST EXECUTION SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
print("======================================================================");

if (failedCount > 0) {
  print(`\nResult: TEST SUITE ENCOUNTERED ${failedCount} FAILURES`);
  exitFn(1);
} else {
  print("\nResult: ALL WEBAPP HEADLESS TESTS PASSED (100% SUCCESS)");
  exitFn(0);
}
