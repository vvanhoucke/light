/**
 * web/js/standalone.js
 * Classic non-module bundle of physics.js, charts.js, and app.js for direct file:// execution
 * without browser CORS restrictions on ES6 modules.
 */
(function() {
  "use strict";
/**
 * Relativistic Optical Delay-Line Data Storage: Client-Side Physics Engine
 * ES6 Module with zero external dependencies for standalone browser execution.
 *
 * Implements:
 * - Relativistic hyperbolic and piecewise kinematics & retarded-time solver
 * - Two-way Doppler factor, acceleration chirp rate, and symbol duration stretching
 * - Two-way geometric diffraction link budget and Beer-Lambert dust extinction
 * - Gordon-Holevo bosonic channel capacity and photon information efficiency
 * - Relativistic retroreflector velocity aberration and dihedral/cat's-eye compensation
 *
 * References:
 * - survey_physics_report.md
 * - PROJECT.md § Interface Contracts
 */

// Fundamental Physical Constants (SI)
const C_LIGHT = 299792458.0;          // Speed of light in vacuum (m/s)
const G_ACCEL = 9.80665;              // Earth surface gravity (m/s^2)
const H_PLANCK = 6.62607015e-34;      // Planck constant (J s)
const K_BOLTZMANN = 1.380649e-23;     // Boltzmann constant (J/K)
const ARCSEC_PER_RAD = 206264.80624709636; // 180 * 3600 / pi
const SIGMA_DUST_REF = 2.3e-30;       // Reference dust cross-section at 1064 nm (m^2 / H)
const LAMBDA_REF = 1064.0e-9;         // Reference Nd:YAG wavelength (m)
const DUST_INDEX = 1.7;               // Rayleigh-Mie power-law index
const LOG2_E = 1.4426950408889634;    // log2(e)

/**
 * Von Neumann entropy function for bosonic thermal states:
 * g(x) = (x + 1) * log2(x + 1) - x * log2(x)
 *
 * @param {number} x - Mean photon number per mode (x >= 0)
 * @returns {number} Entropy in bits per mode
 */
function gHolevo(x) {
  if (x <= 0.0) return 0.0;
  if (x < 1e-15) {
    return x * (-Math.log2(x) + LOG2_E);
  }
  if (x > 1e7) {
    // Asymptotic Taylor expansion for large photon counts to prevent IEEE 754 cancellation
    return Math.log2(x) + LOG2_E + (LOG2_E / (2.0 * x)) - (LOG2_E / (12.0 * x * x));
  }
  return (x + 1.0) * Math.log2(x + 1.0) - x * Math.log2(x);
}

/**
 * Two-way relativistic Doppler factor D_2 = (1 - beta) / (1 + beta).
 *
 * @param {number} beta - Recession velocity fraction v/c (0 <= beta < 1)
 * @returns {number} Two-way Doppler factor
 */
function twoWayDopplerFactor(beta) {
  if (beta < 0.0 || beta >= 1.0) {
    if (beta >= 1.0) return 0.0;
    return 1.0;
  }
  return (1.0 - beta) / (1.0 + beta);
}

/**
 * Solves relativistic kinematics and retarded reflection coordinates.
 * Conforms to PROJECT.md interface contract:
 * computeKinematics(params, t_tx)
 *
 * @param {Object} params - Kinematic parameters { alpha, trajectory_type, beta_coast, t_burn, t_tx }
 * @param {number} [t_tx] - Earth transmission coordinate time in seconds (overrides params.t_tx)
 * @returns {Object} Kinematic solution dictionary
 */
function computeKinematics(params = {}, t_tx = null) {
  const p = params || {};
  const tx = t_tx !== null ? Number(t_tx) : (p.t_tx !== undefined && p.t_tx !== null ? Number(p.t_tx) : 0.0);
  const alpha = (p.alpha !== undefined && p.alpha !== null) ? Number(p.alpha) : G_ACCEL;

  let trajType = p.trajectory_type;
  if (!trajType) {
    trajType = (p.beta_coast !== undefined || p.t_burn !== undefined) ? 'piecewise' : 'hyperbolic';
  }

  if (trajType === 'piecewise') {
    return solvePiecewiseTrajectory(p, tx);
  }

  if (alpha <= 0.0) {
    return {
      t_tx: tx,
      t_refl: tx,
      x_refl: 0.0,
      t_rx: tx,
      delta_t: 0.0,
      beta_refl: 0.0,
      gamma_refl: 1.0,
      D2: 1.0,
      horizon_cutoff: false,
      is_past_horizon: false,
      T_h: Infinity,
      X_0: Infinity,
    };
  }

  const Th = C_LIGHT / alpha;
  const X0 = (C_LIGHT * C_LIGHT) / alpha;

  // Continuous hyperbolic motion
  if (tx >= Th) {
    return {
      t_tx: tx,
      t_refl: Infinity,
      x_refl: Infinity,
      t_rx: Infinity,
      delta_t: Infinity,
      beta_refl: 1.0,
      gamma_refl: Infinity,
      D2: 0.0,
      horizon_cutoff: true,
      is_past_horizon: true,
      T_h: Th,
      X_0: X0,
    };
  }

  const s = tx / Th;
  const denom = 2.0 * (1.0 - s);
  const t_refl = Th * (s * (2.0 - s)) / denom;
  const x_refl = C_LIGHT * (tx * tx) / (2.0 * (Th - tx));
  const t_rx = (Th * tx) / (Th - tx);
  const delta_t = (tx * tx) / (Th - tx);

  const beta_refl = (s * (2.0 - s)) / (2.0 - 2.0 * s + s * s);
  const gamma_refl = (2.0 - 2.0 * s + s * s) / denom;
  const D2 = (1.0 - s) * (1.0 - s);

  return {
    t_tx: tx,
    t_refl: t_refl,
    x_refl: x_refl,
    t_rx: t_rx,
    delta_t: delta_t,
    beta_refl: beta_refl,
    gamma_refl: gamma_refl,
    D2: D2,
    horizon_cutoff: false,
    is_past_horizon: false,
    T_h: Th,
    X_0: X0,
  };
}

/**
 * Solves piecewise boost-and-coast trajectory kinematics ensuring C^1 continuity.
 *
 * @param {Object} params - { alpha, beta_coast, t_burn }
 * @param {number} tx - Transmission time in seconds
 * @returns {Object} Kinematic solution
 */
function solvePiecewiseTrajectory(params = {}, tx = 0.0) {
  const alphaParam = (params.alpha !== undefined && params.alpha !== null) ? Number(params.alpha) : G_ACCEL;
  const alpha = alphaParam > 0 ? alphaParam : G_ACCEL;
  const Th = C_LIGHT / alpha;
  const X0 = (C_LIGHT * C_LIGHT) / alpha;

  let beta_c = 0.2;
  let gamma_c = 1.0 / Math.sqrt(1.0 - beta_c * beta_c);
  let t1 = Th * beta_c * gamma_c;

  if (params.beta_coast !== undefined && Number(params.beta_coast) > 0.0) {
    beta_c = Math.min(Number(params.beta_coast), 0.999999);
    gamma_c = 1.0 / Math.sqrt(1.0 - beta_c * beta_c);
    t1 = Th * beta_c * gamma_c;
  } else if (params.t_burn !== undefined && Number(params.t_burn) > 0.0) {
    t1 = Number(params.t_burn);
    const s1 = t1 / Th;
    gamma_c = Math.sqrt(1.0 + s1 * s1);
    beta_c = s1 / gamma_c;
  }

  const doppler_coast_sqrt = Math.sqrt((1.0 - beta_c) / (1.0 + beta_c));
  const t_tx_crit = Th * (1.0 - doppler_coast_sqrt);

  if (tx <= t_tx_crit) {
    // Boost phase
    const s = tx / Th;
    const denom = 2.0 * (1.0 - s);
    const t_refl = Th * (s * (2.0 - s)) / denom;
    const x_refl = C_LIGHT * (tx * tx) / (2.0 * (Th - tx));
    const t_rx = (Th * tx) / (Th - tx);
    const delta_t = (tx * tx) / (Th - tx);
    const beta_refl = (s * (2.0 - s)) / (2.0 - 2.0 * s + s * s);
    const gamma_refl = (2.0 - 2.0 * s + s * s) / denom;
    const D2 = (1.0 - s) * (1.0 - s);

    return {
      t_tx: tx,
      t_refl: t_refl,
      x_refl: x_refl,
      t_rx: t_rx,
      delta_t: delta_t,
      beta_refl: beta_refl,
      gamma_refl: gamma_refl,
      D2: D2,
      horizon_cutoff: false,
      is_past_horizon: false,
      T_h: Th,
      X_0: X0,
      t_burn: t1,
      t_tx_crit: t_tx_crit,
      beta_coast: beta_c,
      phase: 'boost',
    };
  }

  // Coast phase
  const offset = Th * (1.0 - 1.0 / gamma_c);
  const t_refl = (tx - offset) / (1.0 - beta_c);
  const x_refl = C_LIGHT * (t_refl - tx);
  const t_rx = 2.0 * t_refl - tx;
  const delta_t = t_rx - tx;
  const D2 = (1.0 - beta_c) / (1.0 + beta_c);

  return {
    t_tx: tx,
    t_refl: t_refl,
    x_refl: x_refl,
    t_rx: t_rx,
    delta_t: delta_t,
    beta_refl: beta_c,
    gamma_refl: gamma_c,
    D2: D2,
    horizon_cutoff: false,
    is_past_horizon: false,
    T_h: Th,
    X_0: X0,
    t_burn: t1,
    t_tx_crit: t_tx_crit,
    beta_coast: beta_c,
    phase: 'coast',
  };
}

/**
 * Inverse reception mapping: calculates Earth transmission time t_tx*(t_rx)
 *
 * @param {number} t_rx - Earth reception time in seconds
 * @param {Object} params - { alpha, trajectory_type, beta_coast, t_burn }
 * @returns {number} Transmission coordinate time in seconds
 */
function receptionToTransmissionTime(t_rx, params = {}) {
  const alphaParam = (params.alpha !== undefined && params.alpha !== null) ? Number(params.alpha) : G_ACCEL;
  const trajType = params.trajectory_type || (params.beta_coast ? 'piecewise' : 'hyperbolic');

  if (trajType === 'hyperbolic') {
    if (alphaParam <= 0.0) return t_rx;
    const Th = C_LIGHT / alphaParam;
    if (!isFinite(t_rx)) return Th;
    return (Th * t_rx) / (Th + t_rx);
  }

  const alpha = alphaParam > 0.0 ? alphaParam : G_ACCEL;
  const Th = C_LIGHT / alpha;
  if (!isFinite(t_rx)) return Th;

  let beta_c = 0.2;
  let gamma_c = 1.0 / Math.sqrt(1.0 - beta_c * beta_c);
  let t1 = Th * beta_c * gamma_c;

  if (params.beta_coast !== undefined && Number(params.beta_coast) > 0.0) {
    beta_c = Number(params.beta_coast);
    gamma_c = 1.0 / Math.sqrt(1.0 - beta_c * beta_c);
    t1 = Th * beta_c * gamma_c;
  }

  const doppler_coast_sqrt = Math.sqrt((1.0 - beta_c) / (1.0 + beta_c));
  const t_tx_crit = Th * (1.0 - doppler_coast_sqrt);
  const t_rx_crit = (Th * t_tx_crit) / (Th - t_tx_crit);

  if (t_rx <= t_rx_crit) {
    return (Th * t_rx) / (Th + t_rx);
  }

  const offset = Th * (1.0 - 1.0 / gamma_c);
  return ((1.0 - beta_c) * t_rx + 2.0 * offset) / (1.0 + beta_c);
}

/**
 * Computes frequency chirp rate df_rx / dt_rx in Hz/s.
 *
 * @param {number} alpha - Proper acceleration in m/s^2
 * @param {number} f_tx - Optical carrier frequency in Hz
 * @param {number} D2 - Two-way Doppler factor
 * @returns {number} Frequency chirp rate
 */
function computeChirpRate(alpha, f_tx, D2) {
  if (alpha <= 0.0 || D2 <= 0.0) return 0.0;
  return - (2.0 * alpha / C_LIGHT) * f_tx * Math.pow(D2, 1.5);
}

/**
 * Classifies electromagnetic wavelength (in meters) into its spectral band name.
 *
 * @param {number} lambda_m - Wavelength in meters
 * @returns {string} Spectral band name
 */
function getSpectralBand(lambda_m) {
  if (!isFinite(lambda_m) || lambda_m <= 0.0) return 'Horizon Cutoff (∞)';
  const nm = lambda_m * 1e9;
  if (nm < 380.0) return 'Ultraviolet (UV)';
  if (nm < 750.0) return 'Visible';
  if (nm < 1400.0) return 'Near-IR (NIR)';
  if (nm < 3000.0) return 'Short-Wave IR (SWIR)';
  if (nm < 8000.0) return 'Mid-Wave IR (MWIR)';
  if (nm < 15000.0) return 'Long-Wave IR (LWIR)';
  if (nm < 1.0e6) return 'Far-IR / THz';
  if (nm < 1.0e9) return 'Microwave / mmWave';
  return 'Radio (RF)';
}

/**
 * Computes optics properties for given transmission time or beta.
 *
 * @param {Object} params - { alpha, lambda_0, beta, t_tx }
 * @param {number} [t_tx] - Transmission time in seconds
 * @returns {Object} Optical properties
 */
function computeOptics(params = {}, t_tx = null) {
  const p = params || {};
  const alpha = (p.alpha !== undefined && p.alpha !== null) ? Number(p.alpha) : G_ACCEL;
  const lambda_tx = Number(p.lambda_0 !== undefined && p.lambda_0 !== null ? p.lambda_0 : (p.lambda_tx !== undefined && p.lambda_tx !== null ? p.lambda_tx : LAMBDA_REF));
  const f_tx = C_LIGHT / lambda_tx;

  let D2 = 1.0;
  let beta = 0.0;

  if (p.beta !== undefined && p.beta !== null) {
    beta = Number(p.beta);
    D2 = twoWayDopplerFactor(beta);
  } else {
    const tx = t_tx !== null ? Number(t_tx) : (p.t_tx !== undefined && p.t_tx !== null ? Number(p.t_tx) : 0.0);
    const Th = alpha > 0 ? (C_LIGHT / alpha) : Infinity;
    if (tx >= Th) {
      D2 = 0.0;
      beta = 1.0;
    } else if (alpha <= 0.0) {
      D2 = 1.0;
      beta = 0.0;
    } else {
      const s = tx / Th;
      D2 = (1.0 - s) * (1.0 - s);
      beta = (s * (2.0 - s)) / (2.0 - 2.0 * s + s * s);
    }
  }

  const f_rx = f_tx * D2;
  const lambda_rx = D2 > 0.0 ? lambda_tx / D2 : Infinity;
  const chirp = computeChirpRate(alpha, f_tx, D2);
  const z = beta < 1.0 ? 2.0 * beta / (1.0 - beta) : Infinity;

  return {
    D2: D2,
    beta: beta,
    f_tx: f_tx,
    f_rx: f_rx,
    lambda_tx: lambda_tx,
    lambda_rx: lambda_rx,
    optical_redshift: z,
    chirp_rate: chirp,
    symbol_stretch: D2 > 0.0 ? 1.0 / D2 : Infinity,
    spectral_band: getSpectralBand(lambda_rx),
  };
}

/**
 * Computes two-way optical link budget, ISM dust extinction, and Holevo capacity.
 * Conforms to PROJECT.md interface contract:
 * computeLinkBudget(params, x_refl, D2)
 *
 * @param {Object} params - { P_tx, D_tx, D_refl, D_rx, lambda_0, n_H, B_opt, eta_opt, R_mirror, N_noise }
 * @param {number} [x_refl] - Distance in meters
 * @param {number} [D2] - Two-way Doppler factor
 * @returns {Object} Link budget and capacity metrics
 */
function computeLinkBudget(params = {}, x_refl = null, D2 = null) {
  const p = params || {};
  const P_tx = (p.P_tx !== undefined && p.P_tx !== null) ? Number(p.P_tx) : 1.0e11;
  const D_tx = (p.D_tx !== undefined && p.D_tx !== null) ? Number(p.D_tx) : 1000.0;
  const D_refl = (p.D_refl !== undefined && p.D_refl !== null) ? Number(p.D_refl) : 4.0;
  const D_rx = (p.D_rx !== undefined && p.D_rx !== null) ? Number(p.D_rx) : 100.0;
  const lambda_0 = Number(p.lambda_0 !== undefined && p.lambda_0 !== null ? p.lambda_0 : (p.lambda_tx !== undefined && p.lambda_tx !== null ? p.lambda_tx : LAMBDA_REF));
  const n_H = Number(p.n_H !== undefined && p.n_H !== null ? p.n_H : 1.0e5);
  const B_opt = Number(p.B_opt !== undefined && p.B_opt !== null ? p.B_opt : (p.B_hz !== undefined && p.B_hz !== null ? p.B_hz : 1.0e9));
  const eta_opt = (p.eta_opt !== undefined && p.eta_opt !== null) ? Number(p.eta_opt) : 0.6;
  const R_mirror = (p.R_mirror !== undefined && p.R_mirror !== null) ? Number(p.R_mirror) : 0.999;
  const N_noise = (p.N_noise !== undefined && p.N_noise !== null) ? Number(p.N_noise) : 1.0e-4;

  const dist = x_refl !== null ? Number(x_refl) : (p.x_refl !== undefined && p.x_refl !== null ? Number(p.x_refl) : 0.0);
  const d2_val = D2 !== null ? Number(D2) : (p.D2 !== undefined && p.D2 !== null ? Number(p.D2) : 1.0);

  if (dist < 0.0 || d2_val <= 0.0 || P_tx <= 0.0) {
    return {
      eta_geom: 0.0,
      eta_dust: 1.0,
      eta_rel: 0.0,
      P_rx: 0.0,
      photon_flux_rx: 0.0,
      N_sig: 0.0,
      N_noise: N_noise,
      C_holevo_bps: 0.0,
      bits_per_photon: 0.0,
      lambda_rx: d2_val > 0.0 ? lambda_0 / d2_val : Infinity,
      f_rx: (C_LIGHT / lambda_0) * d2_val,
      P_tx: P_tx,
      x_refl: dist,
      D2: d2_val,
    };
  }

  const lambda_rx = lambda_0 / d2_val;
  const A_tx = Math.PI * Math.pow(D_tx / 2.0, 2);
  const A_refl = Math.PI * Math.pow(D_refl / 2.0, 2);
  const A_rx = Math.PI * Math.pow(D_rx / 2.0, 2);

  // Geometric diffraction coupling
  const w_fwd = Math.sqrt(A_tx * A_refl);
  const w_ret = Math.sqrt(A_refl * A_rx);
  const term1 = 1.0 / (1.0 + Math.pow((lambda_0 * dist) / w_fwd, 2));
  const term2 = 1.0 / (1.0 + Math.pow((lambda_rx * dist) / w_ret, 2));
  const eta_geom = R_mirror * eta_opt * term1 * term2;

  // Beer-Lambert ISM extinction
  const sigma_tx = SIGMA_DUST_REF * Math.pow(LAMBDA_REF / lambda_0, DUST_INDEX);
  const sigma_rx = SIGMA_DUST_REF * Math.pow(LAMBDA_REF / lambda_rx, DUST_INDEX);
  const tau_ext = n_H * dist * (sigma_tx + sigma_rx);
  const eta_dust = Math.exp(-tau_ext);

  // Relativistic scaling
  const eta_rel = d2_val * d2_val;

  // Received power & photons
  const P_rx = P_tx * eta_geom * eta_dust;
  const f_rx = (C_LIGHT / lambda_0) * d2_val;
  const E_photon = H_PLANCK * f_rx;
  const photon_flux_rx = E_photon > 0.0 ? P_rx / E_photon : 0.0;
  const N_sig = B_opt > 0.0 ? photon_flux_rx / B_opt : 0.0;

  // Gordon-Holevo capacity (with Taylor guard against IEEE-754 cancellation when N_sig << N_noise)
  let c_mode;
  if (N_noise > 0.0 && N_sig > 0.0 && N_sig < 1e-5 * N_noise) {
    c_mode = N_sig * Math.log2(1.0 + 1.0 / N_noise) - (0.5 * N_sig * N_sig * LOG2_E) / (N_noise * (N_noise + 1.0));
  } else {
    c_mode = gHolevo(N_sig + N_noise) - gHolevo(N_noise);
  }
  const C_holevo_bps = B_opt * c_mode;
  const bits_per_photon = photon_flux_rx > 0.0 ? C_holevo_bps / photon_flux_rx : 0.0;

  return {
    eta_geom: eta_geom,
    eta_dust: eta_dust,
    eta_rel: eta_rel,
    P_rx: P_rx,
    photon_flux_rx: photon_flux_rx,
    N_sig: N_sig,
    N_noise: N_noise,
    C_holevo_bps: C_holevo_bps,
    bits_per_photon: bits_per_photon,
    lambda_rx: lambda_rx,
    f_rx: f_rx,
    P_tx: P_tx,
    x_refl: dist,
    D2: d2_val,
  };
}

/**
 * Computes bosonic channel capacity metrics.
 *
 * @param {Object} params - { B_opt, N_noise }
 * @param {number} N_sig - Mean signal photons per mode
 * @param {number} [N_noise] - Mean noise photons per mode
 * @returns {Object} Capacity metrics
 */
function computeCapacity(params = {}, N_sig = 1.0, N_noise = null) {
  const p = params || {};
  const B_opt = Number(p.B_opt || p.B_hz || 1.0e9);
  const noise = N_noise !== null ? Number(N_noise) : Number(p.N_noise !== undefined ? p.N_noise : 1.0e-4);
  const sig = Number(N_sig || 0.0);

  let c_mode;
  if (noise > 0.0 && sig > 0.0 && sig < 1e-5 * noise) {
    c_mode = sig * Math.log2(1.0 + 1.0 / noise) - (0.5 * sig * sig * LOG2_E) / (noise * (noise + 1.0));
  } else {
    c_mode = gHolevo(sig + noise) - gHolevo(noise);
  }
  const c_bps = B_opt * c_mode;
  const pie = sig > 0.0 ? c_mode / sig : 0.0;

  return {
    N_sig: sig,
    N_noise: noise,
    B_opt: B_opt,
    C_holevo_per_mode: c_mode,
    C_holevo_bps: c_bps,
    bits_per_photon: pie,
  };
}

/**
 * Computes moving retroreflector velocity aberration, decoupling, and dihedral offset.
 * Conforms to PROJECT.md interface contract:
 * computeReflectorAberration(params, beta, beta_perp)
 *
 * @param {Object} params - { D_refl, lambda_0, beta, beta_perp }
 * @param {number} [beta] - Longitudinal velocity fraction
 * @param {number} [beta_perp] - Transverse velocity fraction
 * @returns {Object} Aberration metrics
 */
function computeAberration(params = {}, beta = null, beta_perp = null) {
  const p = params || {};
  const b_long = beta !== null ? Number(beta) : (p.beta !== undefined && p.beta !== null ? Number(p.beta) : 0.2);
  const b_perp = beta_perp !== null ? Number(beta_perp) : (p.beta_perp !== undefined && p.beta_perp !== null ? Number(p.beta_perp) : 9.934e-5);
  const d_refl = (p.D_refl !== undefined && p.D_refl !== null) ? Number(p.D_refl) : 1.0;
  const l_tx = Number(p.lambda_0 !== undefined && p.lambda_0 !== null ? p.lambda_0 : (p.lambda_tx !== undefined && p.lambda_tx !== null ? p.lambda_tx : LAMBDA_REF));

  const D2 = twoWayDopplerFactor(b_long);
  const l_rx = D2 > 0.0 ? l_tx / D2 : l_tx;

  // Aberration lead angle including exact longitudinal Doppler amplification:
  // theta_aber = 2 * beta_perp / (1 - beta_parallel)
  const theta_aber = (0.0 <= b_long && b_long < 1.0) ? (2.0 * b_perp / (1.0 - b_long)) : (2.0 * b_perp);

  // Diffraction beamwidth
  const theta_diff = 1.22 * l_rx / d_refl;

  // Decoupling ratio
  const decoupling_ratio = theta_diff > 0.0 ? theta_aber / theta_diff : Infinity;

  // Dihedral angle offset for hollow corner cube: delta_alpha = theta_aber / 3.266
  const delta_dihedral_rad = theta_aber / 3.266;
  const delta_dihedral_alt_rad = b_perp / (2.0 * Math.sqrt(2.0));

  // Cat's-eye focal plane tip-tilt angle
  const cats_eye_tilt_rad = b_perp;

  return {
    theta_diff: theta_diff,
    theta_diff_arcsec: theta_diff * ARCSEC_PER_RAD,
    theta_aber: theta_aber,
    theta_aber_arcsec: theta_aber * ARCSEC_PER_RAD,
    decoupling_ratio: decoupling_ratio,
    delta_dihedral_rad: delta_dihedral_rad,
    delta_dihedral_arcsec: delta_dihedral_rad * ARCSEC_PER_RAD,
    delta_dihedral_alt_rad: delta_dihedral_alt_rad,
    delta_dihedral_alt_arcsec: delta_dihedral_alt_rad * ARCSEC_PER_RAD,
    cats_eye_tilt_rad: cats_eye_tilt_rad,
    cats_eye_tilt_arcsec: cats_eye_tilt_rad * ARCSEC_PER_RAD,
    requires_active_comp: decoupling_ratio > 0.5,
    D_refl: d_refl,
    lambda_rx: l_rx,
    beta: b_long,
    beta_perp: b_perp,
  };
}

/**
 * Numerically integrates total in-flight stored bits in the optical delay line.
 *
 * @param {number} t_earth - Current Earth coordinate time in seconds
 * @param {Object} params - Kinematic parameters
 * @param {Function} bitRateProfile - R_tx(t) returning bits/s
 * @param {number} [numSteps=500] - Quadrature step count
 * @returns {Object} Stored capacity info
 */
function integrateInFlightBits(t_earth, params = {}, bitRateProfile = null, numSteps = 500) {
  if (!isFinite(t_earth) || t_earth <= 0.0) {
    return {
      t_earth: t_earth,
      t_tx_star: 0.0,
      delay_window_s: 0.0,
      in_flight_bits: 0.0,
      in_flight_GB: 0.0,
      in_flight_TB: 0.0,
    };
  }

  const t_tx_star = receptionToTransmissionTime(t_earth, params);
  if (!isFinite(t_tx_star)) {
    return {
      t_earth: t_earth,
      t_tx_star: 0.0,
      delay_window_s: 0.0,
      in_flight_bits: 0.0,
      in_flight_GB: 0.0,
      in_flight_TB: 0.0,
    };
  }

  const delayWindow = Math.max(0.0, t_earth - t_tx_star);
  const rateFunc = bitRateProfile || (() => 1.0e9); // 1 Gbps default constant rate

  // Composite Simpson's 1/3 rule for superior precision (< 1e-5 relative error)
  const n = (numSteps % 2 === 0 ? numSteps : numSteps + 1);
  const dt = delayWindow / n;
  let totalBits = rateFunc(t_tx_star) + rateFunc(t_earth);

  for (let i = 1; i < n; i++) {
    const t = t_tx_star + i * dt;
    const weight = (i % 2 === 1) ? 4.0 : 2.0;
    totalBits += weight * rateFunc(t);
  }
  totalBits *= (dt / 3.0);

  return {
    t_earth: t_earth,
    t_tx_star: t_tx_star,
    delay_window_s: delayWindow,
    in_flight_bits: totalBits,
    in_flight_GB: totalBits / (8.0 * 1e9),
    in_flight_TB: totalBits / (8.0 * 1e12),
  };
}


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
function renderMinkowskiChart(canvas, simState = {}, animTime = 0) {
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
function renderDopplerChart(canvas, simState = {}) {
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
function renderLinkChart(canvas, simState = {}) {
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
function renderStorageChart(canvas, simState = {}) {
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
function renderAllCharts(canvases = {}, simState = {}, animTime = 0) {
  if (canvases.minkowski) renderMinkowskiChart(canvases.minkowski, simState, animTime);
  if (canvases.doppler) renderDopplerChart(canvases.doppler, simState);
  if (canvases.link) renderLinkChart(canvases.link, simState);
  if (canvases.storage) renderStorageChart(canvases.storage, simState);
}


/**
 * web/js/app.js
 *
 * Relativistic Optical Delay-Line Data Storage Medium: Application Controller
 * ES6 Module orchestrating simulation cockpit, mission presets, parameter sliders,
 * live telemetry updates, and 60 FPS visualizer redraw loop.
 */

// --- Mission Presets Configuration ---
const MISSION_PRESETS = {
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
function dispatchPreset(presetId) {
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
const simState = {
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
function updateSimulation() {
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
function applyPreset(presetId) {
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
function initApp() {
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


  if (typeof window !== "undefined") {
    window.RelativisticApp = {
      MISSION_PRESETS: MISSION_PRESETS,
      simState: simState,
      applyPreset: applyPreset,
      updateSimulation: updateSimulation,
      renderAllCharts: renderAllCharts,
      initApp: initApp
    };
  }
})();

