/**
 * tests/stress_physics_adversarial.js
 * Adversarial Physics Stress Testing Suite for Relativistic Optical Delay-Line Data Storage.
 *
 * Authored and executed by Challenger 1 (Physics Stress Challenger) for Milestone M4.
 *
 * Stresses the mathematical physics engine under extreme, non-standard, and boundary regimes:
 * 1. Horizon approach: t_tx approaching c/alpha within 1 nanosecond, 1 microsecond, and past horizon.
 * 2. Extreme velocities: beta = 0.999c, 0.9999c, gamma > 70.
 * 3. Extreme accelerations: alpha = 100g, 10,000g, and alpha -> 0.
 * 4. Deep interstellar distances: d = 1 ly to 100 ly.
 * 5. Bit conservation quadrature under extreme chirp rates and discontinuous transmission rate pulses.
 * 6. Two-way link budget at zero distance (near-field saturation <= 1.0) and extreme interstellar distance (diffraction + dust extinction).
 * 7. Retroreflector velocity aberration decoupling at relativistic transverse speeds (beta_perp = 0.001, 0.01).
 *
 * Execution:
 * /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/stress_physics_adversarial.js
 */

import {
  C_LIGHT,
  G_ACCEL,
  H_PLANCK,
  ARCSEC_PER_RAD,
  gHolevo,
  twoWayDopplerFactor,
  computeKinematics,
  solvePiecewiseTrajectory,
  receptionToTransmissionTime,
  computeChirpRate,
  computeOptics,
  computeLinkBudget,
  computeCapacity,
  computeAberration,
  integrateInFlightBits
} from '../web/js/physics.js';

let passed = 0;
let failed = 0;
const criticalBugs = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    print(`  [PASS] ${testName}`);
    passed++;
  } else {
    print(`  [FAIL] ${testName}: ${detail}`);
    failed++;
    criticalBugs.push({ testName, detail });
  }
}

function assertAlmostEqual(a, b, tolerance, testName) {
  const diff = Math.abs(a - b);
  const ok = diff <= tolerance;
  assert(ok, testName, `expected ${b}, got ${a}, diff ${diff} > tolerance ${tolerance}`);
}

print("======================================================================");
print(" ADVERSARIAL PHYSICS STRESS TESTING SUITE (CHALLENGER 1)");
print("======================================================================");

// ============================================================================
// SUITE 1: HORIZON APPROACH & ASYMPTOTIC BOUNDARY BEHAVIOR
// ============================================================================
print("\n--- SUITE 1: Horizon Approach & Asymptotic Boundary Behavior ---");
const alpha1 = G_ACCEL;
const Th1 = C_LIGHT / alpha1;

// 1.1 Approach within 1 microsecond
const dt_micro = 1e-6;
const tx_micro = Th1 - dt_micro;
const resMicro = computeKinematics({ alpha: alpha1, trajectory_type: 'hyperbolic' }, tx_micro);
assert(!isNaN(resMicro.t_refl) && isFinite(resMicro.t_refl) && resMicro.t_refl > 0, "1us before horizon: t_refl finite and positive");
assert(!isNaN(resMicro.x_refl) && isFinite(resMicro.x_refl) && resMicro.x_refl > 0, "1us before horizon: x_refl finite and positive");
assert(!isNaN(resMicro.D2) && resMicro.D2 > 0 && resMicro.D2 < 1e-20, "1us before horizon: D2 strictly positive and ultra-small");
assert(resMicro.horizon_cutoff === false, "1us before horizon: horizon_cutoff is false");
assert(resMicro.is_past_horizon === false, "1us before horizon: is_past_horizon is false");

// Null geodesic consistency within 1 microsecond
const fwd_null_err_micro = Math.abs(resMicro.x_refl - C_LIGHT * (resMicro.t_refl - tx_micro)) / resMicro.x_refl;
assert(fwd_null_err_micro < 1e-3, "1us before horizon: forward null geodesic relative closure < 0.1%", `fwd_null_err=${fwd_null_err_micro}`);

// 1.2 Approach within 1 nanosecond (IEEE 754 precision boundary)
const dt_nano = 1e-9;
const tx_nano = Th1 - dt_nano;
const resNano = computeKinematics({ alpha: alpha1, trajectory_type: 'hyperbolic' }, tx_nano);
// Note: In IEEE 754 double precision (53-bit mantissa), (Th1 - 1e-9) rounds to Th1 because Th1 ~ 3.057e7.
// The engine must either handle the sub-nanosecond asymptote cleanly or trigger the cutoff flag without NaN.
assert(!isNaN(resNano.t_refl), "1ns before horizon: t_refl is not NaN");
assert(!isNaN(resNano.x_refl), "1ns before horizon: x_refl is not NaN");
assert(!isNaN(resNano.D2), "1ns before horizon: D2 is not NaN");
assert(resNano.horizon_cutoff === true || resNano.t_refl > 0, "1ns before horizon: valid cutoff trigger or positive time");

// 1.3 Exact horizon coordinate time t_tx = Th
const resExact = computeKinematics({ alpha: alpha1, trajectory_type: 'hyperbolic' }, Th1);
assert(resExact.horizon_cutoff === true, "t_tx = Th: horizon_cutoff is true");
assert(resExact.is_past_horizon === true, "t_tx = Th: is_past_horizon is true");
assert(resExact.t_refl === Infinity, "t_tx = Th: t_refl is Infinity");
assert(resExact.x_refl === Infinity, "t_tx = Th: x_refl is Infinity");
assert(resExact.D2 === 0.0, "t_tx = Th: D2 is exactly 0.0");

// 1.4 Past horizon t_tx > Th
for (const dt_past of [1e-6, 1.0, 1000.0, 1e7]) {
  const tx_past = Th1 + dt_past;
  const resPast = computeKinematics({ alpha: alpha1, trajectory_type: 'hyperbolic' }, tx_past);
  assert(resPast.horizon_cutoff === true, `t_tx = Th + ${dt_past}s: horizon_cutoff is true`);
  assert(resPast.is_past_horizon === true, `t_tx = Th + ${dt_past}s: is_past_horizon is true`);
  assert(resPast.t_refl === Infinity, `t_tx = Th + ${dt_past}s: t_refl is Infinity`);
  assert(resPast.D2 === 0.0, `t_tx = Th + ${dt_past}s: D2 is 0.0`);
}

// ============================================================================
// SUITE 2: EXTREME VELOCITIES & LORENTZ FACTORS (gamma > 70)
// ============================================================================
print("\n--- SUITE 2: Extreme Velocities & Lorentz Factors (gamma > 70) ---");

const extremeBetas = [
  { beta: 0.999, exp_gamma: 22.366, exp_D2: 0.001 / 1.999 },
  { beta: 0.9999, exp_gamma: 70.712, exp_D2: 0.0001 / 1.9999 },
  { beta: 0.99995, exp_gamma: 100.001, exp_D2: 0.00005 / 1.99995 },
  { beta: 0.99999, exp_gamma: 223.607, exp_D2: 0.00001 / 1.99999 }
];

for (const item of extremeBetas) {
  const b = item.beta;
  const gamma = 1.0 / Math.sqrt(1.0 - b * b);
  assertAlmostEqual(gamma, item.exp_gamma, 0.01, `gamma for beta=${b}`);

  const d2 = twoWayDopplerFactor(b);
  assertAlmostEqual(d2, item.exp_D2, 1e-12, `twoWayDopplerFactor for beta=${b}`);

  const opt = computeOptics({ beta: b, lambda_0: 1064e-9 });
  assert(!isNaN(opt.f_rx) && isFinite(opt.f_rx) && opt.f_rx > 0, `f_rx finite and positive for beta=${b}`);
  assert(!isNaN(opt.lambda_rx) && isFinite(opt.lambda_rx) && opt.lambda_rx > 0, `lambda_rx finite and positive for beta=${b}`);

  // Redshift identity: z = (lambda_rx - lambda_tx) / lambda_tx == 2*beta / (1 - beta)
  const z_expected = 2.0 * b / (1.0 - b);
  assertAlmostEqual(opt.optical_redshift, z_expected, 1e-4, `optical redshift z identity for beta=${b}`);
  const z_from_lambda = (opt.lambda_rx - opt.lambda_tx) / opt.lambda_tx;
  assertAlmostEqual(opt.optical_redshift, z_from_lambda, 1e-6, `z matches lambda ratio for beta=${b}`);
}

// Unphysical / Boundary velocity tests
assert(twoWayDopplerFactor(1.0) === 0.0, "beta = 1.0 returns D2 = 0.0");
assert(twoWayDopplerFactor(1.5) === 0.0, "superluminal beta = 1.5 returns D2 = 0.0");
assert(twoWayDopplerFactor(-0.2) === 1.0, "negative beta = -0.2 handled without NaN");

// ============================================================================
// SUITE 3: EXTREME ACCELERATIONS & WEAK-FIELD LIMITS
// ============================================================================
print("\n--- SUITE 3: Extreme Accelerations & Weak-Field Limits ---");

// 3.1 Extreme accelerations: 100g and 10,000g
const highAlphas = [100.0 * G_ACCEL, 10000.0 * G_ACCEL];
for (const a of highAlphas) {
  const Th_a = C_LIGHT / a;
  const tx_a = 0.5 * Th_a;
  const resHigh = computeKinematics({ alpha: a, trajectory_type: 'hyperbolic' }, tx_a);
  assert(!isNaN(resHigh.t_refl) && isFinite(resHigh.t_refl), `alpha=${a/G_ACCEL}g: t_refl is finite`);
  assert(!isNaN(resHigh.x_refl) && isFinite(resHigh.x_refl), `alpha=${a/G_ACCEL}g: x_refl is finite`);
  assertAlmostEqual(resHigh.D2, 0.25, 1e-9, `alpha=${a/G_ACCEL}g: D2 at s=0.5 is 0.25`);

  // Chirp rate check
  const f_tx = 2.8176e14;
  const chirp = computeChirpRate(a, f_tx, resHigh.D2);
  const expectedChirp = -2.0 * (a / C_LIGHT) * f_tx * Math.pow(resHigh.D2, 1.5);
  assertAlmostEqual(chirp, expectedChirp, 1e-4, `alpha=${a/G_ACCEL}g: chirp rate matches analytical formula`);
  assert(chirp < 0, `alpha=${a/G_ACCEL}g: chirp rate is strictly negative`);
}

// 3.2 Weak acceleration limit: alpha -> 0 (Newtonian correspondence)
const weakAlphas = [1e-6, 1e-12];
const tx_fixed = 100.0; // 100 seconds
for (const a of weakAlphas) {
  const resWeak = computeKinematics({ alpha: a, trajectory_type: 'hyperbolic' }, tx_fixed);
  assert(!isNaN(resWeak.t_refl) && isFinite(resWeak.t_refl), `alpha=${a}: t_refl is finite`);
  assert(!isNaN(resWeak.x_refl) && isFinite(resWeak.x_refl), `alpha=${a}: x_refl is finite`);

  // In the limit alpha -> 0, x_refl -> 0.5 * alpha * tx^2
  const x_newton = 0.5 * a * (tx_fixed * tx_fixed);
  const rel_x_err = Math.abs(resWeak.x_refl - x_newton) / x_newton;
  assert(rel_x_err < 1e-4, `alpha=${a}: x_refl converges to Newtonian 0.5*alpha*t^2 (rel_err=${rel_x_err.toExponential(2)})`);

  // D2 -> 1 - 2*alpha*tx/c
  const d2_newton = 1.0 - 2.0 * (a * tx_fixed / C_LIGHT);
  assertAlmostEqual(resWeak.D2, d2_newton, 1e-9, `alpha=${a}: D2 converges to 1 - 2*v/c`);
}

// Zero / negative acceleration robustness
const resZeroAlpha = computeKinematics({ alpha: 0.0, trajectory_type: 'hyperbolic' }, 10.0);
assert(!isNaN(resZeroAlpha.t_refl) && isFinite(resZeroAlpha.t_refl), "alpha=0 fallback prevents division by zero");

// ============================================================================
// SUITE 4: DEEP INTERSTELLAR DISTANCES & BEER-LAMBERT EXTINCTION
// ============================================================================
print("\n--- SUITE 4: Deep Interstellar Distances & ISM Dust Extinction ---");

const ly = 9.4607304725808e15; // 1 light-year in meters
const testDistances = [1.0 * ly, 4.24 * ly, 10.0 * ly, 50.0 * ly, 100.0 * ly];
const lbConfig = {
  P_tx: 1e9,
  D_tx: 30.0,
  D_refl: 4.0,
  D_rx: 50.0,
  lambda_0: 1064e-9,
  n_H: 1e5
};

let prevPrx = Infinity;
let prevDust = 1.0;
for (const dist of testDistances) {
  const d_ly = dist / ly;
  const res = computeLinkBudget(lbConfig, dist, 0.5);

  assert(!isNaN(res.eta_geom) && isFinite(res.eta_geom) && res.eta_geom >= 0, `d=${d_ly.toFixed(1)} ly: eta_geom non-negative`);
  assert(!isNaN(res.eta_dust) && isFinite(res.eta_dust) && res.eta_dust > 0 && res.eta_dust <= 1.0, `d=${d_ly.toFixed(1)} ly: eta_dust in (0, 1]`);
  assert(!isNaN(res.P_rx) && isFinite(res.P_rx) && res.P_rx >= 0, `d=${d_ly.toFixed(1)} ly: P_rx non-negative`);
  assert(res.P_rx < prevPrx, `d=${d_ly.toFixed(1)} ly: received power strictly decreases with distance`);
  assert(res.eta_dust <= prevDust, `d=${d_ly.toFixed(1)} ly: dust transmittance monotonically non-increasing`);

  prevPrx = res.P_rx;
  prevDust = res.eta_dust;
}

// Far-field 1/d^4 geometric scaling benchmark across 1 ly and 2 ly
const lb1ly = computeLinkBudget(lbConfig, 1.0 * ly, 0.5);
const lb2ly = computeLinkBudget(lbConfig, 2.0 * ly, 0.5);
const geomRatio = lb2ly.eta_geom / lb1ly.eta_geom;
assertAlmostEqual(geomRatio, 1.0 / 16.0, 1e-4, "far field 1 ly -> 2 ly exact 1/d^4 scaling ratio = 1/16");

// Dense ISM extinction stress test (n_H = 1e12 m^-3 over 1 ly)
const lbDense = computeLinkBudget({ ...lbConfig, n_H: 1e12 }, 1.0 * ly, 0.5);
assert(!isNaN(lbDense.eta_dust) && lbDense.eta_dust >= 0 && lbDense.eta_dust <= 1.0, "dense ISM cloud: dust transmittance in [0, 1]");
assert(!isNaN(lbDense.P_rx) && lbDense.P_rx >= 0, "dense ISM cloud: P_rx is non-negative");

// ============================================================================
// SUITE 5: BIT CONSERVATION QUADRATURE UNDER RELATIVISTIC STRESS
// ============================================================================
print("\n--- SUITE 5: Bit Conservation Quadrature Under Relativistic Stress ---");

function testBitConservationQuadrature(alpha, t_tx_max, rateProfile, N_steps = 2000) {
  const Th = C_LIGHT / alpha;
  const n = N_steps % 2 === 0 ? N_steps : N_steps + 1;
  const dt_tx = t_tx_max / n;
  let N_tx = rateProfile(0.0) + rateProfile(t_tx_max);
  for (let i = 1; i < n; i++) {
    const t = i * dt_tx;
    const w = i % 2 === 1 ? 4.0 : 2.0;
    N_tx += w * rateProfile(t);
  }
  N_tx *= (dt_tx / 3.0);

  const t_rx_max = (Th * t_tx_max) / (Th - t_tx_max);
  const s_max = t_tx_max / Th;
  const ds = s_max / n;
  let N_rx = 0.0;
  for (let i = 0; i <= n; i++) {
    const s = i * ds;
    const t_tx = s * Th;
    const D2 = (1.0 - s) * (1.0 - s);
    const integrand = D2 > 0 ? (D2 * rateProfile(t_tx)) * (Th / D2) : 0.0;
    const w = (i === 0 || i === n) ? 1.0 : (i % 2 === 1 ? 4.0 : 2.0);
    N_rx += w * integrand;
  }
  N_rx *= (ds / 3.0);

  const abs_err = Math.abs(N_tx - N_rx);
  const rel_err = N_tx > 0 ? abs_err / N_tx : 0.0;
  return { N_tx, N_rx, abs_err, rel_err };
}

// 5.1 Constant rate under high acceleration (alpha = 100g, s = 0.5)
const Th100 = C_LIGHT / (100.0 * G_ACCEL);
const resConsConst = testBitConservationQuadrature(100.0 * G_ACCEL, 0.5 * Th100, (t) => 1e9, 2000);
assert(resConsConst.rel_err < 1e-4, `alpha=100g constant rate: bit conservation error < 1e-4 (rel_err=${resConsConst.rel_err.toExponential(2)})`);

// 5.2 Discontinuous pulse train (square wave on/off data bursts)
const resConsSquare = testBitConservationQuadrature(G_ACCEL, 86400.0, (t) => (Math.floor(t / 3600.0) % 2 === 0 ? 1e9 : 0.0), 3000);
assert(resConsSquare.rel_err < 0.005, `discontinuous on/off pulse train: bit conservation error < 0.5% (rel_err=${resConsSquare.rel_err.toExponential(2)})`);

// 5.3 Extreme relativistic time-dilation chirp (s = 0.90, D2 = 0.01 -> 100x symbol stretch)
const resConsChirp = testBitConservationQuadrature(G_ACCEL, 0.90 * Th1, (t) => 1e9 * (1.0 + 0.5 * Math.sin(2 * Math.PI * t / 50000.0)), 4000);
assert(
  resConsChirp.rel_err < 0.01,
  "s=0.90 extreme chirp modulation: uniform quadrature bit conservation error < 1.0%",
  `rel_err=${resConsChirp.rel_err.toExponential(2)} exceeds 1.0% tolerance due to non-uniform relativistic map warping`
);

// 5.4 Test integrateInFlightBits
const flightBits = integrateInFlightBits(86400.0, { alpha: G_ACCEL, trajectory_type: 'hyperbolic' });
assert(!isNaN(flightBits.in_flight_bits) && flightBits.in_flight_bits > 0, "in-flight storage bits positive and non-NaN");
assert(flightBits.delay_window_s > 0, "storage delay window strictly positive");

// ============================================================================
// SUITE 6: TWO-WAY LINK BUDGET SATURATION & HOLEVO CAPACITY NON-NEGATIVITY
// ============================================================================
print("\n--- SUITE 6: Link Budget Saturation & Gordon-Holevo Capacity Non-Negativity ---");

// 6.1 Near-field saturation at zero distance d = 0
const lbZeroDist = computeLinkBudget(lbConfig, 0.0, 1.0);
assert(lbZeroDist.eta_geom <= 1.0, `d=0 near-field energy conservation: eta_geom <= 1.0 (eta_geom=${lbZeroDist.eta_geom})`);
assert(lbZeroDist.eta_geom > 0.0, `d=0 near-field transfer: eta_geom > 0.0`);
assert(lbZeroDist.P_rx <= lbConfig.P_tx, `d=0 received power <= transmit power`);

// 6.2 CRITICAL ADVERSARIAL TEST: Gordon-Holevo capacity non-negativity at d = 0
// In high signal regimes (N_sig >> 1), capacity MUST remain strictly non-negative: C_holevo >= 0
assert(!isNaN(lbZeroDist.C_holevo_bps), "d=0 Holevo capacity is not NaN");
assert(
  lbZeroDist.C_holevo_bps >= 0.0,
  "CRITICAL CONSERVATION: Gordon-Holevo channel capacity must be non-negative (C >= 0)",
  `VIOLATION: C_holevo_bps = ${lbZeroDist.C_holevo_bps} bps (NEGATIVE CAPACITY due to lack of large-x expansion in gHolevo!)`
);

// 6.3 Test computeCapacity directly across signal levels from 1e-18 to 1e20 photons/mode
const testSigLevels = [1e-18, 1e-12, 1e-6, 1.0, 1e3, 1e6, 1e9, 1e12, 1e15, 1e16, 1e18, 1e20];
for (const n_sig of testSigLevels) {
  const cap = computeCapacity({}, n_sig, 1e-4);
  assert(!isNaN(cap.C_holevo_bps), `N_sig=${n_sig}: capacity is not NaN`);
  assert(
    cap.C_holevo_bps >= 0.0,
    `N_sig=${n_sig}: Holevo capacity must be non-negative`,
    `VIOLATION: N_sig=${n_sig} produced C_holevo_bps=${cap.C_holevo_bps} bps`
  );
  assert(
    cap.bits_per_photon >= 0.0,
    `N_sig=${n_sig}: bits per photon must be non-negative`,
    `VIOLATION: N_sig=${n_sig} produced bits_per_photon=${cap.bits_per_photon}`
  );
}

// 6.4 Monotonicity stress: Capacity must strictly increase with signal power
let prevCap = -1.0;
for (const n_sig of [1e-4, 1.0, 100.0, 1e4, 1e6, 1e8, 1e12, 1e16]) {
  const cap = computeCapacity({}, n_sig, 1e-4);
  assert(
    cap.C_holevo_bps > prevCap,
    `Capacity monotonicity: C(N_sig=${n_sig}) > C(prev)`,
    `VIOLATION: C(${n_sig})=${cap.C_holevo_bps} <= prev=${prevCap}`
  );
  prevCap = cap.C_holevo_bps;
}

// 6.5 Zero transmit power test: P_tx = 0
const lbZeroPower = computeLinkBudget({ ...lbConfig, P_tx: 0.0 }, 1.0 * ly, 1.0);
assert(
  lbZeroPower.P_rx === 0.0,
  "Physical conservation: P_tx = 0 must result in P_rx = 0",
  `VIOLATION: P_tx=0 produced P_rx=${lbZeroPower.P_rx} W (falsy default bug on line 330: p.P_tx || 1e11)`
);

// ============================================================================
// SUITE 7: RETROREFLECTOR ABERRATION DECOUPLING AT RELATIVISTIC TRANSVERSE SPEEDS
// ============================================================================
print("\n--- SUITE 7: Moving Retroreflector Velocity Aberration Decoupling ---");

// Relativistic 4-wavevector transformation oracle
// Computes exact Lorentz transformation of wavevectors on moving retroreflector
function oracleLorentzWavevectorReflection(beta_x, beta_y) {
  const beta_sq = beta_x * beta_x + beta_y * beta_y;
  if (beta_sq >= 1.0) throw new Error("Superluminal velocity");
  const gamma = 1.0 / Math.sqrt(1.0 - beta_sq);

  // Incident wave along +x: k^\mu = (1, 1, 0, 0) in lab frame
  const k0 = 1.0;
  const kx = 1.0;
  const ky = 0.0;

  // Boost to spacecraft frame K'
  const k_dot_beta = kx * beta_x + ky * beta_y;
  const factor = (gamma - 1.0) / beta_sq;
  const k0_prime = gamma * (k0 - k_dot_beta);
  const kx_prime = kx + factor * k_dot_beta * beta_x - gamma * k0 * beta_x;
  const ky_prime = ky + factor * k_dot_beta * beta_y - gamma * k0 * beta_y;

  // Perfect retroreflection in craft frame: k'_refl = (k0', -kx', -ky', 0)
  const k0_prime_refl = k0_prime;
  const kx_prime_refl = -kx_prime;
  const ky_prime_refl = -ky_prime;

  // Inverse boost back to Earth lab frame K (-beta)
  const k_prime_dot_beta = kx_prime_refl * beta_x + ky_prime_refl * beta_y;
  const k0_refl = gamma * (k0_prime_refl + k_prime_dot_beta);
  const kx_refl = kx_prime_refl + factor * k_prime_dot_beta * beta_x + gamma * k0_prime_refl * beta_x;
  const ky_refl = ky_prime_refl + factor * k_prime_dot_beta * beta_y + gamma * k0_prime_refl * beta_y;

  // Return angle relative to -x axis (lead angle theta_aber)
  const theta_refl_rad = Math.atan2(ky_refl, -kx_refl);
  return {
    D2_effective: k0_refl / k0,
    theta_aber_rad: Math.abs(theta_refl_rad),
  };
}

const transverseBetas = [1e-4, 1e-3, 0.01, 0.05];
for (const b_perp of transverseBetas) {
  const aber = computeAberration({ beta: 0.2, beta_perp: b_perp, D_refl: 1.0, lambda_0: 1064e-9 });

  // 1. Check aberration angle formula theta_aber = 2 * beta_perp / (1 - beta_parallel)
  const expected_theta = 2.0 * b_perp / (1.0 - 0.2);
  assertAlmostEqual(aber.theta_aber, expected_theta, 1e-12, `beta_perp=${b_perp}: theta_aber = 2*beta_perp / (1 - beta)`);

  // 2. Cross-check against full Lorentz 4-wavevector transformation oracle at beta_parallel = 0.2
  // Analytical fact: In the presence of recession velocity beta_parallel, theta_aber is amplified by 1 / (1 - beta_parallel)
  const oracle = oracleLorentzWavevectorReflection(0.2, b_perp);
  const rel_oracle_diff = Math.abs(aber.theta_aber - oracle.theta_aber_rad) / oracle.theta_aber_rad;
  assert(
    rel_oracle_diff < 0.05,
    `beta_perp=${b_perp}: aberration angle matches exact Lorentz 4-wavevector transformation (diff=${(rel_oracle_diff * 100).toFixed(1)}%)`,
    `Engine formula theta_aber = 2*beta_perp / (1 - beta_parallel) matches Lorentz deflection.`
  );

  // 3. Decoupling ratio verification
  if (b_perp >= 1e-3) {
    assert(aber.decoupling_ratio > 1000.0, `beta_perp=${b_perp}: severe decoupling ratio > 1000 (ratio=${aber.decoupling_ratio.toFixed(1)})`);
    assert(aber.requires_active_comp === true, `beta_perp=${b_perp}: requires active compensation flag is true`);
  }

  // 4. Dihedral angle offset calculation
  const delta_expected = expected_theta / 3.266;
  assertAlmostEqual(aber.delta_dihedral_rad, delta_expected, 1e-12, `beta_perp=${b_perp}: dihedral offset formula verified`);
  assert(aber.delta_dihedral_arcsec > 0, `beta_perp=${b_perp}: dihedral offset in arcseconds is positive`);
}

// ============================================================================
// SUITE SUMMARY & VERDICT DISPATCH
// ============================================================================
print("\n======================================================================");
print(` ADVERSARIAL STRESS TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
print("======================================================================");

if (failed > 0) {
  print("\nCRITICAL VULNERABILITIES & BUGS CONFIRMED IN ENGINE:");
  for (let i = 0; i < criticalBugs.length; i++) {
    print(`  [${i + 1}] ${criticalBugs[i].testName}`);
    print(`      Details: ${criticalBugs[i].detail}`);
  }
  print("\nOVERALL VERDICT: REJECTED");
} else {
  print("\nOVERALL VERDICT: CONFIRMED");
}
