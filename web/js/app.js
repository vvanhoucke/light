/**
 * web/js/app.js
 *
 * Relativistic Optical Delay-Line Data Storage Medium: Application Controller
 * ES6 Module orchestrating simulation cockpit, mission presets, parameter sliders,
 * live telemetry updates, and 60 FPS visualizer redraw loop.
 */

import {
  C_LIGHT,
  G_ACCEL,
  twoWayDopplerFactor,
  computeKinematics,
  receptionToTransmissionTime,
  computeOptics,
  computeLinkBudget,
  computeAberration,
  integrateInFlightBits
} from './physics.js';

import {
  renderMinkowskiChart,
  renderDopplerChart,
  renderLinkChart,
  renderStorageChart,
  renderAllCharts
} from './charts.js';

// --- Mission Presets Configuration ---
export const MISSION_PRESETS = {
  preset_a: {
    name: 'Preset A: Near-Term Laser Sail',
    alpha: 0.0,
    beta_coast: 0.20,
    t_burn: 0.05,
    t_tx_yr: 10.0,
    p_tx: 1.0e7,          // 10 MW (slider val 7.0)
    slider_ptx: 7.0,
    d_tx: 10.0,
    d_refl: 10.0,
    d_rx: 10.0,
    lambda_0: 1064.0e-9,  // Nd:YAG (slider val 1064.0)
    slider_lambda: 1064.0,
    n_h: 1.0,             // 1.0 cm^-3 (slider val 0.0)
    slider_nh: 0.0,
    expected_d2: 2.0 / 3.0,
    expected_lambda_rx: 1596.0e-9
  },
  preset_b: {
    name: 'Preset B: Relativistic Fusion Probe',
    alpha: 0.5,
    beta_coast: 0.50,
    t_burn: 1.0,
    t_tx_yr: 10.0,
    p_tx: 1.0e9,          // 1 GW (slider val 9.0)
    slider_ptx: 9.0,
    d_tx: 30.0,
    d_refl: 50.0,
    d_rx: 50.0,
    lambda_0: 532.0e-9,   // Frequency-doubled green (slider val 532.0)
    slider_lambda: 532.0,
    n_h: 0.1,             // 0.1 cm^-3 (slider val -1.0)
    slider_nh: -1.0,
    expected_d2: 1.0 / 3.0,
    expected_lambda_rx: 1596.0e-9
  },
  preset_c: {
    name: 'Preset C: Extreme 1g Acceleration',
    alpha: 9.81,
    beta_coast: 0.99,
    t_burn: 10.0,
    t_tx_yr: 0.5,
    p_tx: 1.0e10,         // 10 GW (slider val 10.0)
    slider_ptx: 10.0,
    d_tx: 100.0,
    d_refl: 100.0,
    d_rx: 100.0,
    lambda_0: 532.0e-9,   // Green laser (slider val 532.0)
    slider_lambda: 532.0,
    n_h: 0.05,            // 0.05 cm^-3 (slider val -1.30)
    slider_nh: -1.30,
    expected_d2: null,
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
    t_tx_yr: p.t_tx_yr,
    p_tx: p.p_tx,
    d_tx: p.d_tx,
    d_refl: p.d_refl,
    d_rx: p.d_rx,
    lambda_0: p.lambda_0,
    n_h: p.n_h,
    active_preset: presetId
  };
}

// Current Simulation State
export const simState = {
  t_tx_yr: 10.0,
  alpha: 9.81,
  beta: 0.50,
  t_burn: 1.0,
  p_tx: 1.0e9,
  d_tx: 30.0,
  d_refl: 50.0,
  d_rx: 50.0,
  lambda_0: 532.0,
  n_h: 0.1,
  active_preset: null
};

// Canvas Viewport Targets Registry
const canvases = {
  minkowski: null,
  doppler: null,
  link: null,
  storage: null
};

/**
 * Formats numbers into human-readable scientific strings.
 */
function formatUnits(val, unit = '', decimals = 2) {
  if (!isFinite(val)) return 'Infinity';
  if (val === 0) return `0 ${unit}`.trim();
  const absVal = Math.abs(val);
  if (absVal >= 1e15) return `${(val / 1e15).toFixed(decimals)} P${unit}`;
  if (absVal >= 1e12) return `${(val / 1e12).toFixed(decimals)} T${unit}`;
  if (absVal >= 1e9) return `${(val / 1e9).toFixed(decimals)} G${unit}`;
  if (absVal >= 1e6) return `${(val / 1e6).toFixed(decimals)} M${unit}`;
  if (absVal >= 1e3) return `${(val / 1e3).toFixed(decimals)} k${unit}`;
  if (absVal >= 1.0) return `${val.toFixed(decimals)} ${unit}`.trim();
  if (absVal >= 1e-3) return `${(val * 1e3).toFixed(decimals)} m${unit}`;
  if (absVal >= 1e-6) return `${(val * 1e6).toFixed(decimals)} µ${unit}`;
  if (absVal >= 1e-9) return `${(val * 1e9).toFixed(decimals)} n${unit}`;
  if (absVal >= 1e-12) return `${(val * 1e12).toFixed(decimals)} p${unit}`;
  if (absVal >= 1e-15) return `${(val * 1e15).toFixed(decimals)} f${unit}`;
  if (absVal >= 1e-18) return `${(val * 1e18).toFixed(decimals)} a${unit}`;
  return `${val.toExponential(decimals)} ${unit}`.trim();
}

/**
 * Formats time durations into clean, single-unit readable strings (s, min, hr, days, yr, kyr).
 */
function formatTime(seconds) {
  if (!isFinite(seconds)) return 'Infinity (Past Horizon)';
  if (seconds <= 0) return '0 s';
  const days = seconds / 86400;
  const years = days / 365.25;
  if (years >= 1000) return `${(years / 1000).toFixed(2)} kyr`;
  if (years >= 100) return `${years.toFixed(1)} yr`;
  if (years >= 1.0) return `${years.toFixed(2)} yr`;
  if (days >= 10) return `${days.toFixed(1)} days`;
  if (days >= 1.0) return `${days.toFixed(2)} days`;
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} hr`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)} min`;
  return `${seconds.toFixed(1)} s`;
}

/**
 * Formats data rates (bps) into readable units (Tbps, Gbps, Mbps, kbps, bps, bits/hr, bits/yr).
 */
function formatDataRate(bps) {
  if (!isFinite(bps) || bps <= 0) return '0 bps';
  if (bps >= 1e12) return `${(bps / 1e12).toFixed(2)} Tbps`;
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(2)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(2)} kbps`;
  if (bps >= 1.0) return `${bps.toFixed(2)} bps`;
  const bphr = bps * 3600;
  if (bphr >= 1.0) return `${bphr.toFixed(1)} bits/hr`;
  const bpday = bps * 86400;
  if (bpday >= 1.0) return `${bpday.toFixed(1)} bits/day`;
  const bpyr = bpday * 365.25;
  if (bpyr >= 0.01) return `${bpyr.toFixed(2)} bits/yr`;
  return `${bps.toExponential(2)} bps`;
}

/**
 * Formats total stored bits into clean byte units (B, kB, MB, GB, TB, PB, EB).
 */
function formatDataVolume(bits) {
  if (!isFinite(bits) || bits <= 0) return '0 B';
  const bytes = bits / 8.0;
  if (bytes >= 1e18) return `${(bytes / 1e18).toFixed(2)} EB`;
  if (bytes >= 1e15) return `${(bytes / 1e15).toFixed(2)} PB`;
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} kB`;
  if (bytes >= 1.0) return `${bytes.toFixed(1)} B`;
  return `${bits.toFixed(1)} bits`;
}

/**
 * Formats optical/IR/microwave wavelength (m) into nm, µm, mm, or m.
 */
function formatWavelength(meters) {
  if (!isFinite(meters) || meters <= 0) return '∞';
  const nm = meters * 1e9;
  if (nm < 1000) return `${nm.toFixed(1)} nm`;
  if (nm < 1e6) return `${(nm / 1e3).toFixed(2)} µm`;
  if (nm < 1e9) return `${(nm / 1e6).toFixed(2)} mm`;
  return `${meters.toFixed(2)} m`;
}

/**
 * Formats astronomical distance (m) into AU or light-years (ly).
 */
function formatDistance(meters) {
  if (!isFinite(meters) || meters <= 0) return '0 AU';
  const ly = meters / (C_LIGHT * 365.25 * 86400);
  if (ly >= 0.1) return `${ly.toFixed(2)} ly`;
  const au = meters / 1.495978707e11;
  if (au >= 0.1) return `${au.toFixed(1)} AU`;
  return `${(meters / 1e6).toFixed(1)} Mm`;
}

/**
 * Formats angles in arcseconds into ", ', or °.
 */
function formatAngleArcsec(arcsec) {
  if (!isFinite(arcsec)) return '∞';
  if (arcsec >= 3600) return `${(arcsec / 3600).toFixed(2)}°`;
  if (arcsec >= 120) return `${(arcsec / 60).toFixed(2)}'`;
  return `${arcsec.toFixed(2)}"`;
}

/**
 * Recalculates full mission telemetry pipeline and updates DOM cards.
 * Distinguishes at Earth time T between:
 * 1) Readout (Receive) stream arriving at Earth at t_rx = T (emitted in the past at t_tx* < T)
 * 2) Write (Transmit) stream departing Earth at t_tx = T (arriving in the future at t_rx_future > T)
 */
export function updateSimulation() {
  const pKin = {
    alpha: simState.alpha,
    beta_coast: simState.beta,
    t_burn: simState.t_burn * 365.25 * 86400,
    trajectory_type: simState.active_preset === 'preset_c' ? 'hyperbolic' : 'piecewise'
  };

  // Current Earth elapsed time T since launch
  const T_yr = (simState.t_tx_yr !== undefined && simState.t_tx_yr !== null) ? Number(simState.t_tx_yr) : 10.0;
  const T_s = Math.max(0.001, T_yr) * 365.25 * 86400;

  const rawNh = Number(simState.n_h !== undefined ? simState.n_h : 0.1);
  const n_H_m3 = rawNh < 1e3 ? rawNh * 1.0e6 : rawNh;
  const linkParams = {
    P_tx: simState.p_tx,
    D_tx: simState.d_tx,
    D_refl: simState.d_refl,
    D_rx: simState.d_rx,
    lambda_0: simState.lambda_0 * 1e-9,
    n_H: n_H_m3
  };

  // -------------------------------------------------------------------------
  // 1. READOUT (RECEIVE) STREAM ARRIVING AT EARTH AT TIME t_rx = T
  // -------------------------------------------------------------------------
  const t_tx_past_s = receptionToTransmissionTime(T_s, pKin);
  const kinRx = computeKinematics(pKin, t_tx_past_s);
  const optRx = computeOptics({
    alpha: simState.alpha,
    lambda_0: simState.lambda_0 * 1e-9,
    beta: kinRx.beta_refl
  });
  const distRx_m = isFinite(kinRx.x_refl) && kinRx.x_refl > 0 ? kinRx.x_refl : 1.0e12;
  const lbRx = computeLinkBudget(linkParams, distRx_m, kinRx.D2);
  const C_rx_now_bps = lbRx.C_holevo_bps; // Bits/s of past data collectable on Earth at time T
  const R_tx_past_bps = kinRx.D2 > 0 ? (C_rx_now_bps / kinRx.D2) : 0.0; // Rate it was sent at t_tx*

  // -------------------------------------------------------------------------
  // 2. WRITE (TRANSMIT) STREAM SENT FROM EARTH AT TIME t_tx = T
  // -------------------------------------------------------------------------
  const kinTx = computeKinematics(pKin, T_s);
  const isPastHorizonTx = kinTx.is_past_horizon || kinTx.horizon_cutoff || !isFinite(kinTx.t_rx) || !isFinite(kinTx.t_refl);
  const distTx_m = !isPastHorizonTx && kinTx.x_refl > 0 ? kinTx.x_refl : 1.0e15;
  const lbTx = !isPastHorizonTx
    ? computeLinkBudget(linkParams, distTx_m, kinTx.D2)
    : { C_holevo_bps: 0.0, P_rx: 0.0, bits_per_photon: 0.0 };
  const C_rx_future_bps = !isPastHorizonTx ? lbTx.C_holevo_bps : 0.0;
  // Maximum usable write rate at time T (accounting for 1/D2 stretching on future return)
  const C_tx_now_bps = (!isPastHorizonTx && kinTx.D2 > 0) ? (C_rx_future_bps / kinTx.D2) : 0.0;

  // -------------------------------------------------------------------------
  // 3. ABERRATION & IN-FLIGHT DATA STORAGE AT EARTH TIME T
  // -------------------------------------------------------------------------
  const aber = computeAberration({
    D_refl: simState.d_refl,
    lambda_0: simState.lambda_0 * 1e-9,
    beta: kinRx.beta_refl,
    beta_perp: 1.0e-4
  });

  const pTxVal = (simState.p_tx !== undefined && simState.p_tx !== null) ? Number(simState.p_tx) : 1.0e9;
  const rateScale = Math.max(0.1, Math.log10(Math.max(1e3, pTxVal)) / 9.0);
  const nominalRateBps = 1.0e9 * rateScale;
  const bits = integrateInFlightBits(T_s, pKin, () => nominalRateBps, 60);

  // -------------------------------------------------------------------------
  // 4. UPDATE LIVE MISSION TELEMETRY DOM ELEMENTS
  // -------------------------------------------------------------------------
  const elDelay = document.getElementById('telemetry-delay');
  if (elDelay) {
    const pastDelayStr = formatTime(kinRx.delta_t);
    const pastEmitStr = formatTime(t_tx_past_s);
    const futureDelayStr = isPastHorizonTx ? 'Infinity (Past Horizon)' : formatTime(kinTx.delta_t);
    elDelay.textContent = `Arriving Signal Age: ${pastDelayStr} (sent at ${pastEmitStr}) | Future Write Delay: ${futureDelayStr}`;
  }

  const elDoppler = document.getElementById('telemetry-doppler');
  const zRx = optRx.optical_redshift !== undefined ? optRx.optical_redshift : (kinRx.D2 > 0 ? (1.0 / kinRx.D2 - 1.0) : Infinity);
  const stretchRx = kinRx.D2 > 0 ? (1.0 / kinRx.D2) : Infinity;
  const zRxStr = isFinite(zRx) ? (zRx >= 100 ? zRx.toFixed(0) : zRx.toFixed(2)) : '∞';
  const stretchStr = isFinite(stretchRx) ? (stretchRx >= 100 ? `${stretchRx.toFixed(0)}×` : `${stretchRx.toFixed(2)}×`) : '∞';
  const bandRx = optRx.spectral_band || 'IR';

  if (elDoppler) {
    elDoppler.textContent = `Redshift z: ${zRxStr} (${stretchStr} stretch, D₂ = ${kinRx.D2.toFixed(4)}) | λ_tx: ${Math.round(simState.lambda_0)} nm → λ_rx: ${formatWavelength(optRx.lambda_rx)} [${bandRx}]`;
  }

  const elCapacity = document.getElementById('telemetry-capacity');
  if (elCapacity) {
    const rxRateStr = formatDataRate(C_rx_now_bps);
    const txRateStr = isPastHorizonTx ? '0 bps (Past Horizon)' : formatDataRate(C_tx_now_bps);
    elCapacity.textContent = `Readout Capacity at T: ${rxRateStr} (sent at ${formatDataRate(R_tx_past_bps)}) | Write Capacity at T: ${txRateStr}`;
  }

  // Update Extended Telemetry Grid Cards
  const elRxCapCard = document.getElementById('telemetry-rx-capacity');
  if (elRxCapCard) {
    elRxCapCard.textContent = formatDataRate(C_rx_now_bps);
  }

  const elTxCapCard = document.getElementById('telemetry-tx-capacity');
  if (elTxCapCard) {
    elTxCapCard.textContent = isPastHorizonTx ? 'Past Horizon' : formatDataRate(C_tx_now_bps);
  }

  const elRedshiftCard = document.getElementById('telemetry-redshift');
  if (elRedshiftCard) {
    elRedshiftCard.textContent = `z = ${zRxStr} (${stretchStr})`;
  }

  const elWavelengthCard = document.getElementById('telemetry-wavelength');
  if (elWavelengthCard) {
    const shortBand = bandRx.includes('(') ? bandRx.split('(')[1].replace(')', '') : bandRx;
    elWavelengthCard.textContent = `${formatWavelength(optRx.lambda_rx)} [${shortBand}]`;
  }

  const elPastDelayCard = document.getElementById('telemetry-past-delay');
  if (elPastDelayCard) {
    elPastDelayCard.textContent = `${formatTime(kinRx.delta_t)} (sent ${formatTime(t_tx_past_s)})`;
  }

  const elFutureDelayCard = document.getElementById('telemetry-future-delay');
  if (elFutureDelayCard) {
    elFutureDelayCard.textContent = isPastHorizonTx ? '∞ (Past Horizon)' : `${formatTime(kinTx.delta_t)} (${formatDistance(distTx_m)})`;
  }

  const elRxPower = document.getElementById('telemetry-rx-power');
  if (elRxPower) {
    elRxPower.textContent = formatUnits(lbRx.P_rx, 'W', 2);
  }

  const elInFlightBits = document.getElementById('telemetry-storage');
  if (elInFlightBits) {
    elInFlightBits.textContent = formatDataVolume(bits.in_flight_bits);
  }

  const elAberration = document.getElementById('telemetry-aberration');
  if (elAberration) {
    elAberration.textContent = `${formatAngleArcsec(aber.theta_aber_arcsec)} (δα: ${formatAngleArcsec(aber.delta_dihedral_arcsec)})`;
  }

  const elHorizon = document.getElementById('telemetry-horizon');
  if (elHorizon) {
    const Th_s = simState.alpha > 0 ? (C_LIGHT / simState.alpha) : Infinity;
    elHorizon.textContent = isFinite(Th_s) ? formatTime(Th_s) : 'None (Inertial)';
  }
}

/**
 * Synchronizes DOM slider controls with internal state.
 */
function syncSlidersFromState() {
  const setVal = (id, val, textId, textVal) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
    const txt = document.getElementById(textId);
    if (txt) txt.textContent = textVal;
  };

  const ttxVal = simState.t_tx_yr !== undefined ? simState.t_tx_yr : 10.0;
  setVal('slider-ttx', ttxVal, 'val-ttx', `${ttxVal.toFixed(1)} yr`);
  setVal('slider-alpha', simState.alpha, 'val-alpha', `${simState.alpha.toFixed(2)} m/s²`);
  setVal('slider-beta', simState.beta, 'val-beta', `${simState.beta.toFixed(2)} c`);
  setVal('slider-tburn', simState.t_burn, 'val-tburn', `${simState.t_burn.toFixed(1)} yr`);

  const ptxLog = Math.log10(simState.p_tx);
  setVal('slider-ptx', ptxLog.toFixed(1), 'val-ptx', `${formatUnits(simState.p_tx, 'W', 1)}`);

  setVal('slider-dtx', simState.d_tx, 'val-dtx', `${simState.d_tx.toFixed(0)} m`);
  setVal('slider-drefl', simState.d_refl, 'val-drefl', `${simState.d_refl.toFixed(1)} m`);
  setVal('slider-drx', simState.d_rx, 'val-drx', `${simState.d_rx.toFixed(0)} m`);
  setVal('slider-lambda', simState.lambda_0, 'val-lambda', `${simState.lambda_0.toFixed(0)} nm`);

  const nhLog = Math.log10(Math.max(0.01, simState.n_h));
  setVal('slider-nh', nhLog.toFixed(2), 'val-nh', `${simState.n_h.toFixed(2)} cm⁻³`);
}

/**
 * Applies a mission preset to controls and simulation.
 */
export function applyPreset(presetId) {
  const preset = dispatchPreset(presetId);
  simState.alpha = preset.alpha;
  simState.beta = preset.beta;
  simState.t_burn = preset.t_burn;
  simState.t_tx_yr = preset.t_tx_yr !== undefined ? preset.t_tx_yr : 10.0;
  simState.p_tx = preset.p_tx;
  simState.d_tx = preset.d_tx;
  simState.d_refl = preset.d_refl;
  simState.d_rx = preset.d_rx;
  simState.lambda_0 = preset.lambda_0 * 1e9;
  simState.n_h = preset.n_h;
  simState.active_preset = presetId;

  // Update button active styling
  document.querySelectorAll('.btn-preset').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-preset') === presetId || b.id === `btn-${presetId.replace('_', '-')}`);
  });

  const label = document.getElementById('active-preset-label');
  if (label) {
    label.textContent = `Active: ${MISSION_PRESETS[presetId].name}`;
  }

  syncSlidersFromState();
  updateSimulation();
  renderAllCharts(canvases, simState, Date.now());
}

/**
 * Initializes DOM event listeners and canvas viewports.
 */
export function initApp() {
  if (typeof document === 'undefined') return;
  if (typeof window !== 'undefined' && window.__RELATIVISTIC_APP_INITIALIZED__) return;
  if (typeof window !== 'undefined') {
    window.__RELATIVISTIC_APP_INITIALIZED__ = true;
  }

  // Resolve Canvas Elements
  canvases.minkowski = document.getElementById('canvas-minkowski');
  canvases.doppler = document.getElementById('canvas-doppler');
  canvases.link = document.getElementById('canvas-link');
  canvases.storage = document.getElementById('canvas-storage') || document.getElementById('canvas-capacity');

  // Top-Level 3-Tab Navigation Listeners
  const tabDefs = [
    { btnId: 'tab-btn-intro', panelId: 'tab-intro' },
    { btnId: 'tab-btn-story', panelId: 'tab-story' },
    { btnId: 'tab-btn-analysis', panelId: 'tab-analysis' }
  ];

  const switchTab = (activePanelId) => {
    tabDefs.forEach(({ btnId, panelId }) => {
      const btn = document.getElementById(btnId);
      const panel = document.getElementById(panelId);
      const isActive = panelId === activePanelId;
      if (btn) {
        btn.classList.toggle('active', isActive);
        if (typeof btn.setAttribute === 'function') {
          btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }
      }
      if (panel) {
        panel.classList.toggle('active', isActive);
        if (isActive) {
          panel.hidden = false;
          if (typeof panel.removeAttribute === 'function') panel.removeAttribute('hidden');
        } else {
          panel.hidden = true;
          if (typeof panel.setAttribute === 'function') panel.setAttribute('hidden', '');
        }
      }
    });
    if (activePanelId === 'tab-analysis') {
      updateSimulation();
      renderAllCharts(canvases, simState, Date.now());
    }
  };

  tabDefs.forEach(({ btnId, panelId }) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => switchTab(panelId));
    }
  });

  // Preset Button Listeners
  const presetMap = [
    { id: 'btn-preset-a', key: 'preset_a' },
    { id: 'btn-preset-b', key: 'preset_b' },
    { id: 'btn-preset-c', key: 'preset_c' }
  ];

  presetMap.forEach(({ id, key }) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => applyPreset(key));
    }
  });

  // Slider Input Listeners
  const bindSlider = (id, onChange, keepPreset = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', (e) => {
      onChange(parseFloat(e.target.value));
      if (!keepPreset) {
        simState.active_preset = null;
        const lbl = document.getElementById('active-preset-label');
        if (lbl) lbl.textContent = 'Active: Custom Parameter Config';
        document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
      }
      updateSimulation();
      renderAllCharts(canvases, simState, Date.now());
    });
  };

  bindSlider('slider-ttx', (v) => {
    simState.t_tx_yr = v;
    const txt = document.getElementById('val-ttx');
    if (txt) txt.textContent = `${v.toFixed(1)} yr`;
  }, true);

  bindSlider('slider-alpha', (v) => {
    simState.alpha = v;
    const txt = document.getElementById('val-alpha');
    if (txt) txt.textContent = `${v.toFixed(2)} m/s²`;
  });

  bindSlider('slider-beta', (v) => {
    simState.beta = v;
    const txt = document.getElementById('val-beta');
    if (txt) txt.textContent = `${v.toFixed(2)} c`;
  });

  bindSlider('slider-tburn', (v) => {
    simState.t_burn = v;
    const txt = document.getElementById('val-tburn');
    if (txt) txt.textContent = `${v.toFixed(1)} yr`;
  });

  bindSlider('slider-ptx', (logV) => {
    simState.p_tx = Math.pow(10, logV);
    const txt = document.getElementById('val-ptx');
    if (txt) txt.textContent = `${formatUnits(simState.p_tx, 'W', 1)}`;
  });

  bindSlider('slider-dtx', (v) => {
    simState.d_tx = v;
    const txt = document.getElementById('val-dtx');
    if (txt) txt.textContent = `${v.toFixed(0)} m`;
  });

  bindSlider('slider-drefl', (v) => {
    simState.d_refl = v;
    const txt = document.getElementById('val-drefl');
    if (txt) txt.textContent = `${v.toFixed(1)} m`;
  });

  bindSlider('slider-drx', (v) => {
    simState.d_rx = v;
    const txt = document.getElementById('val-drx');
    if (txt) txt.textContent = `${v.toFixed(0)} m`;
  });

  bindSlider('slider-lambda', (v) => {
    simState.lambda_0 = v;
    const txt = document.getElementById('val-lambda');
    if (txt) txt.textContent = `${v.toFixed(0)} nm`;
  });

  bindSlider('slider-nh', (logV) => {
    simState.n_h = Math.pow(10, logV);
    const txt = document.getElementById('val-nh');
    if (txt) txt.textContent = `${simState.n_h.toFixed(2)} cm⁻³`;
  });

  // Apply default Preset B initially
  applyPreset('preset_b');

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', () => {
      renderAllCharts(canvases, simState, Date.now());
    });
  }

  // Animation Loop (Pulse packet animation in Minkowski diagram at 60 FPS)
  let lastAnimRedraw = 0;
  function animationLoop(timestamp) {
    if (timestamp - lastAnimRedraw > 30) {
      if (canvases.minkowski) {
        renderMinkowskiChart(canvases.minkowski, simState, timestamp);
      }
      lastAnimRedraw = timestamp;
    }
    requestAnimationFrame(animationLoop);
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(animationLoop);
  }
}

// Automatically initialize when loaded in browser DOM
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
