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
export const C_LIGHT = 299792458.0;          // Speed of light in vacuum (m/s)
export const G_ACCEL = 9.80665;              // Earth surface gravity (m/s^2)
export const H_PLANCK = 6.62607015e-34;      // Planck constant (J s)
export const K_BOLTZMANN = 1.380649e-23;     // Boltzmann constant (J/K)
export const ARCSEC_PER_RAD = 206264.80624709636; // 180 * 3600 / pi
export const SIGMA_DUST_REF = 2.3e-30;       // Reference dust cross-section at 1064 nm (m^2 / H)
export const LAMBDA_REF = 1064.0e-9;         // Reference Nd:YAG wavelength (m)
export const DUST_INDEX = 1.7;               // Rayleigh-Mie power-law index
export const LOG2_E = 1.4426950408889634;    // log2(e)

/**
 * Von Neumann entropy function for bosonic thermal states:
 * g(x) = (x + 1) * log2(x + 1) - x * log2(x)
 *
 * @param {number} x - Mean photon number per mode (x >= 0)
 * @returns {number} Entropy in bits per mode
 */
export function gHolevo(x) {
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
export function twoWayDopplerFactor(beta) {
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
export function computeKinematics(params = {}, t_tx = null) {
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
export function solvePiecewiseTrajectory(params = {}, tx = 0.0) {
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
export function receptionToTransmissionTime(t_rx, params = {}) {
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
export function computeChirpRate(alpha, f_tx, D2) {
  if (alpha <= 0.0 || D2 <= 0.0) return 0.0;
  return - (2.0 * alpha / C_LIGHT) * f_tx * Math.pow(D2, 1.5);
}

/**
 * Classifies electromagnetic wavelength (in meters) into its spectral band name.
 *
 * @param {number} lambda_m - Wavelength in meters
 * @returns {string} Spectral band name
 */
export function getSpectralBand(lambda_m) {
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
export function computeOptics(params = {}, t_tx = null) {
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
export function computeLinkBudget(params = {}, x_refl = null, D2 = null) {
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
export function computeCapacity(params = {}, N_sig = 1.0, N_noise = null) {
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
export function computeAberration(params = {}, beta = null, beta_perp = null) {
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
export function integrateInFlightBits(t_earth, params = {}, bitRateProfile = null, numSteps = 500) {
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
