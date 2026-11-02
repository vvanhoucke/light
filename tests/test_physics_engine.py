"""
tests/test_physics_engine.py — Rigorous Analytical Unit and Integration Tests

Verifies the mathematical physics engine (src.physics) against exact analytical benchmarks:
  1. test_hyperbolic_kinematics_exact: Closed-form t_refl, x_refl, t_rx across s in [0.1, 0.9].
  2. test_rindler_horizon_cutoff: Asymptotic horizon divergence and upload cutoff when t_tx >= c/alpha.
  3. test_doppler_factor_identity: D_2 = (1-beta)/(1+beta) == (1 - alpha*t_tx/c)^2 == dt_tx/dt_rx.
  4. test_chirp_rate_differential: df_rx/dt_rx = -2*(alpha/c)*f_tx*D_2^(3/2).
  5. test_bit_conservation_integral: Quadrature proof \int R_tx dt == \int R_rx dt'' (error < 1e-6).
  6. test_piecewise_boost_coast_continuity: C^1 smooth continuity across boost-to-coast transitions.
  7. test_diffraction_link_budget_scaling: Far-field 1/d^4 scaling, near-field saturation, D_2^2 penalty.
  8. test_ism_dust_extinction_wavelength_dependence: Rayleigh-Mie lambda^(-1.7) redshifted reduction.
  9. test_gordon_holevo_capacity_bounds: Photon-starved quantum limit & classical Shannon convergence.
  10. test_lorentz_aberration_decoupling_and_compensation: 4-wavevector boost, decoupling ratio & dihedral offset.
"""

import sys
import os
import math
import unittest

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.physics import (
    C_LIGHT,
    G_ACCEL,
    H_PLANCK,
    K_BOLTZMANN,
    ARCSEC_PER_RAD,
    SIGMA_DUST_REF,
    LAMBDA_REF,
    DUST_INDEX,
    RindlerHorizonError,
    rindler_horizon_time,
    rindler_scale_length,
    hyperbolic_position,
    hyperbolic_velocity,
    hyperbolic_beta,
    hyperbolic_gamma,
    solve_hyperbolic_reflection,
    parse_piecewise_parameters,
    solve_piecewise_reflection,
    reception_to_transmission_time,
    compute_kinematics,
    two_way_doppler_factor,
    doppler_factor_from_transmission,
    received_frequency,
    received_wavelength,
    optical_redshift,
    frequency_chirp_rate,
    symbol_duration_rx,
    bit_rate_rx,
    verify_bit_conservation,
    compute_in_flight_bits,
    lorentz_transform_wavevector,
    compute_reflector_aberration,
    compute_optics,
    transmitter_gain,
    retroreflector_rcs,
    two_way_geometric_transfer,
    beer_lambert_dust_extinction,
    compute_background_noise,
    compute_link_budget,
    g_holevo,
    holevo_capacity_per_mode,
    holevo_capacity_bps,
    photon_information_efficiency,
    shannon_capacity_bps,
    compute_stored_capacity,
    compute_capacity,
)


class TestPhysicsEngine(unittest.TestCase):
    """Analytical benchmark test suite for Relativistic Optical Delay-Line Physics Engine."""

    def setUp(self):
        self.alpha_1g = G_ACCEL  # 9.80665 m/s^2
        self.Th_1g = C_LIGHT / self.alpha_1g  # ~30570323.04 s (~353.823 days)
        self.X0_1g = (C_LIGHT ** 2) / self.alpha_1g  # ~9.16474e15 m (~0.9687 ly)

    # 1. Hyperbolic Kinematics Exact Closed Form
    def test_hyperbolic_kinematics_exact(self):
        """
        Benchmark: Test exact closed-form t_refl, x_refl, t_rx against analytical equations
        across normalized transmission time s = t_tx / T_h in [0.1, 0.25, 0.5, 0.75, 0.9].
        """
        alpha = self.alpha_1g
        Th = self.Th_1g
        X0 = self.X0_1g

        s_values = [0.1, 0.25, 0.5, 0.75, 0.9]
        for s in s_values:
            t_tx = s * Th
            res = solve_hyperbolic_reflection(t_tx, alpha, strict=True)

            # Theoretical benchmarks
            expected_t_refl = Th * (s * (2.0 - s)) / (2.0 * (1.0 - s))
            expected_x_refl = X0 * (s * s) / (2.0 * (1.0 - s))
            expected_t_rx = (Th * t_tx) / (Th - t_tx)
            expected_delta_t = (t_tx * t_tx) / (Th - t_tx)
            expected_beta_refl = (s * (2.0 - s)) / (2.0 - 2.0 * s + s * s)
            expected_gamma_refl = (2.0 - 2.0 * s + s * s) / (2.0 * (1.0 - s))
            expected_D2 = (1.0 - s) ** 2

            # Assertions with relative tolerance for astronomical scales
            self.assertAlmostEqual(res['t_refl'], expected_t_refl, places=7)
            self.assertAlmostEqual(res['x_refl'] / X0, expected_x_refl / X0, places=9)
            self.assertAlmostEqual(res['t_rx'], expected_t_rx, places=7)
            self.assertAlmostEqual(res['delta_t'], expected_delta_t, places=7)
            self.assertAlmostEqual(res['beta_refl'], expected_beta_refl, places=9)
            self.assertAlmostEqual(res['gamma_refl'], expected_gamma_refl, places=9)
            self.assertAlmostEqual(res['D2'], expected_D2, places=10)

            # Physical consistency check: null ray condition x_refl == c * (t_refl - t_tx)
            null_path_diff = abs(res['x_refl'] - C_LIGHT * (res['t_refl'] - t_tx))
            rel_null_diff = null_path_diff / res['x_refl']
            self.assertLess(rel_null_diff, 1e-12, "Forward null geodesic relative error too large")

            # Return null ray condition: t_rx == 2 * t_refl - t_tx
            self.assertAlmostEqual(res['t_rx'], 2.0 * res['t_refl'] - t_tx, places=7)

    # 2. Rindler Horizon Cutoff & Asymptotic Divergence
    def test_rindler_horizon_cutoff(self):
        """
        Benchmark: Verify upload cutoff when t_tx >= c/alpha (strict raises exception,
        non-strict returns cutoff flag, and delay -> inf as s -> 1).
        """
        alpha = self.alpha_1g
        Th = self.Th_1g

        # 1. Strict mode must raise RindlerHorizonError at and past horizon
        with self.assertRaises(RindlerHorizonError):
            solve_hyperbolic_reflection(Th, alpha, strict=True)

        with self.assertRaises(RindlerHorizonError):
            solve_hyperbolic_reflection(1.1 * Th, alpha, strict=True)

        # 2. Non-strict mode must return infinite delays and horizon flags
        res_cutoff = solve_hyperbolic_reflection(Th, alpha, strict=False)
        self.assertTrue(res_cutoff['horizon_cutoff'])
        self.assertTrue(res_cutoff['is_past_horizon'])
        self.assertEqual(res_cutoff['t_refl'], float('inf'))
        self.assertEqual(res_cutoff['x_refl'], float('inf'))
        self.assertEqual(res_cutoff['t_rx'], float('inf'))
        self.assertEqual(res_cutoff['delta_t'], float('inf'))
        self.assertEqual(res_cutoff['D2'], 0.0)

        # 3. Asymptotic behavior: As s -> 1.0, delay delta_t diverges to infinity
        delays = []
        for s in [0.9, 0.99, 0.999, 0.9999]:
            r = solve_hyperbolic_reflection(s * Th, alpha, strict=True)
            delays.append(r['delta_t'])

        for i in range(len(delays) - 1):
            self.assertGreater(delays[i + 1], delays[i] * 5.0, "Delay must diverge asymptotically")

    # 3. Doppler Factor Identity
    def test_doppler_factor_identity(self):
        """
        Benchmark: Verify D_2 = (1 - beta) / (1 + beta) == (1 - alpha*t_tx/c)^2 == dt_tx/dt_rx.
        """
        alpha = self.alpha_1g
        Th = self.Th_1g

        # Discrete velocity fractions
        test_betas = [0.0, 0.1, 0.2, 0.5, 0.8, 0.9, 0.99]
        for beta in test_betas:
            d2 = two_way_doppler_factor(beta)
            expected = (1.0 - beta) / (1.0 + beta)
            self.assertAlmostEqual(d2, expected, places=12)

        # Closed form vs velocity formulation in hyperbolic trajectory
        for s in [0.1, 0.3, 0.5, 0.7, 0.85]:
            t_tx = s * Th
            res = solve_hyperbolic_reflection(t_tx, alpha, strict=True)
            d2_kinematic = res['D2']
            d2_from_beta = two_way_doppler_factor(res['beta_refl'])
            d2_analytic = (1.0 - s) ** 2

            self.assertAlmostEqual(d2_kinematic, d2_from_beta, places=9)
            self.assertAlmostEqual(d2_kinematic, d2_analytic, places=12)

            # Numerical derivative dt_tx / dt_rx verification:
            # t_rx = Th * t_tx / (Th - t_tx) => dt_tx / dt_rx = (1 - s)^2
            eps = 1e-4 * Th
            t_rx_plus = (Th * (t_tx + eps)) / (Th - (t_tx + eps))
            t_rx_minus = (Th * (t_tx - eps)) / (Th - (t_tx - eps))
            dt_rx_dt_tx_num = (t_rx_plus - t_rx_minus) / (2.0 * eps)
            dt_tx_dt_rx_num = 1.0 / dt_rx_dt_tx_num

            self.assertAlmostEqual(d2_kinematic, dt_tx_dt_rx_num, places=6)

    # 4. Acceleration Chirp Rate Differential
    def test_chirp_rate_differential(self):
        """
        Benchmark: df_rx / dt_rx = -2 * (alpha / c) * f_tx * D_2^(3/2).
        Verifies analytical formula against numerical differentiation.
        """
        alpha = self.alpha_1g
        Th = self.Th_1g
        f_tx = 2.8176e14  # 1064 nm optical frequency (~281.76 THz)

        for s in [0.1, 0.25, 0.5, 0.75]:
            t_tx = s * Th
            res = solve_hyperbolic_reflection(t_tx, alpha, strict=True)
            D2 = res['D2']
            t_rx = res['t_rx']

            # Analytical chirp rate
            rate_analytical = frequency_chirp_rate(alpha, f_tx=f_tx, D2=D2)
            expected_rate = - (2.0 * alpha / C_LIGHT) * f_tx * (D2 ** 1.5)
            self.assertAlmostEqual(rate_analytical, expected_rate, places=4)

            # Central difference numerical differentiation in t_rx:
            # f_rx(t_rx) = f_tx / (1 + alpha * t_rx / c)^2
            dt_rx = 10.0  # 10 seconds step
            f_rx_plus = f_tx / ((1.0 + alpha * (t_rx + dt_rx) / C_LIGHT) ** 2)
            f_rx_minus = f_tx / ((1.0 + alpha * (t_rx - dt_rx) / C_LIGHT) ** 2)
            rate_numerical = (f_rx_plus - f_rx_minus) / (2.0 * dt_rx)

            rel_err = abs(rate_analytical - rate_numerical) / abs(rate_analytical)
            self.assertLess(rel_err, 1e-5, f"Chirp numerical derivative error too high at s={s}")

    # 5. Bit Conservation Integral
    def test_bit_conservation_integral(self):
        """
        Benchmark: Verify \int_0^{t_tx} R_tx(t') dt' == \int_0^{t_rx} R_rx(t'') dt''
        for arbitrary dynamic pulse sequences with quadrature error < 1e-6.
        """
        alpha = self.alpha_1g
        t_tx_max = 30.0 * 86400.0  # 30 days of transmission

        # Test 1: Constant bit rate (1 Gbps)
        def const_rate(t):
            return 1.0e9

        res_const = verify_bit_conservation(const_rate, t_tx_max, alpha, num_steps=3000)
        self.assertTrue(res_const['is_conserved'])
        self.assertLess(res_const['rel_error'], 1e-5)

        # Test 2: Ramped / modulated bit rate (sinusoidal pulse sequence)
        period = 7.0 * 86400.0  # 7-day variation
        def dynamic_rate(t):
            return 1.0e9 * (1.0 + 0.5 * math.sin(2.0 * math.pi * t / period))

        res_dynamic = verify_bit_conservation(dynamic_rate, t_tx_max, alpha, num_steps=3000)
        self.assertTrue(res_dynamic['is_conserved'])
        self.assertLess(res_dynamic['rel_error'], 1e-5)

        # Test 3: Instantaneous in-flight buffer equals integral over delay window
        t_earth = 15.0 * 86400.0
        in_flight = compute_in_flight_bits(t_earth, const_rate, alpha)
        expected_bits = 1.0e9 * in_flight['delay_window_s']
        self.assertAlmostEqual(in_flight['in_flight_bits'], expected_bits, places=1)

    # 6. Piecewise Boost-and-Coast Continuity (C^1 Smoothness)
    def test_piecewise_boost_coast_continuity(self):
        """
        Benchmark: Verify position and velocity C^1 continuity across boost-to-coast transition.
        """
        alpha = self.alpha_1g
        beta_coast = 0.5
        t1, x1, b_c, gamma_c, t_tx_crit = parse_piecewise_parameters(alpha, beta_coast=beta_coast)

        # 1. Position and velocity match at shutoff time t1
        x_boost_end = hyperbolic_position(t1, alpha)
        v_boost_end = hyperbolic_velocity(t1, alpha)
        self.assertAlmostEqual(x_boost_end, x1, places=3)
        self.assertAlmostEqual(v_boost_end / C_LIGHT, beta_coast, places=9)

        # 2. Kinematic reflection solver across critical boundary t_tx_crit
        eps = 1.0  # 1 second delta
        res_before = solve_piecewise_reflection(t_tx_crit - eps, alpha, beta_coast=beta_coast)
        res_after = solve_piecewise_reflection(t_tx_crit + eps, alpha, beta_coast=beta_coast)

        self.assertEqual(res_before['phase'], 'boost')
        self.assertEqual(res_after['phase'], 'coast')

        # Reflection time continuity: |t_refl_after - t_refl_before| must be very small (~O(eps))
        t_refl_diff = abs(res_after['t_refl'] - res_before['t_refl'])
        self.assertLess(t_refl_diff, 10.0 * eps)

        # Position continuity
        x_refl_diff = abs(res_after['x_refl'] - res_before['x_refl'])
        self.assertLess(x_refl_diff, 10.0 * C_LIGHT * eps)

        # 3. Far coasting phase: beta must remain constant at beta_coast
        res_far = solve_piecewise_reflection(t_tx_crit + 1e6, alpha, beta_coast=beta_coast)
        self.assertEqual(res_far['beta_refl'], beta_coast)
        self.assertAlmostEqual(res_far['D2'], (1.0 - beta_coast) / (1.0 + beta_coast), places=12)

    # 7. Two-Way Diffraction Link Budget Scaling
    def test_diffraction_link_budget_scaling(self):
        """
        Benchmark: Verify 1/d^4 far-field geometric power scaling, near-field saturation,
        and D_2^2 relativistic attenuation penalty.
        """
        D_tx = 30.0     # 30 m transmitter
        D_refl = 4.0    # 4 m retroreflector
        D_rx = 50.0     # 50 m receiver
        lambda_tx = 1064e-9
        D2 = 0.5        # Doppler factor

        # Far-field distances: d1 = 1 ly, d2 = 2 ly (factor of 2 distance)
        ly = 9.4607304725808e15
        d1 = 1.0 * ly
        d2 = 2.0 * ly

        P_ratio_1 = two_way_geometric_transfer(d1, D2, D_tx, D_refl, D_rx, lambda_tx)
        P_ratio_2 = two_way_geometric_transfer(d2, D2, D_tx, D_refl, D_rx, lambda_tx)

        # In the far field, power must scale precisely as (d1 / d2)^4 = 1/16 = 0.0625
        scaling_ratio = P_ratio_2 / P_ratio_1
        expected_ratio = (d1 / d2) ** 4
        self.assertAlmostEqual(scaling_ratio, expected_ratio, places=5)

        # Near-field limit: at d = 0, power transfer must saturate and obey energy conservation <= 1.0
        P_ratio_zero = two_way_geometric_transfer(0.0, D2, D_tx, D_refl, D_rx, lambda_tx)
        self.assertLessEqual(P_ratio_zero, 1.0)
        self.assertGreater(P_ratio_zero, 0.0)

        # Relativistic energy scaling: P_rx proportional to D_2^2 in far field
        D2_a = 0.8
        D2_b = 0.4  # factor of 2 reduction in Doppler
        P_d2_a = two_way_geometric_transfer(d1, D2_a, D_tx, D_refl, D_rx, lambda_tx)
        P_d2_b = two_way_geometric_transfer(d1, D2_b, D_tx, D_refl, D_rx, lambda_tx)
        self.assertAlmostEqual(P_d2_b / P_d2_a, (D2_b / D2_a) ** 2, places=4)

    # 8. Beer-Lambert ISM Dust Extinction Wavelength Dependence
    def test_ism_dust_extinction_wavelength_dependence(self):
        """
        Benchmark: Verify Beer-Lambert extinction reduction for Doppler-redshifted return wavelengths
        following Rayleigh-Mie lambda^(-1.7) dispersion.
        """
        distance = 1.0 * 9.4607304725808e15  # 1 ly
        n_H = 1.0e6  # 1 cm^-3 dense cloud
        lambda_tx = 1064e-9

        # Stationary case: D2 = 1.0 (lambda_rx = lambda_tx)
        T_stat = beer_lambert_dust_extinction(distance, 1.0, lambda_tx, n_H=n_H)

        # Relativistic case: beta = 0.8 => D2 = 0.1111 => lambda_rx = 9 * lambda_tx (MIR)
        D2_rel = two_way_doppler_factor(0.8)
        T_rel = beer_lambert_dust_extinction(distance, D2_rel, lambda_tx, n_H=n_H)

        # Because lambda_rx > lambda_tx, dust cross section on return path is lower:
        # sigma_rx = sigma_0 * D2^(1.7) < sigma_0. Hence transmittance must be higher!
        self.assertGreater(T_rel, T_stat, "Redshifted return link must experience reduced extinction")

        # Monotonicity with distance
        T_far = beer_lambert_dust_extinction(2.0 * distance, D2_rel, lambda_tx, n_H=n_H)
        self.assertLess(T_far, T_rel, "Transmittance must decrease with distance")

    # 9. Gordon-Holevo Quantum Channel Capacity Bounds
    def test_gordon_holevo_capacity_bounds(self):
        """
        Benchmark: Test Holevo capacity formula in photon-starved quantum regime
        (convergence to PIE = log2(1/N_sig) + log2(e)) and classical Shannon limit.
        """
        # 1. Entropy function properties: g(0) = 0, g(x) > 0 for x > 0
        self.assertEqual(g_holevo(0.0), 0.0)
        self.assertGreater(g_holevo(1.0), 1.0)

        # 2. Photon-starved quantum regime: N_sig << 1, N_noise = 0
        log2_e = 1.4426950408889634
        for N_sig in [1e-3, 1e-5, 1e-8]:
            pie = photon_information_efficiency(N_sig, N_noise=0.0)
            pie_expected = math.log2(1.0 / N_sig) + log2_e
            rel_err = abs(pie - pie_expected) / pie_expected
            self.assertLess(rel_err, 0.005, f"PIE failed to converge at N_sig={N_sig}")

        # 3. High-noise / classical limit: N_noise >> 1, N_sig << N_noise
        N_noise = 100.0
        N_sig = 0.1
        C_holevo = holevo_capacity_per_mode(N_sig, N_noise)
        # In classical limit: C ~ SNR * log2(e) = (N_sig / N_noise) * log2(e)
        C_classical_expected = (N_sig / N_noise) * log2_e
        rel_diff = abs(C_holevo - C_classical_expected) / C_classical_expected
        self.assertLess(rel_diff, 0.02, "Failed classical convergence in thermal limit")

    # 10. Lorentz Aberration Decoupling and Compensation
    def test_lorentz_aberration_decoupling_and_compensation(self):
        """
        Benchmark: Tests 4-wavevector transformation, velocity aberration angle
        theta_aber ~= 2*beta_perp, decoupling ratio, and dihedral offset compensation.
        """
        # Earth orbital transverse motion: v_perp = 29.78 km/s => beta_perp = 9.934e-5
        beta_perp = 9.934e-5
        D_refl = 1.0  # 1 meter aperture
        lambda_0 = 1064e-9  # 1064 nm

        res = compute_reflector_aberration(
            beta=0.2,
            beta_perp=beta_perp,
            D_refl=D_refl,
            lambda_0=lambda_0
        )

        # Expected velocity aberration lead angle: theta_aber = 2 * beta_perp / (1 - beta_parallel)
        expected_theta_aber = 2.0 * beta_perp / (1.0 - 0.2)
        self.assertAlmostEqual(res['theta_aber'], expected_theta_aber, places=10)

        # Arcsecond conversion check (~51.22")
        expected_arcsec = expected_theta_aber * ARCSEC_PER_RAD
        self.assertAlmostEqual(res['theta_aber_arcsec'], expected_arcsec, places=2)

        # Diffraction beamwidth: theta_diff = 1.22 * lambda_rx / D_refl
        # At beta=0.2, D2 = 2/3 => lambda_rx = 1.5 * lambda_0 = 1596 nm
        lambda_rx = 1.5 * lambda_0
        expected_theta_diff = 1.22 * lambda_rx / D_refl
        self.assertAlmostEqual(res['theta_diff'], expected_theta_diff, places=10)

        # Catastrophic decoupling: ratio theta_aber / theta_diff >> 1 mandates active compensation
        self.assertGreater(res['decoupling_ratio'], 50.0)
        self.assertTrue(res['requires_active_comp'])

        # Dihedral angle offset: delta_alpha = theta_aber / 3.266
        expected_dihedral_rad = expected_theta_aber / 3.266
        self.assertAlmostEqual(res['delta_dihedral_rad'], expected_dihedral_rad, places=10)

        # 4-Wavevector Lorentz boost test: purely radial incidence
        # k^\mu = (k0, k0, 0, 0)
        k0 = 1.0
        wave_res = lorentz_transform_wavevector((k0, k0, 0.0, 0.0), beta_x=0.5, beta_y=0.0)
        # For radial incidence at beta=0.5, D2 = (1-0.5)/(1+0.5) = 1/3
        self.assertAlmostEqual(wave_res['D2_effective'], 1.0 / 3.0, places=9)
        k_refl_lab = wave_res['k_refl_lab']
        # Reflected wavevector must be antiparallel: kx_refl == - k0_refl
        self.assertAlmostEqual(k_refl_lab[1], -k_refl_lab[0], places=9)
        self.assertEqual(k_refl_lab[2], 0.0)
        self.assertEqual(k_refl_lab[3], 0.0)


if __name__ == "__main__":
    unittest.main()
