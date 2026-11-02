/**
 * web/js/charts.js
 *
 * Relativistic Optical Delay-Line Data Storage: Visualizer Deck
 * Pure HTML5 Canvas 2D Context Renderers
 *
 * Implements 4 high-fidelity physics-based interactive visualizers:
 * 1. Spacetime (ct, x) Minkowski Diagram with light cones, worldline, and null rays
 * 2. Retrieval Delay, Doppler Factor, and Wavelength Dynamics vs Mission Time
 * 3. Link Attenuation Breakdown (Diffraction, Relativistic, Dust) & Holevo Capacity
 * 4. In-Flight Data Storage Integral & Corner-Reflector Lorentz Aberration Optics
 *
 * Designed for 60 FPS redraw loop (< 16 ms/frame) and zero external dependencies.
 */

import {
  C_LIGHT,
  G_ACCEL,
  ARCSEC_PER_RAD,
  twoWayDopplerFactor,
  computeKinematics,
  receptionToTransmissionTime,
  getSpectralBand,
  computeOptics,
  computeLinkBudget,
  computeAberration,
  integrateInFlightBits
} from './physics.js';

// --- Color Constants & UI Palette (Deep Space Blue-Tinted Theme) ---
const PALETTE = {
  bg: '#060913',
  grid: '#1a2538',
  gridSubtle: '#121a28',
  axis: '#3b4a6b',
  border: '#26334d',
  text: '#cbd5e1',
  textMuted: '#64748b',
  cyan: '#06b6d4',
  blue: '#3b82f6',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  purple: '#a855f7',
  gold: '#fbbf24',
};

/**
 * Normalizes Canvas resolution for Retina / HiDPI screens.
 */
function setupCanvas(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const rawW = canvas.clientWidth || parseInt(canvas.getAttribute('width') || '800', 10) || 800;
  const rawH = canvas.clientHeight || parseInt(canvas.getAttribute('height') || '600', 10) || 600;
  const width = Math.max(200, rawW);
  const height = Math.max(150, rawH);
  const targetW = Math.round(width * dpr);
  const targetH = Math.round(height * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
  if (typeof ctx.setTransform === 'function') {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  } else {
    ctx.resetTransform?.();
    ctx.scale(dpr, dpr);
  }
  return { ctx, width, height };
}

// ============================================================================
// VISUALIZER 1: Spacetime (ct, x) Minkowski Diagram
// ============================================================================
export function renderMinkowskiChart(canvas, simState = {}, animTime = 0) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, width, height } = setup;

  // Clear canvas
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, width, height);

  // Margins & Plot area
  const padL = 65, padR = 30, padT = 35, padB = 55;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const alpha = (simState.alpha !== undefined && simState.alpha !== null) ? Number(simState.alpha) : G_ACCEL;
  const betaCoast = Number(simState.beta !== undefined ? simState.beta : 0.5);
  const tTxYr = (simState.t_tx_yr !== undefined && simState.t_tx_yr !== null) ? Number(simState.t_tx_yr) : 10.0;
  const Th_sec = alpha > 0 ? (C_LIGHT / alpha) : 1e12;
  const Th_ly = Th_sec / (365.25 * 86400);

  const pKin = {
    alpha: alpha,
    beta_coast: betaCoast,
    t_burn: (simState.t_burn || 1.0) * 365.25 * 86400,
    trajectory_type: simState.active_preset === 'preset_c' ? 'hyperbolic' : 'piecewise'
  };
  const kinSelected = computeKinematics(pKin, tTxYr * 365.25 * 86400);
  const selectedRxLy = isFinite(kinSelected.t_rx) ? (kinSelected.t_rx / (365.25 * 86400)) : (tTxYr * 2.5);

  // Dynamic axis scaling (light-years) adapting up to 2000+ years
  const maxLY = pKin.trajectory_type === 'hyperbolic'
    ? Math.max(2.5, Math.min(25.0, isFinite(kinSelected.t_rx) ? Math.max(Th_ly * 2.2, selectedRxLy * 1.15) : Math.max(Th_ly * 2.5, tTxYr * 1.25)))
    : Math.max(3.0, selectedRxLy * 1.15, tTxYr * 1.4);
  const xToPx = (x_ly) => padL + (x_ly / maxLY) * plotW;
  const ctToPx = (ct_ly) => (padT + plotH) - (ct_ly / maxLY) * plotH;

  // Draw Grid Lines & Axes
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const v = (i / gridSteps) * maxLY;
    const px = xToPx(v);
    const py = ctToPx(v);

    // Vertical grid
    ctx.beginPath();
    ctx.moveTo(px, padT);
    ctx.lineTo(px, padT + plotH);
    ctx.stroke();

    // Horizontal grid
    ctx.beginPath();
    ctx.moveTo(padL, py);
    ctx.lineTo(padL + plotW, py);
    ctx.stroke();

    // Ticks & labels
    const labelStr = maxLY >= 20 ? `${Math.round(v)}` : `${v.toFixed(1)}`;
    ctx.fillStyle = PALETTE.textMuted;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labelStr, px, padT + plotH + 18);
    ctx.textAlign = 'right';
    ctx.fillText(labelStr, padL - 8, py + 4);
  }

  // Axis Labels
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 12px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Coordinate Distance x [Light-Years]', padL + plotW / 2, padT + plotH + 42);

  ctx.save();
  ctx.translate(18, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Coordinate Time ct [Light-Years]', 0, 0);
  ctx.restore();

  // 1. Light Cones (45-degree null lines: ct = +- x)
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(xToPx(0), ctToPx(0));
  ctx.lineTo(xToPx(maxLY), ctToPx(maxLY));
  ctx.stroke();
  ctx.restore();

  // Light cone annotation
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '10px monospace';
  ctx.fillText('Null Light Cone (dx/d(ct) = 1)', xToPx(maxLY * 0.5) + 30, ctToPx(maxLY * 0.5) - 8);

  // 2. Rindler Horizon Asymptote (ct - x = c^2 / alpha)
  if (alpha > 0.05 && Th_ly < maxLY * 1.5) {
    ctx.save();
    ctx.strokeStyle = PALETTE.rose;
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(xToPx(0), ctToPx(Th_ly));
    ctx.lineTo(xToPx(maxLY), ctToPx(Th_ly + maxLY));
    ctx.stroke();

    ctx.fillStyle = PALETTE.rose;
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`Rindler Horizon Cutoff (ct - x = ${Th_ly.toFixed(2)} ly)`, xToPx(maxLY * 0.2), ctToPx(Th_ly + maxLY * 0.2) - 8);
    ctx.restore();
  }

  // 3. Craft Worldline (Hyperbolic boost + Inertial coast)
  ctx.save();
  ctx.beginPath();
  if (typeof ctx.rect === 'function' && typeof ctx.clip === 'function') {
    ctx.rect(padL, padT, plotW, plotH);
    ctx.clip();
  }
  ctx.strokeStyle = PALETTE.cyan;
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(6, 182, 212, 0.6)';
  ctx.shadowBlur = 8;
  ctx.beginPath();

  const numWorldlinePts = 100;
  const alphaEff = alpha > 0 ? alpha : G_ACCEL;
  const Th_eff = C_LIGHT / alphaEff;
  const beta_c = Math.min(Math.max(betaCoast, 0.001), 0.999999);
  const gamma_c = 1.0 / Math.sqrt(1.0 - beta_c * beta_c);
  const t1_boost = Th_eff * beta_c * gamma_c;

  for (let i = 0; i <= numWorldlinePts; i++) {
    const frac = i / numWorldlinePts;
    const t_sec = frac * (maxLY * 365.25 * 86400);
    let x_m = 0;

    if (pKin.trajectory_type === 'hyperbolic') {
      const s = t_sec / Th_eff;
      x_m = C_LIGHT * Th_eff * (Math.sqrt(1.0 + s * s) - 1.0);
    } else {
      if (t_sec <= t1_boost) {
        const s = t_sec / Th_eff;
        x_m = C_LIGHT * Th_eff * (Math.sqrt(1.0 + s * s) - 1.0);
      } else {
        const x_b = C_LIGHT * Th_eff * (gamma_c - 1.0);
        x_m = x_b + C_LIGHT * beta_c * (t_sec - t1_boost);
      }
    }

    const x_ly = x_m / (C_LIGHT * 365.25 * 86400);
    const ct_ly = t_sec / (365.25 * 86400);
    const px = xToPx(x_ly);
    const py = ctToPx(ct_ly);

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();

  // 4. Optical Signal Null Rays (Forward transmission & Return reflection)
  const numRays = 4;
  const t_tx_max = pKin.trajectory_type === 'hyperbolic'
    ? Math.min(Th_sec * 0.92, maxLY * 365.25 * 86400 * 0.4)
    : maxLY * 365.25 * 86400 * 0.35;

  for (let r = 0; r < numRays; r++) {
    const frac = (r + 1) / (numRays + 1);
    const tx_s = frac * t_tx_max;
    const kin = computeKinematics(pKin, tx_s);

    if (isFinite(kin.t_refl) && isFinite(kin.x_refl) && isFinite(kin.t_rx)) {
      const tx_ly = tx_s / (365.25 * 86400);
      const x_refl_ly = kin.x_refl / (C_LIGHT * 365.25 * 86400);
      const ct_refl_ly = kin.t_refl / (365.25 * 86400);
      const ct_rx_ly = kin.t_rx / (365.25 * 86400);

      ctx.save();
      if (typeof ctx.rect === 'function' && typeof ctx.clip === 'function') {
        ctx.beginPath();
        ctx.rect(padL, padT, plotW, plotH);
        ctx.clip();
      }
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.32)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(xToPx(0), ctToPx(tx_ly));
      ctx.lineTo(xToPx(x_refl_ly), ctToPx(ct_refl_ly));
      ctx.stroke();

      ctx.strokeStyle = 'rgba(16, 185, 129, 0.32)';
      ctx.beginPath();
      ctx.moveTo(xToPx(x_refl_ly), ctToPx(ct_refl_ly));
      ctx.lineTo(xToPx(0), ctToPx(ct_rx_ly));
      ctx.stroke();

      ctx.fillStyle = 'rgba(251, 191, 36, 0.6)';
      ctx.beginPath();
      ctx.arc(xToPx(x_refl_ly), ctToPx(ct_refl_ly), 2.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
  }

  // 1) Highlighted Arriving Readout Ray at Earth Time t_rx = T (emitted in the past at t_tx*)
  const t_tx_past_s = receptionToTransmissionTime(tTxYr * 365.25 * 86400, pKin);
  const kinPast = computeKinematics(pKin, t_tx_past_s);
  if (isFinite(kinPast.t_refl) && isFinite(kinPast.x_refl)) {
    const tx_past_ly = t_tx_past_s / (365.25 * 86400);
    const x_refl_past_ly = kinPast.x_refl / (C_LIGHT * 365.25 * 86400);
    const ct_refl_past_ly = kinPast.t_refl / (365.25 * 86400);
    const ct_rx_now_ly = tTxYr;

    ctx.save();
    if (typeof ctx.rect === 'function' && typeof ctx.clip === 'function') {
      ctx.beginPath();
      ctx.rect(padL, padT, plotW, plotH);
      ctx.clip();
    }
    ctx.strokeStyle = PALETTE.purple;
    ctx.lineWidth = 2.0;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(xToPx(0), ctToPx(tx_past_ly));
    ctx.lineTo(xToPx(x_refl_past_ly), ctToPx(ct_refl_past_ly));
    ctx.stroke();

    ctx.strokeStyle = PALETTE.emerald;
    ctx.lineWidth = 2.6;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(xToPx(x_refl_past_ly), ctToPx(ct_refl_past_ly));
    ctx.lineTo(xToPx(0), ctToPx(ct_rx_now_ly));
    ctx.stroke();

    ctx.fillStyle = PALETTE.emerald;
    ctx.beginPath();
    ctx.arc(xToPx(x_refl_past_ly), ctToPx(ct_refl_past_ly), 4.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  // 2) Highlighted Outgoing Write Ray at Earth Time t_tx = T
  if (isFinite(kinSelected.t_refl) && isFinite(kinSelected.x_refl) && isFinite(kinSelected.t_rx)) {
    const tx_ly = tTxYr;
    const x_refl_ly = kinSelected.x_refl / (C_LIGHT * 365.25 * 86400);
    const ct_refl_ly = kinSelected.t_refl / (365.25 * 86400);
    const ct_rx_ly = kinSelected.t_rx / (365.25 * 86400);

    ctx.save();
    if (typeof ctx.rect === 'function' && typeof ctx.clip === 'function') {
      ctx.beginPath();
      ctx.rect(padL, padT, plotW, plotH);
      ctx.clip();
    }
    ctx.strokeStyle = PALETTE.amber;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(xToPx(0), ctToPx(tx_ly));
    ctx.lineTo(xToPx(x_refl_ly), ctToPx(ct_refl_ly));
    ctx.stroke();

    ctx.strokeStyle = PALETTE.emerald;
    ctx.lineWidth = 2.0;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xToPx(x_refl_ly), ctToPx(ct_refl_ly));
    ctx.lineTo(xToPx(0), ctToPx(ct_rx_ly));
    ctx.stroke();

    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.arc(xToPx(x_refl_ly), ctToPx(ct_refl_ly), 4.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  // Dynamic Animated Pulse Packet along Selected Ray
  if (animTime > 0) {
    const cycle = (animTime % 3000) / 3000;
    const kinAnim = isFinite(kinSelected.t_refl) ? kinSelected : kinPast;
    if (isFinite(kinAnim.t_refl)) {
      const tx_ly = kinAnim.t_tx / (365.25 * 86400);
      const x_refl_ly = kinAnim.x_refl / (C_LIGHT * 365.25 * 86400);
      const ct_refl_ly = kinAnim.t_refl / (365.25 * 86400);
      const ct_rx_ly = kinAnim.t_rx / (365.25 * 86400);

      let px, py, color;
      if (cycle < 0.5) {
        const t = cycle * 2;
        px = xToPx(t * x_refl_ly);
        py = ctToPx(tx_ly + t * (ct_refl_ly - tx_ly));
        color = PALETTE.amber;
      } else {
        const t = (cycle - 0.5) * 2;
        px = xToPx((1 - t) * x_refl_ly);
        py = ctToPx(ct_refl_ly + t * (ct_rx_ly - ct_refl_ly));
        color = PALETTE.emerald;
      }

      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
  }

  // Legend Box
  ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  const legW = 225, legH = 82;
  const legX = padL + 12, legY = padT + 12;
  ctx.fillRect(legX, legY, legW, legH);
  ctx.strokeRect(legX, legY, legW, legH);

  const drawLegendItem = (x, y, color, label, isDashed = false) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (isDashed) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 20, y);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = PALETTE.text;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 26, y + 4);
  };

  drawLegendItem(legX + 12, legY + 18, PALETTE.cyan, 'Spacecraft Worldline');
  drawLegendItem(legX + 12, legY + 36, PALETTE.emerald, 'Readout Ray Arriving at T');
  drawLegendItem(legX + 12, legY + 54, PALETTE.amber, 'Write Ray Sent at T');
  drawLegendItem(legX + 12, legY + 72, PALETTE.rose, 'Rindler Horizon', true);

  // Redshift Callout Badge on Minkowski Diagram (Bottom-Right)
  const rawL0 = Number(simState.lambda_0 || 532);
  const l0_m = rawL0 > 1e-3 ? rawL0 * 1e-9 : rawL0;
  const d2Arr = kinPast.D2 > 0 ? kinPast.D2 : 1.0;
  const lRx_m = l0_m / d2Arr;
  const zArr = 1.0 / d2Arr - 1.0;
  const fmtWl = (m) => {
    const nm = m * 1e9;
    if (nm < 1000) return `${nm.toFixed(0)} nm`;
    if (nm < 1e6) return `${(nm / 1e3).toFixed(2)} µm`;
    return `${(nm / 1e6).toFixed(2)} mm`;
  };
  const bandShort = getSpectralBand(lRx_m).replace(/.*\(|\)/g, '');
  const boxW = 240, boxH = 44;
  const boxX = padL + plotW - boxW - 10;
  const boxY = padT + plotH - boxH - 10;
  ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = PALETTE.emerald;
  ctx.font = 'bold 10.5px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`Arriving at T: λ_tx ${Math.round(l0_m * 1e9)}nm → λ_rx ${fmtWl(lRx_m)}`, boxX + 8, boxY + 17);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '10.5px monospace';
  ctx.fillText(`Redshift z = ${zArr.toFixed(2)} (${(1.0 / d2Arr).toFixed(2)}×) [${bandShort}]`, boxX + 8, boxY + 34);
}

// ============================================================================
// VISUALIZER 2: Delay, Doppler Factor, Redshift (z), and Wavelength Dynamics
// ============================================================================
export function renderDopplerChart(canvas, simState = {}) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, width, height } = setup;

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, width, height);

  const padL = 62, padR = 88, padT = 35, padB = 55;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const alpha = (simState.alpha !== undefined && simState.alpha !== null) ? Number(simState.alpha) : G_ACCEL;
  const betaCoast = Number(simState.beta !== undefined ? simState.beta : 0.5);
  const tTxYr = (simState.t_tx_yr !== undefined && simState.t_tx_yr !== null) ? Number(simState.t_tx_yr) : 10.0;
  const rawLambda = Number(simState.lambda_0 || 532);
  const lambda0_nm = rawLambda < 1e-3 ? rawLambda * 1e9 : rawLambda;
  const Th_days = alpha > 0 ? (C_LIGHT / alpha) / 86400 : 3650;
  const Th_yr = Th_days / 365.25;

  const pKin = {
    alpha: alpha,
    beta_coast: betaCoast,
    t_burn: (simState.t_burn || 1.0) * 365.25 * 86400,
    trajectory_type: simState.active_preset === 'preset_c' ? 'hyperbolic' : 'piecewise'
  };

  // X-axis: Transmission time t_tx (years), scaling dynamically up to 2000 years
  const maxYears = pKin.trajectory_type === 'hyperbolic'
    ? Math.max(1.2, Math.min(2000.0, Math.max(Th_yr * 1.15, tTxYr * 1.2)))
    : Math.max(3.0, Math.min(2000.0, tTxYr * 1.25));
  const xToPx = (yr) => padL + (yr / maxYears) * plotW;

  // Compute Dynamics Curves first so we can auto-scale Wavelength & Redshift Axis
  const numPts = 120;
  let peakDelayYr = 1.0;
  let peakLambdaUm = (lambda0_nm * 1e-3) * 3.0;
  const samples = [];
  for (let i = 0; i <= numPts; i++) {
    const tx_yr = (i / numPts) * maxYears;
    const kin = computeKinematics(pKin, tx_yr * 365.25 * 86400);
    const delay_yr = isFinite(kin.delta_t) ? (kin.delta_t / (365.25 * 86400)) : null;
    if (delay_yr !== null && delay_yr > peakDelayYr) peakDelayYr = delay_yr;
    if (kin.D2 > 0.01) {
      const lum = (lambda0_nm * 1e-3) / kin.D2;
      if (lum > peakLambdaUm) peakLambdaUm = lum;
    }
    samples.push({ tx_yr, kin, delay_yr });
  }
  const maxDelayYr = Math.max(1.0, Math.ceil(peakDelayYr * 1.15));
  const maxLambda_um = Math.max(2.5, Math.min(250.0, Math.ceil(peakLambdaUm * 1.25)));

  // Background Spectral Band Indicators (Received wavelength bands)
  const spectralBands = [
    { name: 'Visible', minUm: 0.38, maxUm: 0.75, color: 'rgba(59, 130, 246, 0.08)', textCol: '#60a5fa' },
    { name: 'NIR',     minUm: 0.75, maxUm: 1.40, color: 'rgba(168, 85, 247, 0.07)', textCol: '#c084fc' },
    { name: 'SWIR',    minUm: 1.40, maxUm: 3.00, color: 'rgba(6, 182, 212, 0.08)', textCol: '#22d3ee' },
    { name: 'MWIR',    minUm: 3.00, maxUm: 8.00, color: 'rgba(16, 185, 129, 0.08)', textCol: '#34d399' },
    { name: 'LWIR',    minUm: 8.00, maxUm: 15.0, color: 'rgba(245, 158, 11, 0.08)', textCol: '#fbbf24' },
    { name: 'Far-IR',  minUm: 15.0, maxUm: 250.0, color: 'rgba(244, 63, 94, 0.07)', textCol: '#fb7185' }
  ];

  spectralBands.forEach(band => {
    if (band.minUm >= maxLambda_um) return;
    const lowUm = Math.max(0, band.minUm);
    const highUm = Math.min(maxLambda_um, band.maxUm);
    if (highUm <= lowUm) return;
    const pyTop = (padT + plotH) - (highUm / maxLambda_um) * plotH;
    const pyBot = (padT + plotH) - (lowUm / maxLambda_um) * plotH;
    ctx.fillStyle = band.color;
    ctx.fillRect(padL, pyTop, plotW, pyBot - pyTop);
    if (pyBot - pyTop >= 14) {
      ctx.fillStyle = band.textCol;
      ctx.font = 'bold 9.5px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(band.name, padL + plotW - 6, (pyTop + pyBot) / 2 + 3);
    }
  });

  // Draw Grid Lines & Left Axis (Doppler Factor D_2: 0.0 to 1.0)
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const d2_val = i / 5.0;
    const py = (padT + plotH) - (d2_val * plotH);

    ctx.beginPath();
    ctx.moveTo(padL, py);
    ctx.lineTo(padL + plotW, py);
    ctx.stroke();

    ctx.fillStyle = PALETTE.textMuted;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(d2_val.toFixed(2), padL - 8, py + 4);
  }

  // Right Axis Ticks (Received Wavelength lambda_rx in µm and Redshift z)
  const lambda0_um = lambda0_nm * 1e-3;
  for (let i = 0; i <= 5; i++) {
    const l_um = (i / 5.0) * maxLambda_um;
    const z_tick = Math.max(0, l_um / lambda0_um - 1.0);
    const py = (padT + plotH) - (i / 5.0) * plotH;
    ctx.fillStyle = PALETTE.rose;
    ctx.font = '10.5px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    const zLbl = i === 0 ? 'z=0' : `z=${z_tick >= 10 ? Math.round(z_tick) : z_tick.toFixed(1)}`;
    ctx.fillText(`${l_um.toFixed(1)}µm (${zLbl})`, padL + plotW + 5, py + 4);
  }

  // X Axis Ticks & Labels
  for (let i = 0; i <= 5; i++) {
    const yr = (i / 5.0) * maxYears;
    const px = xToPx(yr);
    const lbl = maxYears >= 25 ? `${Math.round(yr)} yr` : `${yr.toFixed(1)} yr`;
    ctx.fillStyle = PALETTE.textMuted;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(lbl, px, padT + plotH + 18);
  }

  // Axis Titles
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 12px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Earth Elapsed Time [Years]', padL + plotW / 2, padT + plotH + 42);

  ctx.save();
  ctx.translate(16, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = PALETTE.cyan;
  ctx.fillText('Two-Way Doppler Factor D_2', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(width - 10, padT + plotH / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = PALETTE.rose;
  ctx.fillText('Returned Wavelength λ_rx & Redshift z', 0, 0);
  ctx.restore();

  // 1. Plot Doppler Factor D_2(t_tx)
  ctx.save();
  ctx.strokeStyle = PALETTE.cyan;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  samples.forEach(({ tx_yr, kin }, i) => {
    const px = xToPx(tx_yr);
    const d2 = Math.max(0, Math.min(1.0, kin.D2));
    const py = (padT + plotH) - d2 * plotH;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();

  // 2. Plot Received Wavelength lambda_rx(t_tx) & Redshift z(t_tx)
  ctx.save();
  ctx.strokeStyle = PALETTE.rose;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  samples.forEach(({ tx_yr, kin }, i) => {
    const px = xToPx(tx_yr);
    const l_rx_um = kin.D2 > 0 ? (lambda0_nm * 1e-3) / kin.D2 : maxLambda_um;
    const py = (padT + plotH) - Math.min(1.0, l_rx_um / maxLambda_um) * plotH;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();

  // 2b. Plot Normalized Round-Trip Delay delta_t(t_tx)
  ctx.save();
  ctx.strokeStyle = PALETTE.amber;
  ctx.lineWidth = 2.2;
  ctx.setLineDash([6, 3]);
  ctx.beginPath();
  samples.forEach(({ tx_yr, delay_yr }, i) => {
    const px = xToPx(tx_yr);
    const d_yr = delay_yr !== null ? delay_yr : maxDelayYr;
    const py = (padT + plotH) - Math.min(1.0, Math.max(0.0, d_yr / maxDelayYr)) * plotH;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();

  // 3. Rindler Horizon Asymptote Line
  if (pKin.trajectory_type === 'hyperbolic' && alpha > 0.05 && Th_yr <= maxYears) {
    const pxH = xToPx(Th_yr);
    if (pxH <= padL + plotW) {
      ctx.save();
      ctx.strokeStyle = PALETTE.rose;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pxH, padT);
      ctx.lineTo(pxH, padT + plotH);
      ctx.stroke();

      ctx.fillStyle = PALETTE.rose;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`Horizon Cutoff (T_h = ${Th_yr.toFixed(2)} yr)`, pxH - 6, padT + 18);
      ctx.restore();
    }
  }

  // 4. Current Selected Earth Time Marker (t_tx_yr) & Past Emission Time Marker (t_tx*)
  const t_tx_past_s = receptionToTransmissionTime(tTxYr * 365.25 * 86400, pKin);
  const kinPast = computeKinematics(pKin, t_tx_past_s);
  if (tTxYr >= 0 && tTxYr <= maxYears) {
    const pxSel = xToPx(tTxYr);
    const kinSel = computeKinematics(pKin, tTxYr * 365.25 * 86400);
    ctx.save();
    ctx.strokeStyle = PALETTE.gold;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pxSel, padT);
    ctx.lineTo(pxSel, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    if (kinSel.D2 > 0) {
      const l_rx_um = (lambda0_nm * 1e-3) / kinSel.D2;
      const pyWl = (padT + plotH) - Math.min(1.0, l_rx_um / maxLambda_um) * plotH;
      ctx.fillStyle = PALETTE.rose;
      ctx.beginPath();
      ctx.arc(pxSel, pyWl, 4.5, 0, 2 * Math.PI);
      ctx.fill();
    }

    if (isFinite(kinSel.delta_t)) {
      const selDelayYr = kinSel.delta_t / (365.25 * 86400);
      const pyDelay = (padT + plotH) - Math.min(1.0, Math.max(0.0, selDelayYr / maxDelayYr)) * plotH;
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(pxSel, pyDelay, 4.5, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }

  // Legend Box & Live Redshift Readout
  ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  const legW = 265, legH = 84;
  const legX = padL + 10, legY = padT + 10;
  ctx.fillRect(legX, legY, legW, legH);
  ctx.strokeRect(legX, legY, legW, legH);

  const drawLegItem = (x, y, color, label, dashed = false) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (dashed) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 18, y);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = PALETTE.text;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 24, y + 4);
  };

  const d2Arr = kinPast.D2 > 0 ? kinPast.D2 : 1.0;
  const zArr = 1.0 / d2Arr - 1.0;
  const lRxArrUm = (lambda0_nm * 1e-3) / d2Arr;
  const bandArr = getSpectralBand(lRxArrUm * 1e-6).replace(/.*\(|\)/g, '');

  drawLegItem(legX + 10, legY + 16, PALETTE.cyan, `Doppler Factor D₂ (Arriving: ${d2Arr.toFixed(3)})`);
  drawLegItem(legX + 10, legY + 34, PALETTE.rose, `Redshifted λ_rx & z (from ${Math.round(lambda0_nm)} nm)`);
  drawLegItem(legX + 10, legY + 52, PALETTE.amber, `Round-Trip Delay Δt (0-${maxDelayYr >= 10 ? Math.round(maxDelayYr) : maxDelayYr.toFixed(1)} yr)`, true);

  ctx.fillStyle = PALETTE.rose;
  ctx.font = 'bold 10.5px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`At T: λ_rx=${lRxArrUm.toFixed(2)}µm | z=${zArr.toFixed(2)} (${(1.0/d2Arr).toFixed(2)}×) [${bandArr}]`, legX + 10, legY + 72);
}

// ============================================================================
// VISUALIZER 3: Link Attenuation Breakdown & Gordon-Holevo Capacity
// ============================================================================
export function renderLinkChart(canvas, simState = {}) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, width, height } = setup;

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, width, height);

  const padL = 65, padR = 65, padT = 35, padB = 55;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  // Log Distance: 10^12 m (100 AU) to 10^19 m (~1000 light-years)
  const logMinDist = 12.0;
  const logMaxDist = 19.0;
  const logDToPx = (logD) => padL + ((logD - logMinDist) / (logMaxDist - logMinDist)) * plotW;

  // Attenuation scale: 0 dB to -240 dB
  const minDB = -240.0;
  const maxDB = 0.0;
  const dbToPx = (db) => padT + ((maxDB - Math.max(minDB, db)) / (maxDB - minDB)) * plotH;

  // Draw Grid Lines & Left Axis (Attenuation dB)
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  for (let db = 0; db >= minDB; db -= 40) {
    const py = dbToPx(db);
    ctx.beginPath();
    ctx.moveTo(padL, py);
    ctx.lineTo(padL + plotW, py);
    ctx.stroke();

    ctx.fillStyle = PALETTE.textMuted;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${db} dB`, padL - 8, py + 4);
  }

  // Right Axis Ticks (Gordon-Holevo Capacity: 10^9 to 1 bps)
  for (let exp = 9; exp >= 0; exp -= 3) {
    const frac = (9 - exp) / 9.0;
    const py = padT + frac * plotH;
    ctx.fillStyle = PALETTE.amber;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`10^${exp} bps`, padL + plotW + 8, py + 4);
  }

  // X Axis Ticks (Distance in meters / AU / ly)
  for (let exp = 12; exp <= 19; exp++) {
    const px = logDToPx(exp);
    ctx.fillStyle = PALETTE.textMuted;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`10^${exp} m`, px, padT + plotH + 18);
  }

  // Axis Labels
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 12px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Target Reflection Distance x_refl [Log10 Meters]', padL + plotW / 2, padT + plotH + 42);

  ctx.save();
  ctx.translate(18, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = PALETTE.blue;
  ctx.fillText('Optical Link Attenuation [dB]', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(width - 15, padT + plotH / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = PALETTE.amber;
  ctx.fillText('Holevo Capacity C_Holevo [bps]', 0, 0);
  ctx.restore();

  // Model Parameters
  const D_tx = Number(simState.d_tx || 30.0);
  const D_refl = Number(simState.d_refl || 50.0);
  const D_rx = Number(simState.d_rx || 50.0);
  const P_tx = (simState.p_tx !== undefined && simState.p_tx !== null) ? Number(simState.p_tx) : 1.0e9;
  const rawLambda = Number(simState.lambda_0 || 532.0);
  const lambda_0 = rawLambda > 1e-3 ? rawLambda * 1e-9 : rawLambda;
  const rawNh = Number(simState.n_h !== undefined ? simState.n_h : 0.1);
  const n_H = rawNh < 1e3 ? rawNh * 1.0e6 : rawNh;
  const beta = Number(simState.beta !== undefined ? simState.beta : 0.5);
  const D2 = twoWayDopplerFactor(beta);

  const numSteps = 100;
  const geomPoints = [];
  const dustPoints = [];
  const totalPoints = [];
  const capacityPoints = [];

  for (let i = 0; i <= numSteps; i++) {
    const logD = logMinDist + (i / numSteps) * (logMaxDist - logMinDist);
    const dist = Math.pow(10, logD);
    const lb = computeLinkBudget({
      P_tx: P_tx,
      D_tx: D_tx,
      D_refl: D_refl,
      D_rx: D_rx,
      lambda_0: lambda_0,
      n_H: n_H
    }, dist, D2);

    const px = logDToPx(logD);
    const dbGeom = 10 * Math.log10(Math.max(1e-25, lb.eta_geom));
    const dbDust = 10 * Math.log10(Math.max(1e-25, lb.eta_dust));
    const dbTotal = 10 * Math.log10(Math.max(1e-25, lb.eta_geom * lb.eta_dust * lb.eta_rel));

    geomPoints.push({ px, py: dbToPx(dbGeom) });
    dustPoints.push({ px, py: dbToPx(dbDust) });
    totalPoints.push({ px, py: dbToPx(dbTotal) });

    const logC = lb.C_holevo_bps > 1.0 ? Math.log10(lb.C_holevo_bps) : 0.0;
    const pyC = padT + ((9.0 - Math.min(9.0, Math.max(0.0, logC))) / 9.0) * plotH;
    capacityPoints.push({ px, py: pyC });
  }

  // Draw Geometric Diffraction Curve (Blue)
  ctx.save();
  ctx.strokeStyle = PALETTE.blue;
  ctx.lineWidth = 2;
  ctx.beginPath();
  geomPoints.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py));
  ctx.stroke();

  // Draw Dust Extinction Curve (Purple)
  ctx.strokeStyle = PALETTE.purple;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  dustPoints.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py));
  ctx.stroke();

  // Draw Total Attenuation Curve (Cyan, thick)
  ctx.strokeStyle = PALETTE.cyan;
  ctx.setLineDash([]);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  totalPoints.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py));
  ctx.stroke();

  // Draw Holevo Capacity Curve (Amber)
  ctx.strokeStyle = PALETTE.amber;
  ctx.lineWidth = 2;
  ctx.beginPath();
  capacityPoints.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py));
  ctx.stroke();
  ctx.restore();

  // Near-field Rayleigh crossover line
  const d_rayleigh = (Math.PI * D_tx * D_refl) / (4.0 * lambda_0);
  const logD_rayleigh = Math.log10(d_rayleigh);
  if (logD_rayleigh >= logMinDist && logD_rayleigh <= logMaxDist) {
    const pxR = logDToPx(logD_rayleigh);
    ctx.save();
    ctx.strokeStyle = PALETTE.emerald;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pxR, padT);
    ctx.lineTo(pxR, padT + plotH);
    ctx.stroke();

    ctx.fillStyle = PALETTE.emerald;
    ctx.font = '10px monospace';
    ctx.fillText('Rayleigh Far-Field Limit', pxR + 5, padT + 25);
    ctx.restore();
  }

  // Current Reflection Distance Markers for selected Earth Time T (Readout vs Write)
  const alphaLink = (simState.alpha !== undefined && simState.alpha !== null) ? Number(simState.alpha) : G_ACCEL;
  const tTxYrLink = (simState.t_tx_yr !== undefined && simState.t_tx_yr !== null) ? Number(simState.t_tx_yr) : 10.0;
  const pKinLink = {
    alpha: alphaLink,
    beta_coast: beta,
    t_burn: (simState.t_burn || 1.0) * 365.25 * 86400,
    trajectory_type: simState.active_preset === 'preset_c' ? 'hyperbolic' : 'piecewise'
  };

  // 1) Readout Reflection Distance arriving at Earth at t_rx = T
  const t_tx_past_link = receptionToTransmissionTime(tTxYrLink * 365.25 * 86400, pKinLink);
  const kinRxLink = computeKinematics(pKinLink, t_tx_past_link);
  if (isFinite(kinRxLink.x_refl) && kinRxLink.x_refl > 0) {
    const logXRx = Math.log10(kinRxLink.x_refl);
    if (logXRx >= logMinDist && logXRx <= logMaxDist) {
      const pxX = logDToPx(logXRx);
      ctx.save();
      ctx.strokeStyle = PALETTE.emerald;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(pxX, padT);
      ctx.lineTo(pxX, padT + plotH);
      ctx.stroke();

      ctx.fillStyle = PALETTE.emerald;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = logXRx > 17.0 ? 'right' : 'left';
      const offsetX = logXRx > 17.0 ? -5 : 5;
      const d_ly = kinRxLink.x_refl / (C_LIGHT * 365.25 * 86400);
      ctx.fillText(`Readout d_refl*(T): ${d_ly.toFixed(2)} ly`, pxX + offsetX, padT + plotH - 28);
      ctx.restore();
    }
  }

  // 2) Write Reflection Distance sent from Earth at t_tx = T
  const kinLink = computeKinematics(pKinLink, tTxYrLink * 365.25 * 86400);
  if (isFinite(kinLink.x_refl) && kinLink.x_refl > 0) {
    const logX = Math.log10(kinLink.x_refl);
    if (logX >= logMinDist && logX <= logMaxDist) {
      const pxX = logDToPx(logX);
      ctx.save();
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(pxX, padT);
      ctx.lineTo(pxX, padT + plotH);
      ctx.stroke();

      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = logX > 17.0 ? 'right' : 'left';
      const offsetX = logX > 17.0 ? -5 : 5;
      const d_ly = kinLink.x_refl / (C_LIGHT * 365.25 * 86400);
      ctx.fillText(`Write d_refl(T): ${d_ly.toFixed(2)} ly`, pxX + offsetX, padT + plotH - 12);
      ctx.restore();
    }
  }

  // Legend Box
  ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  const legW = 248, legH = 92;
  const legX = padL + 12, legY = padT + 12;
  ctx.fillRect(legX, legY, legW, legH);
  ctx.strokeRect(legX, legY, legW, legH);

  const drawLegItem = (x, y, color, label, dashed = false) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (dashed) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 18, y);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = PALETTE.text;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 24, y + 4);
  };

  const d2Link = kinRxLink.D2 > 0 ? kinRxLink.D2 : 1.0;
  const zLink = 1.0 / d2Link - 1.0;
  const lRxLinkUm = (lambda_0 * 1e6) / d2Link;

  drawLegItem(legX + 10, legY + 16, PALETTE.cyan, 'Total 2-Way Attenuation (dB)');
  drawLegItem(legX + 10, legY + 34, PALETTE.blue, 'Geometric Diffraction (1/d⁴)');
  drawLegItem(legX + 10, legY + 52, PALETTE.purple, 'ISM Dust Extinction (dB)', true);
  drawLegItem(legX + 10, legY + 70, PALETTE.amber, 'Holevo Channel Rate (bps)');

  ctx.fillStyle = PALETTE.rose;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`Return Leg: λ_rx=${lRxLinkUm.toFixed(2)}µm (z=${zLink.toFixed(2)}, ${(1.0/d2Link).toFixed(2)}×)`, legX + 10, legY + 85);
}

// ============================================================================
// VISUALIZER 4: In-Flight Data Storage & Retroreflector Aberration Optics
// ============================================================================
export function renderStorageChart(canvas, simState = {}) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, width, height } = setup;

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, width, height);

  // Split canvas into two functional halves:
  // Left half: Cumulative In-Flight Stored Bits Curve B_flight(t)
  // Right half: Retroreflector Velocity Aberration Beam Profile & Dihedral Offset
  const midX = Math.round(width * 0.48);

  // --- LEFT PANEL: In-Flight Stored Bits ---
  const padL = 60, padR = 25, padT = 35, padB = 55;
  const plotW1 = midX - padL - padR;
  const plotH1 = height - padT - padB;

  const alpha = (simState.alpha !== undefined && simState.alpha !== null) ? Number(simState.alpha) : G_ACCEL;
  const beta = Number(simState.beta !== undefined ? simState.beta : 0.5);
  const tTxYr = (simState.t_tx_yr !== undefined && simState.t_tx_yr !== null) ? Number(simState.t_tx_yr) : 10.0;
  const maxTime_yr = Math.max(3.0, Math.min(2000.0, tTxYr * 1.25));

  const tToPx = (t_yr) => padL + (t_yr / maxTime_yr) * plotW1;

  // Storage Integral Curve
  const pKin = {
    alpha: alpha,
    beta_coast: beta,
    t_burn: (simState.t_burn || 1.0) * 365.25 * 86400,
    trajectory_type: simState.active_preset === 'preset_c' ? 'hyperbolic' : 'piecewise'
  };

  // Scale nominal transmission rate with log transmit power so slider changes are reflected
  const pTxVal = (simState.p_tx !== undefined && simState.p_tx !== null) ? Number(simState.p_tx) : 1.0e9;
  const rateScale = Math.max(0.1, Math.log10(Math.max(1e3, pTxVal)) / 9.0);
  const nominalRateBps = 1.0e9 * rateScale;

  const rawSamples = [];
  const numSteps = 50;
  let peakTB = 0.0;
  for (let i = 0; i <= numSteps; i++) {
    const t_yr = (i / numSteps) * maxTime_yr;
    const t_sec = t_yr * 365.25 * 86400;
    const bits = integrateInFlightBits(t_sec, pKin, () => nominalRateBps, 20);
    if (bits.in_flight_TB > peakTB) peakTB = bits.in_flight_TB;
    rawSamples.push({ t_yr, tb: bits.in_flight_TB });
  }

  const maxStorage_TB = Math.max(1.0, Math.ceil(peakTB * 1.25));
  const usePB = maxStorage_TB >= 1000.0;

  // Grid for Left Panel
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;

  for (let i = 0; i <= 5; i++) {
    const tb = (i / 5.0) * maxStorage_TB;
    const py = (padT + plotH1) - (i / 5.0) * plotH1;

    ctx.beginPath();
    ctx.moveTo(padL, py);
    ctx.lineTo(padL + plotW1, py);
    ctx.stroke();

    ctx.fillStyle = PALETTE.textMuted;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    const unitLbl = usePB
      ? `${(tb / 1000.0).toFixed(tb / 1000.0 >= 10 ? 0 : 1)} PB`
      : (maxStorage_TB >= 50 ? `${Math.round(tb)} TB` : `${tb.toFixed(1)} TB`);
    ctx.fillText(unitLbl, padL - 8, py + 4);
  }

  for (let i = 0; i <= 3; i++) {
    const yr = (i / 3.0) * maxTime_yr;
    const px = tToPx(yr);
    const lbl = maxTime_yr >= 15 ? `${Math.round(yr)} yr` : `${yr.toFixed(1)} yr`;
    ctx.fillStyle = PALETTE.textMuted;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(lbl, px, padT + plotH1 + 18);
  }

  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 12px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Mission Time [Years]', padL + plotW1 / 2, padT + plotH1 + 42);

  ctx.save();
  ctx.translate(16, padT + plotH1 / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = PALETTE.emerald;
  ctx.fillText(`In-Flight Stored Data [${usePB ? 'PB' : 'TB'}]`, 0, 0);
  ctx.restore();

  const bitPts = rawSamples.map(({ t_yr, tb }) => ({
    px: tToPx(t_yr),
    py: (padT + plotH1) - Math.min(1.0, tb / maxStorage_TB) * plotH1
  }));

  // Draw Area Fill & Curve
  ctx.save();
  ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
  ctx.beginPath();
  ctx.moveTo(bitPts[0].px, padT + plotH1);
  bitPts.forEach(p => ctx.lineTo(p.px, p.py));
  ctx.lineTo(bitPts[bitPts.length - 1].px, padT + plotH1);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = PALETTE.emerald;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  bitPts.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py));
  ctx.stroke();

  // Current Selected Time Marker on Storage Curve
  if (tTxYr >= 0 && tTxYr <= maxTime_yr) {
    const pxSel = tToPx(tTxYr);
    const selBits = integrateInFlightBits(tTxYr * 365.25 * 86400, pKin, () => nominalRateBps, 20);
    const pySel = (padT + plotH1) - Math.min(1.0, selBits.in_flight_TB / maxStorage_TB) * plotH1;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pxSel, padT);
    ctx.lineTo(pxSel, padT + plotH1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(pxSel, pySel, 4.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();

  // --- VERTICAL DIVIDER ---
  ctx.strokeStyle = PALETTE.border || '#26334d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(midX, padT - 10);
  ctx.lineTo(midX, height - 20);
  ctx.stroke();

  // --- RIGHT PANEL: Retroreflector Velocity Aberration Optics ---
  const panel2X = midX + 25;
  const panel2W = width - panel2X - 25;
  const cX = panel2X + panel2W / 2;
  const cY = padT + plotH1 / 2;
  const maxR = Math.min(panel2W, plotH1) * 0.42;

  // Header Title
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 12px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Retroreflector Velocity Aberration & Dihedral Optics', cX, padT + 8);

  // Compute Aberration Metrics
  const aber = computeAberration({
    D_refl: simState.d_refl || 10.0,
    lambda_0: (simState.lambda_0 || 532) * 1e-9,
    beta: beta,
    beta_perp: 1.0e-4
  });

  // Concentric target circles (Earth receiver plane)
  ctx.save();
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  for (let rFrac of [0.33, 0.66, 1.0]) {
    ctx.beginPath();
    ctx.arc(cX, cY, maxR * rFrac, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // Crosshairs
  ctx.beginPath();
  ctx.moveTo(cX - maxR, cY);
  ctx.lineTo(cX + maxR, cY);
  ctx.moveTo(cX, cY - maxR);
  ctx.lineTo(cX, cY + maxR);
  ctx.stroke();

  // 1. Earth Receiver Telescope Collector Disk (at center)
  const r_rx_px = maxR * 0.25;
  ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
  ctx.strokeStyle = PALETTE.blue;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cX, cY, r_rx_px, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = PALETTE.blue;
  ctx.font = '10px monospace';
  ctx.fillText('Earth Receiver Aperture', cX, cY + r_rx_px + 14);

  // 2. Reflected Diffraction Beam Cone (Displaced by theta_aber)
  // Scaling: let theta_diff = r_diff_px
  const r_diff_px = maxR * 0.35;
  const shift_px = r_diff_px * Math.min(2.5, aber.decoupling_ratio);

  const spotX = cX + shift_px;
  const spotY = cY;

  // Aberrated Beam Spot without compensation (Rose / Warning)
  ctx.fillStyle = 'rgba(244, 63, 94, 0.25)';
  ctx.strokeStyle = PALETTE.rose;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(spotX, spotY, r_diff_px, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  // Aberration displacement vector arrow
  ctx.setLineDash([]);
  ctx.strokeStyle = PALETTE.rose;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cX, cY);
  ctx.lineTo(spotX, spotY);
  ctx.stroke();

  // Arrowhead
  ctx.fillStyle = PALETTE.rose;
  ctx.beginPath();
  ctx.moveTo(spotX, spotY);
  ctx.lineTo(spotX - 8, spotY - 4);
  ctx.lineTo(spotX - 8, spotY + 4);
  ctx.closePath();
  ctx.fill();

  // 3. Compensated Dihedral Splitting Lobes (Emerald)
  // Offset delta_alpha splits the beam into lobes centered back onto receiver
  ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
  ctx.strokeStyle = PALETTE.emerald;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cX, cY, r_diff_px * 0.8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  ctx.restore();

  // Telemetry Callouts for Optics
  ctx.fillStyle = PALETTE.text;
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  const infoY = padT + plotH1 - 35;
  ctx.fillText(`Diffraction Beamwidth: ${aber.theta_diff_arcsec.toFixed(2)}"`, panel2X + 10, infoY);
  ctx.fillText(`Aberration Lead Angle: ${aber.theta_aber_arcsec.toFixed(2)}" (v_perp/c)`, panel2X + 10, infoY + 16);
  ctx.fillText(`Decoupling Ratio:     ${aber.decoupling_ratio.toFixed(2)} (${aber.requires_active_comp ? 'MISALIGNED' : 'ALIGNED'})`, panel2X + 10, infoY + 32);

  // Status Badge
  ctx.fillStyle = aber.requires_active_comp ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)';
  ctx.strokeStyle = aber.requires_active_comp ? PALETTE.amber : PALETTE.emerald;
  ctx.lineWidth = 1;
  const badgeW = 230, badgeH = 24;
  const badgeX = panel2X + 10, badgeY = infoY + 42;
  ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
  ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

  ctx.fillStyle = aber.requires_active_comp ? PALETTE.amber : PALETTE.emerald;
  ctx.font = 'bold 10px -apple-system, sans-serif';
  ctx.fillText(
    aber.requires_active_comp ? `ACTIVE COMP: δα = ${aber.delta_dihedral_arcsec.toFixed(2)}"` : 'PASSIVE RETROREFLECTION OK',
    badgeX + 10,
    badgeY + 16
  );
}

// Master visualizer refresh routine
export function renderAllCharts(canvases = {}, simState = {}, animTime = 0) {
  if (canvases.minkowski) renderMinkowskiChart(canvases.minkowski, simState, animTime);
  if (canvases.doppler) renderDopplerChart(canvases.doppler, simState);
  if (canvases.link) renderLinkChart(canvases.link, simState);
  if (canvases.storage) renderStorageChart(canvases.storage, simState);
}
