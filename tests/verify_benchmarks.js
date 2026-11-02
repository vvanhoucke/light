// tests/verify_benchmarks.js
// Independent verification script for the 10 analytical physics benchmarks using JSC engine

import {
  C_LIGHT,
  G_ACCEL,
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

function assert(condition, testName, detail = '') {
  if (condition) {
    print(`  [PASS] ${testName}`);
    passed++;
  } else {
    print(`  [FAIL] ${testName}: ${detail}`);
    failed++;
  }
}

function assertAlmostEqual(a, b, tolerance, testName) {
  const diff = Math.abs(a - b);
  const ok = diff <= tolerance;
  assert(ok, testName, `expected ${b}, got ${a}, diff ${diff} > ${tolerance}`);
}

print("============================================================");
print(" RUNNING 10 RIGOROUS ANALYTICAL BENCHMARK TESTS (JSC ENGINE)");
print("============================================================");

// 1. Hyperbolic Kinematics Exact Closed Form
print("\nTest 1: test_hyperbolic_kinematics_exact");
const alpha = G_ACCEL;
const Th = C_LIGHT / alpha;
const X0 = (C_LIGHT * C_LIGHT) / alpha;

for (const s of [0.1, 0.25, 0.5, 0.75, 0.9]) {
  const t_tx = s * Th;
  const res = computeKinematics({ alpha: alpha, trajectory_type: 'hyperbolic' }, t_tx);
  const expected_t_refl = Th * (s * (2.0 - s)) / (2.0 * (1.0 - s));
  const expected_x_refl = X0 * (s * s) / (2.0 * (1.0 - s));
  const expected_t_rx = (Th * t_tx) / (Th - t_tx);
  const expected_D2 = (1.0 - s) * (1.0 - s);

  assertAlmostEqual(res.t_refl, expected_t_refl, 1e-4, `t_refl at s=${s}`);
  assertAlmostEqual(res.x_refl / X0, expected_x_refl / X0, 1e-9, `x_refl at s=${s}`);
  assertAlmostEqual(res.t_rx, expected_t_rx, 1e-4, `t_rx at s=${s}`);
  assertAlmostEqual(res.D2, expected_D2, 1e-9, `D2 at s=${s}`);
  const relNull = Math.abs(res.x_refl - C_LIGHT * (res.t_refl - t_tx)) / res.x_refl;
  assert(relNull < 1e-12, `null geodesic forward s=${s}`, `relNull=${relNull}`);
  assertAlmostEqual(res.t_rx, 2.0 * res.t_refl - t_tx, 1e-4, `return null geodesic s=${s}`);
}

// 2. Rindler Horizon Cutoff
print("\nTest 2: test_rindler_horizon_cutoff");
const resHorizon = computeKinematics({ alpha: alpha, trajectory_type: 'hyperbolic' }, Th);
assert(resHorizon.horizon_cutoff === true, "horizon cutoff flag set at t_tx = Th");
assert(resHorizon.t_refl === Infinity, "t_refl is Infinity at horizon");
assert(resHorizon.delta_t === Infinity, "delta_t is Infinity at horizon");
assert(resHorizon.D2 === 0.0, "D2 is 0.0 at horizon");

const resPast = computeKinematics({ alpha: alpha, trajectory_type: 'hyperbolic' }, 1.1 * Th);
assert(resPast.is_past_horizon === true, "is_past_horizon set past horizon");

// 3. Doppler Factor Identity
print("\nTest 3: test_doppler_factor_identity");
assertAlmostEqual(twoWayDopplerFactor(0.2), 2.0 / 3.0, 1e-12, "D2 at beta=0.2 is 2/3");
assertAlmostEqual(twoWayDopplerFactor(0.5), 1.0 / 3.0, 1e-12, "D2 at beta=0.5 is 1/3");
assertAlmostEqual(twoWayDopplerFactor(0.8), 1.0 / 9.0, 1e-12, "D2 at beta=0.8 is 1/9");

for (const s of [0.1, 0.3, 0.5, 0.7]) {
  const t_tx = s * Th;
  const res = computeKinematics({ alpha: alpha, trajectory_type: 'hyperbolic' }, t_tx);
  const d2_from_beta = twoWayDopplerFactor(res.beta_refl);
  assertAlmostEqual(res.D2, d2_from_beta, 1e-9, `D2 identity with beta at s=${s}`);
}

// 4. Chirp Rate Differential
print("\nTest 4: test_chirp_rate_differential");
const f_tx = 2.8176e14;
for (const s of [0.1, 0.25, 0.5]) {
  const t_tx = s * Th;
  const res = computeKinematics({ alpha: alpha, trajectory_type: 'hyperbolic' }, t_tx);
  const D2 = res.D2;
  const rateAnalytic = computeChirpRate(alpha, f_tx, D2);
  const expectedRate = -2.0 * (alpha / C_LIGHT) * f_tx * Math.pow(D2, 1.5);
  assertAlmostEqual(rateAnalytic, expectedRate, 1e-4, `chirp rate at s=${s}`);
}

// 5. Bit Conservation Integral
print("\nTest 5: test_bit_conservation_integral");
const t_tx_max = 10.0 * 86400.0;
const N_steps = 1000;
const dt_tx = t_tx_max / N_steps;
let N_tx = 0.0;
const R0 = 1e9;
for (let i = 0; i < N_steps; i++) {
  N_tx += R0 * dt_tx;
}
const t_rx_max = (Th * t_tx_max) / (Th - t_tx_max);
const dt_rx = t_rx_max / N_steps;
let N_rx = 0.0;
for (let i = 0; i < N_steps; i++) {
  const t_rx_mid = (i + 0.5) * dt_rx;
  const t_tx_star = (Th * t_rx_mid) / (Th + t_rx_mid);
  const s_star = t_tx_star / Th;
  const D2 = (1.0 - s_star) * (1.0 - s_star);
  const R_rx = D2 * R0;
  N_rx += R_rx * dt_rx;
}
const rel_err = Math.abs(N_tx - N_rx) / N_tx;
assert(rel_err < 1e-4, "bit conservation integral relative error < 1e-4", `rel_err=${rel_err}`);

// 6. Piecewise Boost-Coast Continuity
print("\nTest 6: test_piecewise_boost_coast_continuity");
const p_piecewise = { alpha: G_ACCEL, beta_coast: 0.5, trajectory_type: 'piecewise' };
const resKin0 = computeKinematics(p_piecewise, 0.0);
const t_tx_crit = resKin0.t_tx_crit;
const resBefore = computeKinematics(p_piecewise, t_tx_crit - 1.0);
const resAfter = computeKinematics(p_piecewise, t_tx_crit + 1.0);
assert(resBefore.phase === 'boost', "phase before t_tx_crit is boost");
assert(resAfter.phase === 'coast', "phase after t_tx_crit is coast");
assert(Math.abs(resAfter.t_refl - resBefore.t_refl) < 10.0, "t_refl is continuous across transition");
assertAlmostEqual(resAfter.beta_refl, 0.5, 1e-9, "coast velocity is exactly 0.5c");

// 7. Diffraction Link Budget Scaling
print("\nTest 7: test_diffraction_link_budget_scaling");
const ly = 9.4607304725808e15;
const d1 = 1.0 * ly;
const d2 = 2.0 * ly;
const D2_link = 0.5;
const lbParams = { P_tx: 1e9, D_tx: 30.0, D_refl: 4.0, D_rx: 50.0, lambda_0: 1064e-9, n_H: 0.0 };
const lb1 = computeLinkBudget(lbParams, d1, D2_link);
const lb2 = computeLinkBudget(lbParams, d2, D2_link);
const ratio = lb2.P_rx / lb1.P_rx;
assertAlmostEqual(ratio, 1.0 / 16.0, 1e-4, "far field scales as (d1/d2)^4 = 1/16");
const lbNear = computeLinkBudget(lbParams, 0.0, D2_link);
assert(lbNear.eta_geom <= 1.0 && lbNear.eta_geom > 0.0, "near field energy conservation <= 1.0");

// 8. ISM Dust Extinction Wavelength Dependence
print("\nTest 8: test_ism_dust_extinction_wavelength_dependence");
const lbDustStat = computeLinkBudget({ lambda_0: 1064e-9, n_H: 1.0 }, 1.0 * ly, 1.0);
const lbDustRel = computeLinkBudget({ lambda_0: 1064e-9, n_H: 1.0 }, 1.0 * ly, twoWayDopplerFactor(0.8));
assert(lbDustRel.eta_dust > lbDustStat.eta_dust, "redshifted return link experiences reduced extinction");
const lbDustFar = computeLinkBudget({ lambda_0: 1064e-9, n_H: 1.0 }, 2.0 * ly, twoWayDopplerFactor(0.8));
assert(lbDustFar.eta_dust < lbDustRel.eta_dust, "extinction increases with distance");

// 9. Gordon-Holevo Capacity Bounds
print("\nTest 9: test_gordon_holevo_capacity_bounds");
assert(gHolevo(0.0) === 0.0, "g(0) is 0");
const log2_e = 1.4426950408889634;
for (const N_sig of [1e-3, 1e-5, 1e-8]) {
  const cap = computeCapacity({}, N_sig, 0.0);
  const pie = cap.bits_per_photon;
  const pie_expected = Math.log2(1.0 / N_sig) + log2_e;
  const err = Math.abs(pie - pie_expected) / pie_expected;
  assert(err < 0.005, `PIE converges to log2(1/N) + log2(e) for N=${N_sig}`, `err=${err}`);
}

// 10. Lorentz Aberration Decoupling & Compensation
print("\nTest 10: test_lorentz_aberration_decoupling_and_compensation");
const b_perp = 9.934e-5;
const aber = computeAberration({ beta: 0.2, beta_perp: b_perp, D_refl: 1.0, lambda_0: 1064e-9 });
const expected_theta = 2.0 * b_perp / (1.0 - 0.2);
assertAlmostEqual(aber.theta_aber, expected_theta, 1e-12, "theta_aber = 2 * beta_perp / (1 - beta)");
assertAlmostEqual(aber.theta_aber_arcsec, expected_theta * ARCSEC_PER_RAD, 1e-2, "theta_aber ~ 51.23 arcsec");
assert(aber.decoupling_ratio > 50.0, "decoupling ratio > 50 for 1m aperture");
assert(aber.requires_active_comp === true, "requires active compensation");
assertAlmostEqual(aber.delta_dihedral_rad, expected_theta / 3.266, 1e-10, "dihedral offset delta_alpha = theta_aber / 3.266");

print("\n============================================================");
print(` BENCHMARK SUMMARY: ${passed} PASSED, ${failed} FAILED`);
print("============================================================");
if (failed > 0) {
  throw new Error(`${failed} benchmark assertions failed`);
}
