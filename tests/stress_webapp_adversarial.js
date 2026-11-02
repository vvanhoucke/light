/**
 * tests/stress_webapp_adversarial.js
 *
 * Adversarial UI, Canvas Redraw, & ASD-STE100 Stress Testing Suite
 * Milestone M4 — Relativistic Optical Delay-Line Data Storage
 *
 * Runs natively in JavaScriptCore (macOS):
 *   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/stress_webapp_adversarial.js
 *
 * Test Sections:
 * 1. Offline Isolation Audit (Regex scan of HTML/CSS/JS for remote URLs)
 * 2. Extreme Slider Parameter Stress & Live Telemetry NaN Guard
 * 3. Rapid Preset Switching Stress (1,000 cycles tight loop)
 * 4. Canvas Redraw Stress Benchmark (1,000 consecutive full-deck redraw frames < 16 ms)
 * 5. Independent ASD-STE100 Prose & Vocabulary Audit of index.html
 */

import {
  C_LIGHT,
  G_ACCEL,
  twoWayDopplerFactor,
  computeKinematics,
  computeOptics,
  computeLinkBudget,
  computeCapacity,
  computeAberration,
  integrateInFlightBits
} from '../web/js/physics.js';

import {
  renderMinkowskiChart,
  renderDopplerChart,
  renderLinkChart,
  renderStorageChart,
  renderAllCharts
} from '../web/js/charts.js';

import {
  MISSION_PRESETS,
  dispatchPreset,
  applyPreset,
  updateSimulation,
  simState
} from '../web/js/app.js';

// --- Environment Helpers ---
const readFileFn = (typeof read === 'function') ? read : (typeof readFile === 'function' ? readFile : null);
const printFn = (typeof print === 'function') ? print : console.log;
const exitFn = (typeof quit === 'function') ? quit : (code => process.exit(code));

let totalPassed = 0;
let totalFailed = 0;
const failureDetails = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    printFn(`  [PASS] ${testName}`);
    totalPassed++;
  } else {
    printFn(`  [FAIL] ${testName}${detail ? ' — ' + detail : ''}`);
    totalFailed++;
    failureDetails.push({ testName, detail });
  }
}

function assertAlmostEqual(a, b, tol, testName) {
  const diff = Math.abs(a - b);
  assert(diff <= tol, testName, `expected ${b}, got ${a}, diff ${diff} > ${tol}`);
}

printFn("======================================================================");
printFn(" ADVERSARIAL STRESS TEST SUITE: WEBAPP & ASD-STE100 (JSC ENGINE)");
printFn("======================================================================");

// ============================================================================
// SUITE 1: Offline Isolation Audit
// ============================================================================
printFn("\n--- SUITE 1: Offline Isolation Audit ---");

const filesToCheck = [
  "index.html",
  "web/css/style.css",
  "web/js/physics.js",
  "web/js/charts.js",
  "web/js/app.js"
];

const remoteUrlRegex = /(https?:\/\/|\/\/[a-z0-9_\-\.]+\.(com|org|net|io|dev|edu)|cdn\.|googleapis|unpkg|cdnjs)/i;

for (const filePath of filesToCheck) {
  try {
    const content = readFileFn(filePath);
    // Ignore internal code comments or standard xml namespaces if any, but check all tags/links
    // Check for network fetches or external assets
    const lines = content.split('\n');
    let remoteFound = false;
    let offendingLine = "";
    let lineIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Exclude harmless regex definitions, author profile hyperlink, or doc comment references
      if (line.includes("remoteUrlRegex") || line.includes("https?:\\/\\/") || line.includes("Offline isolation audit") || line.includes("vincent.vanhoucke.com")) continue;
      if (remoteUrlRegex.test(line)) {
        remoteFound = true;
        offendingLine = line.trim();
        lineIdx = i + 1;
        break;
      }
    }

    assert(!remoteFound, `Offline isolation: ${filePath}`, remoteFound ? `Remote URL detected at line ${lineIdx}: ${offendingLine}` : "");
  } catch (err) {
    assert(false, `Offline isolation: ${filePath}`, `Failed to read file: ${err}`);
  }
}

// ============================================================================
// SUITE 2: Extreme Slider Parameter Stress & Telemetry NaN Guard
// ============================================================================
printFn("\n--- SUITE 2: Extreme Slider Parameter Stress & Telemetry NaN Guard ---");

// Construct Headless DOM Mock for App Telemetry & Sliders
const domRegistry = {};

function createMockElement(id, className = '') {
  const el = {
    id,
    className,
    textContent: '',
    value: '',
    classList: {
      toggle(cls, condition) {
        if (condition) {
          if (!el.className.split(/\s+/).includes(cls)) {
            el.className = (el.className + ' ' + cls).trim();
          }
        } else {
          el.className = el.className.split(/\s+/).filter(c => c !== cls).join(' ');
        }
      },
      remove(cls) {
        el.className = el.className.split(/\s+/).filter(c => c !== cls).join(' ');
      },
      add(cls) {
        if (!el.className.split(/\s+/).includes(cls)) {
          el.className = (el.className + ' ' + cls).trim();
        }
      }
    },
    getAttribute(name) {
      if (name === 'data-preset') return el['data-preset'] || null;
      if (name === 'id') return el.id;
      return null;
    }
  };
  domRegistry[id] = el;
  return el;
}

const mockButtons = [
  createMockElement('btn-preset-a', 'btn-preset'),
  createMockElement('btn-preset-b', 'btn-preset'),
  createMockElement('btn-preset-c', 'btn-preset')
];
mockButtons[0]['data-preset'] = 'preset_a';
mockButtons[1]['data-preset'] = 'preset_b';
mockButtons[2]['data-preset'] = 'preset_c';

createMockElement('active-preset-label');

const sliderKeys = ['alpha', 'beta', 'tburn', 'ptx', 'dtx', 'drefl', 'drx', 'lambda', 'nh'];
sliderKeys.forEach(k => {
  createMockElement(`slider-${k}`);
  createMockElement(`val-${k}`);
});

const telemetryKeys = ['delay', 'doppler', 'capacity', 'rx-power', 'storage', 'aberration', 'horizon'];
telemetryKeys.forEach(k => {
  createMockElement(`telemetry-${k}`);
});

globalThis.document = {
  getElementById(id) {
    if (!domRegistry[id]) createMockElement(id);
    return domRegistry[id];
  },
  querySelectorAll(sel) {
    if (sel === '.btn-preset') return mockButtons;
    return [];
  }
};

// Mock Canvas Factory
function createMockCanvas() {
  return {
    clientWidth: 800,
    clientHeight: 600,
    width: 800,
    height: 600,
    getAttribute(k) { return k === 'width' ? '800' : (k === 'height' ? '600' : null); },
    getContext(type) {
      if (type !== '2d') return null;
      const noop = () => {};
      const ctx = {
        resetTransform: noop,
        scale: noop,
        translate: noop,
        rotate: noop,
        save: noop,
        restore: noop,
        beginPath: noop,
        moveTo: noop,
        lineTo: noop,
        arc: noop,
        closePath: noop,
        stroke: noop,
        fill: noop,
        fillRect: noop,
        strokeRect: noop,
        clearRect: noop,
        fillText: noop,
        strokeText: noop,
        measureText: (txt) => ({ width: (txt || '').length * 7 }),
        setLineDash: noop,
        getLineDash: () => [],
        createLinearGradient: () => ({ addColorStop: noop }),
        createRadialGradient: () => ({ addColorStop: noop }),
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        font: '10px sans-serif',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        globalAlpha: 1.0,
        shadowColor: '#000',
        shadowBlur: 0
      };
      ctx.canvas = this;
      return ctx;
    }
  };
}

const testCanvases = {
  minkowski: createMockCanvas(),
  doppler: createMockCanvas(),
  link: createMockCanvas(),
  storage: createMockCanvas()
};

// Parameter Stress Test Matrix
const extremeStressCases = [
  {
    name: "All Minimum Parameter Sliders",
    state: {
      alpha: 0.0,
      beta: 0.01,
      t_burn: 0.0,
      p_tx: 1.0e3,      // 1 kW (slider 3.0)
      d_tx: 1.0,        // 1 m
      d_refl: 0.1,      // 10 cm
      d_rx: 1.0,        // 1 m
      lambda_0: 200.0,  // 200 nm DUV
      n_h: 0.01,        // 0.01 cm^-3 (slider -2.0)
      active_preset: null
    }
  },
  {
    name: "All Maximum Parameter Sliders",
    state: {
      alpha: 50.0,
      beta: 0.99,
      t_burn: 10.0,
      p_tx: 1.0e11,     // 100 GW (slider 11.0)
      d_tx: 200.0,      // 200 m
      d_refl: 100.0,    // 100 m
      d_rx: 500.0,      // 500 m
      lambda_0: 2000.0, // 2000 nm SWIR
      n_h: 10.0,        // 10.0 cm^-3 (slider 1.0)
      active_preset: null
    }
  },
  {
    name: "Zero Acceleration with Relativistic Coast (alpha=0, beta=0.999)",
    state: {
      alpha: 0.0,
      beta: 0.999,
      t_burn: 5.0,
      p_tx: 1.0e9,
      d_tx: 30.0,
      d_refl: 50.0,
      d_rx: 50.0,
      lambda_0: 532.0,
      n_h: 0.1,
      active_preset: null
    }
  },
  {
    name: "Sub-Millimeter Reflector with High Dust Density (d_refl=0.1m, n_h=10)",
    state: {
      alpha: 9.81,
      beta: 0.5,
      t_burn: 1.0,
      p_tx: 1.0e9,
      d_tx: 1.0,
      d_refl: 0.1,
      d_rx: 1.0,
      lambda_0: 2000.0,
      n_h: 10.0,
      active_preset: null
    }
  },
  {
    name: "Preset C Hyperbolic Acceleration Beyond Horizon (alpha=50, t_sample > Th)",
    state: {
      alpha: 50.0,
      beta: 0.99,
      t_burn: 10.0,
      p_tx: 1.0e10,
      d_tx: 100.0,
      d_refl: 100.0,
      d_rx: 100.0,
      lambda_0: 532.0,
      n_h: 0.05,
      active_preset: 'preset_c'
    }
  }
];

for (const tc of extremeStressCases) {
  let threwException = false;
  let exceptionMessage = '';

  try {
    Object.assign(simState, tc.state);
    updateSimulation();
    renderAllCharts(testCanvases, simState, 0);
  } catch (err) {
    threwException = true;
    exceptionMessage = String(err);
  }

  assert(!threwException, `Slider Stress: ${tc.name} — No unhandled exception`, exceptionMessage);

  // Check telemetry output strings for invalid values
  const delayText = domRegistry['telemetry-delay'].textContent;
  const dopplerText = domRegistry['telemetry-doppler'].textContent;
  const capacityText = domRegistry['telemetry-capacity'].textContent;
  const storageText = domRegistry['telemetry-storage'].textContent;

  const hasNaN = delayText.includes('NaN') ||
                 dopplerText.includes('NaN') ||
                 capacityText.includes('NaN') ||
                 storageText.includes('NaN');

  assert(!hasNaN, `Telemetry Sanitation: ${tc.name} — Free of NaN strings`,
    hasNaN ? `NaN detected in telemetry: storage="${storageText}", delay="${delayText}"` : "");
}

// ============================================================================
// SUITE 3: Rapid Preset Switching Stress (1,000 Cycles)
// ============================================================================
printFn("\n--- SUITE 3: Rapid Preset Switching Stress (1,000 Cycles) ---");

const presetCycle = ['preset_a', 'preset_b', 'preset_c'];
const presetIterations = 1000;
let presetErrors = 0;
const switchStartTime = Date.now();

for (let i = 0; i < presetIterations; i++) {
  const targetPreset = presetCycle[i % 3];
  try {
    applyPreset(targetPreset);
    const expected = MISSION_PRESETS[targetPreset];
    if (simState.active_preset !== targetPreset || simState.alpha !== expected.alpha) {
      presetErrors++;
    }
  } catch (err) {
    presetErrors++;
  }
}

const switchTotalTime = Date.now() - switchStartTime;
const avgSwitchTimeMs = switchTotalTime / presetIterations;

printFn(`  Executed: ${presetIterations} rapid preset transitions`);
printFn(`  Elapsed Time: ${switchTotalTime} ms (${avgSwitchTimeMs.toFixed(3)} ms/switch)`);
printFn(`  State Synchronization Errors: ${presetErrors}`);

assert(presetErrors === 0, `Rapid Preset Switching: 1,000 cycles completed with 0 errors`, `Encountered ${presetErrors} state errors`);
assert(simState.active_preset === presetCycle[(presetIterations - 1) % 3], `Final preset state matches sequence termination`);

// ============================================================================
// SUITE 4: Canvas Redraw Stress Benchmark (1,000 Frames)
// ============================================================================
printFn("\n--- SUITE 4: Canvas Redraw Stress Benchmark (1,000 Frames) ---");

const redrawFrameTarget = 1000;
let redrawCrashes = 0;
let lastRedrawError = null;
const redrawStartTime = Date.now();

for (let frame = 0; frame < redrawFrameTarget; frame++) {
  try {
    const timestamp = frame * 16.666;
    renderAllCharts(testCanvases, simState, timestamp);
  } catch (err) {
    redrawCrashes++;
    lastRedrawError = err;
  }
}

const redrawTotalElapsed = Date.now() - redrawStartTime;
const avgFrameTimeMs = redrawTotalElapsed / redrawFrameTarget;
const effectiveFps = avgFrameTimeMs > 0 ? (1000.0 / avgFrameTimeMs) : 9999.0;

printFn(`  Executed: ${redrawFrameTarget} full-deck redraw frames (4 charts / frame = ${redrawFrameTarget * 4} renders)`);
printFn(`  Total Elapsed Time:   ${redrawTotalElapsed} ms`);
printFn(`  Average Frame Time:   ${avgFrameTimeMs.toFixed(3)} ms (Target: < 16.0 ms)`);
printFn(`  Effective Frame Rate: ${effectiveFps.toFixed(0)} FPS`);
printFn(`  Redraw Crashes:       ${redrawCrashes}`);

assert(redrawCrashes === 0, `Canvas Redraw Stress: 0 crashes across 1,000 frames`, lastRedrawError ? String(lastRedrawError) : "");
assert(avgFrameTimeMs < 16.0, `Canvas Redraw Stress: Average frame time < 16.0 ms (${avgFrameTimeMs.toFixed(3)} ms/frame, ${effectiveFps.toFixed(0)} FPS)`);

// ============================================================================
// SUITE 5: Independent ASD-STE100 Prose Audit of index.html
// ============================================================================
printFn("\n--- SUITE 5: Independent ASD-STE100 Prose & Vocabulary Audit ---");

const rawHtmlContent = readFileFn("index.html");

// Extract Report Body (<main id="report-panel"> ... </main>)
const reportMatch = rawHtmlContent.match(/<main id="report-panel"[^>]*>([\s\S]*?)<\/main>/);
assert(reportMatch !== null, "Prose Audit: Report reader panel (<main id=\"report-panel\">) found");

const reportTextHtml = reportMatch ? reportMatch[1] : "";

// Clean HTML to extract textual sentences
let sanitizedProse = reportTextHtml;
sanitizedProse = sanitizedProse.replace(/<!--[\s\S]*?-->/g, " ");
sanitizedProse = sanitizedProse.replace(/<div class="equation">[\s\S]*?<\/div>/g, " "); // math equation blocks
sanitizedProse = sanitizedProse.replace(/<style[\s\S]*?<\/style>/g, " ");
sanitizedProse = sanitizedProse.replace(/<script[\s\S]*?<\/script>/g, " ");

// Replace block elements with linebreaks
sanitizedProse = sanitizedProse.replace(/<\/?(p|div|section|article|header|h[1-6]|li|td|th)[^>]*>/g, "\n");
sanitizedProse = sanitizedProse.replace(/<[^>]+>/g, " ");

// Decode HTML entities
sanitizedProse = sanitizedProse.replace(/&alpha;/g, "alpha")
                              .replace(/&beta;/g, "beta")
                              .replace(/&gamma;/g, "gamma")
                              .replace(/&delta;/g, "delta")
                              .replace(/&Delta;/g, "Delta")
                              .replace(/&tau;/g, "tau")
                              .replace(/&lambda;/g, "lambda")
                              .replace(/&pi;/g, "pi")
                              .replace(/&sigma;/g, "sigma")
                              .replace(/&theta;/g, "theta")
                              .replace(/&xi;/g, "xi")
                              .replace(/&equiv;/g, "==")
                              .replace(/&approx;/g, "~=")
                              .replace(/&radic;/g, "sqrt")
                              .replace(/&middot;/g, "*")
                              .replace(/&ge;/g, ">=")
                              .replace(/&le;/g, "<=")
                              .replace(/&int;/g, "integral")
                              .replace(/&bull;/g, "-")
                              .replace(/&[a-zA-Z0-9#]+;/g, " ");

// Tokenize Sentences
const rawLines = sanitizedProse.split("\n");
const extractedSentences = [];

for (const rawLine of rawLines) {
  const line = rawLine.trim();
  if (!line) continue;

  const splitRegex = /([^.!?]+[.!?]+)/g;
  let match;
  let lastIdx = 0;
  while ((match = splitRegex.exec(line)) !== null) {
    const s = match[1].trim();
    if (s && s.length > 3) extractedSentences.push(s);
    lastIdx = splitRegex.lastIndex;
  }
  const remainder = line.slice(lastIdx).trim();
  if (remainder && remainder.length > 5 && !/^[0-9\s.,=+\-*\/()]+$/.test(remainder)) {
    extractedSentences.push(remainder);
  }
}

printFn(`  Extracted ${extractedSentences.length} sentences from technical engineering report`);

// 5.1 Sentence Length Audit
let overlengthCount = 0;
const overlengthList = [];

for (const s of extractedSentences) {
  const words = s.split(/[^a-zA-Z0-9\-_]+/).filter(w => w.length > 0 && !/^[0-9]+$/.test(w));
  if (words.length > 25) {
    overlengthCount++;
    overlengthList.push({ sentence: s, count: words.length });
  }
}

assert(overlengthCount === 0, `ASD-STE100 Rule 1: Descriptive sentence length <= 25 words (100% compliant)`,
  overlengthCount > 0 ? `${overlengthCount} sentences exceed 25 words: "${overlengthList[0].sentence}" (${overlengthList[0].count} words)` : "");

// 5.2 Passive Voice Audit
const BE_VERBS = new Set(["is", "are", "was", "were", "be", "been", "being"]);
const PAST_PARTICIPLES = new Set([
  "shown", "found", "known", "given", "taken", "built", "driven", "seen",
  "done", "chosen", "caught", "sent", "set", "read", "left", "kept",
  "lost", "struck", "bent", "drawn", "split", "spread", "run", "become",
  "grown", "written", "transmitted", "emitted", "received", "reflected",
  "derived", "computed", "calculated", "attenuated", "shifted", "accelerated",
  "absorbed", "measured", "plotted", "stored", "deflected", "guided",
  "focused", "compressed", "expanded", "achieved", "tested", "proven", "used"
]);

let passiveCount = 0;
const passiveExamples = [];

for (const s of extractedSentences) {
  const words = s.split(/[^a-zA-Z0-9\-_]+/).filter(w => w.length > 0 && !/^[0-9]+$/.test(w)).map(w => w.toLowerCase());
  let isPassive = false;
  for (let i = 0; i < words.length - 1; i++) {
    if (BE_VERBS.has(words[i])) {
      const nextWord = words[i + 1];
      if (PAST_PARTICIPLES.has(nextWord) || (nextWord.endsWith("ed") && !["speed", "red"].includes(nextWord))) {
        isPassive = true;
        break;
      }
      if (i + 2 < words.length) {
        const nextNextWord = words[i + 2];
        if (PAST_PARTICIPLES.has(nextNextWord) || (nextNextWord.endsWith("ed") && !["speed", "red"].includes(nextNextWord))) {
          isPassive = true;
          break;
        }
      }
    }
  }
  if (isPassive) {
    passiveCount++;
    passiveExamples.push(s);
  }
}

const passiveRatio = extractedSentences.length > 0 ? (passiveCount / extractedSentences.length) * 100 : 0.0;
printFn(`  Passive Voice Sentences: ${passiveCount} (${passiveRatio.toFixed(2)}%) [Limit: < 5.0%]`);
assert(passiveRatio < 5.0, `ASD-STE100 Rule 2: Passive voice incidence < 5.0% (${passiveRatio.toFixed(2)}%)`,
  `Passive percentage exceeds threshold: ${passiveRatio.toFixed(2)}%`);

// 5.3 Banned Words Audit
const BANNED_MODALS = ["since", "may", "could", "should", "might", "etc", "various", "several"];
const bannedViolations = [];

for (const s of extractedSentences) {
  const words = s.split(/[^a-zA-Z0-9\-_]+/).filter(w => w.length > 0 && !/^[0-9]+$/.test(w)).map(w => w.toLowerCase());
  for (const b of BANNED_MODALS) {
    if (words.includes(b)) {
      bannedViolations.push({ word: b, sentence: s });
    }
  }

  // Check banned ambiguous word "as" (exempting "such as" and "as well as")
  const sLower = s.toLowerCase();
  const asRegex = /\bas\b/g;
  let asMatch;
  while ((asMatch = asRegex.exec(sLower)) !== null) {
    const idx = asMatch.index;
    const prefix = sLower.slice(Math.max(0, idx - 10), idx);
    const suffix = sLower.slice(idx + 2, Math.min(sLower.length, idx + 12));
    if (prefix.endsWith("such ") || suffix.startsWith(" well as")) {
      // exempt
    } else {
      bannedViolations.push({ word: "as", sentence: s });
    }
  }
}

printFn(`  Banned Ambiguous Words Found: ${bannedViolations.length}`);
if (bannedViolations.length > 0) {
  bannedViolations.forEach((v, idx) => {
    printFn(`    [${idx + 1}] Banned word '${v.word}' in: "${v.sentence}"`);
  });
}

assert(bannedViolations.length === 0, `ASD-STE100 Rule 3: Banned ambiguous words eliminated (0 occurrences)`,
  `${bannedViolations.length} banned word occurrences found in report text`);

// 5.4 Forbidden Synonyms Audit
const FORBIDDEN_SYNONYMS = [
  { term: "Corner-Cube Reflector", forbidden: ["trihedral reflector", "corner cube"] },
  { term: "Gordon-Holevo Capacity", forbidden: ["quantum capacity", "holevo limit"] },
  { term: "Interstellar Medium", forbidden: ["space dust", "galactic gas"] },
  { term: "Two-Way Doppler Factor", forbidden: ["doppler ratio", "two-way shift"] }
];

const forbiddenSynonymViolations = [];
// Scan report body lines (excluding the glossary definition table itself which defines unapproved terms)
const reportSectionLines = reportTextHtml.split('\n');
let insideGlossaryTable = false;

for (let lineNo = 0; lineNo < reportSectionLines.length; lineNo++) {
  const line = reportSectionLines[lineNo];
  if (line.includes('<table id="table-glossary"')) insideGlossaryTable = true;
  if (line.includes('</table>')) {
    insideGlossaryTable = false;
    continue;
  }
  if (insideGlossaryTable) continue;

  const lineClean = line.replace(/<[^>]+>/g, " ").toLowerCase();
  for (const item of FORBIDDEN_SYNONYMS) {
    for (const syn of item.forbidden) {
      if (lineClean.includes(syn)) {
        forbiddenSynonymViolations.push({
          line: lineNo + 1,
          term: item.term,
          forbidden: syn,
          text: line.trim()
        });
      }
    }
  }
}

printFn(`  Forbidden Synonyms in Report Prose: ${forbiddenSynonymViolations.length}`);
if (forbiddenSynonymViolations.length > 0) {
  forbiddenSynonymViolations.forEach((v, idx) => {
    printFn(`    [${idx + 1}] Line ${v.line}: '${v.forbidden}' used instead of approved '${v.term}'`);
    printFn(`        Snippet: "${v.text}"`);
  });
}

assert(forbiddenSynonymViolations.length === 0, `ASD-STE100 Rule 4: Zero forbidden synonyms in report text`,
  `${forbiddenSynonymViolations.length} forbidden synonym usages found`);

// ============================================================================
// FINAL ADVERSARIAL STRESS REPORT SUMMARY
// ============================================================================
printFn("\n======================================================================");
printFn(` ADVERSARIAL STRESS TEST SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
printFn("======================================================================");

if (totalFailed > 0) {
  printFn("\nCONFIRMED VULNERABILITIES & FAILURE MODES:");
  failureDetails.forEach((f, i) => {
    printFn(`  [${i + 1}] ${f.testName}`);
    if (f.detail) printFn(`      ${f.detail}`);
  });
  printFn("\nFINAL VERDICT: REJECTED (Empirical bugs detected under adversarial stress)");
  exitFn(1);
} else {
  printFn("\nFINAL VERDICT: CONFIRMED (All adversarial stress benchmarks passed)");
  exitFn(0);
}
