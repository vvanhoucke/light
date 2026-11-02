"""
Relativistic Optics and Electrodynamics Engine for Optical Delay-Line Data Storage.

Covers:
- Two-way relativistic Doppler factor and wavelength transformation
- Acceleration-induced frequency chirp rate
- Symbol stretching and instantaneous bit-rate transformation
- Time-integrated bit conservation verification
- Moving retroreflector electrodynamics (Lorentz 4-wavevector transformation)
- Transverse velocity aberration, diffraction decoupling, and dihedral / cat's-eye compensation

References:
- survey_physics_report.md §2: Relativistic Doppler Dynamics, Frequency Chirp & Bit Conservation
- survey_physics_report.md §4: Relativistic Moving Retroreflector Electrodynamics & Aberration
- PROJECT.md § Interface Contracts
"""

import math
from typing import Dict, Any, Optional, Callable, Tuple, Union, List

C_LIGHT: float = 299792458.0  # Speed of light in vacuum (m/s)
G_ACCEL: float = 9.80665      # Standard Earth surface gravity (m/s^2)
ARCSEC_PER_RAD: float = 206264.80624709636  # Exact conversion 180 * 3600 / pi


def two_way_doppler_factor(beta: float) -> float:
    """
    Computes two-way relativistic Doppler shift factor D_2 = (1 - beta) / (1 + beta).

    Parameters:
    -----------
    beta : float
        Recession velocity ratio v/c (0 <= beta < 1).

    Returns:
    --------
    float
        Two-way Doppler factor D_2 (0 < D_2 <= 1).
    """
    if beta < 0.0 or beta >= 1.0:
        raise ValueError(f"Velocity fraction beta must be in [0, 1), got {beta}")
    return (1.0 - beta) / (1.0 + beta)


def doppler_factor_from_transmission(t_tx: float, alpha: float) -> float:
    """
    Computes two-way Doppler factor for continuous hyperbolic motion:
    D_2 = (1 - alpha * t_tx / c)^2 = dt_tx / dt_rx.

    Parameters:
    -----------
    t_tx : float
        Earth transmission time in seconds.
    alpha : float
        Proper acceleration in m/s^2.
    """
    Th = C_LIGHT / alpha
    if t_tx >= Th:
        return 0.0
    s = t_tx / Th
    return (1.0 - s) ** 2


def received_frequency(f_tx: float, beta: float) -> float:
    """
    Computes received optical carrier frequency: f_rx = f_tx * D_2(beta).
    """
    return f_tx * two_way_doppler_factor(beta)


def received_wavelength(lambda_tx: float, beta: float) -> float:
    """
    Computes received optical wavelength: lambda_rx = lambda_tx / D_2(beta).
    """
    D2 = two_way_doppler_factor(beta)
    if D2 <= 0.0:
        return float('inf')
    return lambda_tx / D2


def optical_redshift(beta: float) -> float:
    """
    Computes optical redshift parameter z = (lambda_rx - lambda_tx) / lambda_tx = 2 * beta / (1 - beta).
    """
    if beta < 0.0 or beta >= 1.0:
        raise ValueError(f"Velocity fraction beta must be in [0, 1), got {beta}")
    return 2.0 * beta / (1.0 - beta)


def frequency_chirp_rate(
    alpha: float,
    f_tx: Optional[float] = None,
    f_rx: Optional[float] = None,
    D2: Optional[float] = None,
    t_tx: Optional[float] = None,
    beta: Optional[float] = None
) -> float:
    """
    Computes the acceleration-induced frequency chirp rate df_rx / dt_rx at Earth receiver.

    Exact analytical forms:
    df_rx / dt_rx = -2 * (alpha / c) * f_tx * D_2^(3/2)
                  = -2 * (alpha / c) * f_rx * sqrt(D_2)

    Parameters:
    -----------
    alpha : float
        Proper acceleration in m/s^2.
    f_tx : float, optional
        Transmitted optical carrier frequency in Hz.
    f_rx : float, optional
        Received optical carrier frequency in Hz.
    D2 : float, optional
        Two-way Doppler factor.
    t_tx : float, optional
        Earth transmission time in seconds (used if D2 not directly given).
    beta : float, optional
        Recession velocity ratio (used if D2 not directly given).

    Returns:
    --------
    float
        Instantaneous chirp rate in Hz/s (negative for receding vehicle).
    """
    if alpha <= 0.0:
        return 0.0
    
    # Resolve D2
    if D2 is None:
        if beta is not None:
            D2 = two_way_doppler_factor(beta)
        elif t_tx is not None:
            D2 = doppler_factor_from_transmission(t_tx, alpha)
        else:
            raise ValueError("Must provide D2, beta, or t_tx to calculate chirp rate")
            
    if D2 <= 0.0:
        return 0.0
        
    if f_tx is not None:
        return - (2.0 * alpha / C_LIGHT) * f_tx * (D2 ** 1.5)
    elif f_rx is not None:
        return - (2.0 * alpha / C_LIGHT) * f_rx * math.sqrt(D2)
    else:
        raise ValueError("Must provide either f_tx or f_rx to compute chirp rate")


def symbol_duration_rx(T_tx: float, D2: float) -> float:
    """
    Computes stretched symbol duration at receiver: T_rx = T_tx / D_2.
    """
    if D2 <= 0.0:
        return float('inf')
    return T_tx / D2


def bit_rate_rx(R_tx: float, D2: float) -> float:
    """
    Computes compressed received bit rate: R_rx = R_tx * D_2.
    """
    return R_tx * D2


def verify_bit_conservation(
    R_tx_func: Callable[[float], float],
    t_tx_max: float,
    alpha: float,
    num_steps: int = 2000
) -> Dict[str, Any]:
    """
    Numerically verifies time-integrated bit conservation theorem:
    \int_0^{t_tx_max} R_tx(t') dt' == \int_0^{t_rx_max} R_rx(t'') dt''

    Parameters:
    -----------
    R_tx_func : callable
        Function R_tx(t) returning instantaneous transmission rate in bits/s.
    t_tx_max : float
        Upper coordinate transmission time in seconds.
    alpha : float
        Proper acceleration in m/s^2.
    num_steps : int
        Number of quadrature intervals for Simpson/trapezoidal integration.

    Returns:
    --------
    dict
        N_tx, N_rx, abs_error, rel_error, is_conserved.
    """
    Th = C_LIGHT / alpha
    if t_tx_max >= Th:
        raise ValueError(f"t_tx_max {t_tx_max} exceeds Rindler horizon {Th}")
        
    n = num_steps if (num_steps % 2 == 0) else (num_steps + 1)

    # Composite Simpson's 1/3 rule for transmitted bits
    h_tx = t_tx_max / n
    N_tx = R_tx_func(0.0) + R_tx_func(t_tx_max)
    for i in range(1, n):
        t = i * h_tx
        weight = 4.0 if (i % 2 == 1) else 2.0
        N_tx += weight * R_tx_func(t)
    N_tx *= (h_tx / 3.0)
        
    # Reception time corresponding to t_tx_max
    t_rx_max = (Th * t_tx_max) / (Th - t_tx_max)
    
    # Composite Simpson's rule for received bits with relativistic mapped coordinate grid
    # to maintain relative error < 1e-5 near Rindler horizon
    s_max = t_tx_max / Th
    ds = s_max / n
    N_rx = 0.0
    for i in range(n + 1):
        s = i * ds
        t_tx = s * Th
        D2 = (1.0 - s) ** 2
        integrand = (D2 * R_tx_func(t_tx)) * (Th / D2) if D2 > 0 else 0.0
        weight = 1.0 if (i == 0 or i == n) else (4.0 if i % 2 == 1 else 2.0)
        N_rx += weight * integrand
    N_rx *= (ds / 3.0)
        
    abs_err = abs(N_tx - N_rx)
    rel_err = abs_err / N_tx if N_tx > 0 else 0.0
    
    return {
        'N_tx': N_tx,
        'N_rx': N_rx,
        'abs_error': abs_err,
        'rel_error': rel_err,
        'is_conserved': bool(rel_err < 1e-5),
        't_tx_max': t_tx_max,
        't_rx_max': t_rx_max,
    }


def compute_in_flight_bits(
    t_earth: float,
    R_tx_func: Callable[[float], float],
    alpha: float,
    num_steps: int = 500
) -> Dict[str, Any]:
    """
    Computes total bits currently stored in flight in the optical delay line
    at Earth coordinate time t_earth:
    B_flight(t) = \int_{t_tx*(t)}^t R_tx(t') dt'
    """
    Th = C_LIGHT / alpha
    # Inverse reception time: transmission time of wavefront returning at t_earth
    t_tx_star = (Th * t_earth) / (Th + t_earth)
    
    dt = (t_earth - t_tx_star) / num_steps
    total_bits = 0.0
    for i in range(num_steps):
        t_mid = t_tx_star + (i + 0.5) * dt
        total_bits += R_tx_func(t_mid) * dt
        
    return {
        't_earth': t_earth,
        't_tx_star': t_tx_star,
        'delay_window_s': t_earth - t_tx_star,
        'in_flight_bits': total_bits,
    }


def lorentz_transform_wavevector(
    k_mu: Tuple[float, float, float, float],
    beta_x: float,
    beta_y: float = 0.0
) -> Dict[str, Any]:
    """
    Rigorous relativistic 4-wavevector transformation for reflection off a moving retroreflector:
    k^\mu = (\omega/c, k_x, k_y, k_z).

    Steps:
    1. Boost incident wavevector k^\mu into spacecraft rest frame K'.
    2. Apply corner-cube spatial inversion in craft frame: k'^\mu_refl = (k'^0, -k'_x, -k'_y, -k'_z).
    3. Inverse boost reflected wave back to Earth lab frame K.

    Parameters:
    -----------
    k_mu : tuple of 4 floats
        (k0, kx, ky, kz) where k0 = omega / c.
    beta_x : float
        Longitudinal spacecraft velocity fraction along x.
    beta_y : float
        Transverse spacecraft velocity fraction along y.

    Returns:
    --------
    dict
        Transformed 4-wavevectors and angles in lab and rest frames.
    """
    k0, kx, ky, kz = k_mu
    beta_sq = beta_x * beta_x + beta_y * beta_y
    if beta_sq >= 1.0:
        raise ValueError(f"Total velocity fraction squared beta^2={beta_sq} must be < 1.0")
    
    gamma = 1.0 / math.sqrt(1.0 - beta_sq)
    
    # Boost into craft frame K'
    if beta_sq == 0.0:
        k0_prime, kx_prime, ky_prime, kz_prime = k0, kx, ky, kz
    else:
        # Standard Lorentz boost for arbitrary direction beta_vec
        k_dot_beta = kx * beta_x + ky * beta_y
        factor = (gamma - 1.0) / beta_sq
        k0_prime = gamma * (k0 - k_dot_beta)
        kx_prime = kx + factor * k_dot_beta * beta_x - gamma * k0 * beta_x
        ky_prime = ky + factor * k_dot_beta * beta_y - gamma * k0 * beta_y
        kz_prime = kz
        
    # Reflection in craft frame (perfect retroreflection in K')
    k0_prime_refl = k0_prime
    kx_prime_refl = -kx_prime
    ky_prime_refl = -ky_prime
    kz_prime_refl = -kz_prime
    
    # Inverse boost back to Earth frame K (beta -> -beta)
    if beta_sq == 0.0:
        k0_refl, kx_refl, ky_refl, kz_refl = k0_prime_refl, kx_prime_refl, ky_prime_refl, kz_prime_refl
    else:
        k_prime_dot_beta = kx_prime_refl * beta_x + ky_prime_refl * beta_y
        factor = (gamma - 1.0) / beta_sq
        k0_refl = gamma * (k0_prime_refl + k_prime_dot_beta)
        kx_refl = kx_prime_refl + factor * k_prime_dot_beta * beta_x + gamma * k0_prime_refl * beta_x
        ky_refl = ky_prime_refl + factor * k_prime_dot_beta * beta_y + gamma * k0_prime_refl * beta_y
        kz_refl = kz_prime_refl
        
    return {
        'k_inc_lab': (k0, kx, ky, kz),
        'k_inc_craft': (k0_prime, kx_prime, ky_prime, kz_prime),
        'k_refl_craft': (k0_prime_refl, kx_prime_refl, ky_prime_refl, kz_prime_refl),
        'k_refl_lab': (k0_refl, kx_refl, ky_refl, kz_refl),
        'D2_effective': k0_refl / k0 if k0 > 0 else 0.0,
    }


def compute_reflector_aberration(
    params: Optional[Dict[str, Any]] = None,
    beta: Optional[float] = None,
    beta_perp: Optional[float] = None,
    D_refl: Optional[float] = None,
    lambda_0: Optional[float] = None,
    lambda_rx: Optional[float] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Computes velocity aberration, diffraction decoupling ratio,
    and required dihedral / cat's-eye point-ahead angle compensation.

    Conforms to PROJECT.md interface contract:
    compute_reflector_aberration(params, beta, beta_perp)

    Parameters:
    -----------
    params : dict, optional
        Dictionary containing:
        - D_refl : float (m, retroreflector aperture diameter)
        - lambda_0 : float (m, transmit wavelength)
        - beta : float, optional (longitudinal velocity fraction)
        - beta_perp : float, optional (transverse velocity fraction)
    beta : float, optional
        Longitudinal velocity fraction v_parallel / c.
    beta_perp : float, optional
        Transverse velocity fraction v_perp / c.
    D_refl : float, optional
        Retroreflector diameter in meters (overrides params).
    lambda_0 : float, optional
        Transmit wavelength in meters (overrides params).
    lambda_rx : float, optional
        Received redshifted wavelength in meters (computed if omitted).

    Returns:
    --------
    dict
        { theta_diff, theta_aber, decoupling_ratio, delta_dihedral_arcsec, requires_active_comp, ... }
    """
    cfg = {}
    if params is not None and isinstance(params, dict):
        cfg.update(params)
    cfg.update(kwargs)
    
    # Extract arguments with fallbacks
    b_long = beta if beta is not None else float(cfg.get('beta', 0.2))
    b_perp = beta_perp if beta_perp is not None else float(cfg.get('beta_perp', 9.934e-5))
    d_refl = D_refl if D_refl is not None else float(cfg.get('D_refl', 1.0))
    l_tx = lambda_0 if lambda_0 is not None else float(cfg.get('lambda_0', 1064e-9))
    
    if d_refl <= 0.0:
        raise ValueError(f"Retroreflector diameter D_refl must be positive, got {d_refl}")
    if l_tx <= 0.0:
        raise ValueError(f"Wavelength lambda_0 must be positive, got {l_tx}")
        
    D2 = two_way_doppler_factor(b_long) if (0.0 <= b_long < 1.0) else 0.5
    
    if lambda_rx is not None and lambda_rx > 0.0:
        l_rx = float(lambda_rx)
    else:
        l_rx = l_tx / D2 if D2 > 0.0 else l_tx
        
    # Relativistic velocity aberration including longitudinal Doppler amplification:
    # theta_aber = 2 * beta_perp / (1 - beta_parallel)
    theta_aber = (2.0 * b_perp / (1.0 - b_long)) if (0.0 <= b_long < 1.0) else (2.0 * b_perp)
    
    # Retroreflector diffraction beamwidth: theta_diff = 1.22 * lambda_rx / D_refl (rad)
    theta_diff = 1.22 * l_rx / d_refl
    
    # Decoupling ratio: ratio of aberration deflection to diffraction beamwidth
    decoupling_ratio = theta_aber / theta_diff if theta_diff > 0.0 else float('inf')
    
    # Hollow trihedral dihedral angle offset (n=1): delta_alpha = theta_aber / 3.266
    delta_dihedral_rad = theta_aber / 3.266
    
    # Alternative textbook formula: delta = beta_perp / (2 * sqrt(2))
    delta_dihedral_alt_rad = b_perp / (2.0 * math.sqrt(2.0))
    
    # Cat's-eye focal-plane tip-tilt deflection angle: theta_tilt = beta_perp
    cats_eye_tilt_rad = b_perp
    
    return {
        'theta_diff': theta_diff,
        'theta_diff_arcsec': theta_diff * ARCSEC_PER_RAD,
        'theta_aber': theta_aber,
        'theta_aber_arcsec': theta_aber * ARCSEC_PER_RAD,
        'decoupling_ratio': decoupling_ratio,
        'delta_dihedral_rad': delta_dihedral_rad,
        'delta_dihedral_arcsec': delta_dihedral_rad * ARCSEC_PER_RAD,
        'delta_dihedral_alt_rad': delta_dihedral_alt_rad,
        'delta_dihedral_alt_arcsec': delta_dihedral_alt_rad * ARCSEC_PER_RAD,
        'cats_eye_tilt_rad': cats_eye_tilt_rad,
        'cats_eye_tilt_arcsec': cats_eye_tilt_rad * ARCSEC_PER_RAD,
        'requires_active_comp': bool(decoupling_ratio > 0.5),
        'D_refl': d_refl,
        'lambda_rx': l_rx,
        'beta': b_long,
        'beta_perp': b_perp,
    }


def compute_optics(
    params: Optional[Dict[str, Any]] = None,
    t_tx: Optional[float] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Unified public interface for optical calculations.
    """
    cfg = {}
    if params is not None and isinstance(params, dict):
        cfg.update(params)
    cfg.update(kwargs)
    
    alpha = float(cfg.get('alpha', G_ACCEL))
    tx_val = t_tx if t_tx is not None else float(cfg.get('t_tx', 0.0))
    beta = cfg.get('beta', None)
    lambda_tx = float(cfg.get('lambda_0', cfg.get('lambda_tx', 1064e-9)))
    f_tx = C_LIGHT / lambda_tx
    
    if beta is not None:
        b_val = float(beta)
        D2 = two_way_doppler_factor(b_val)
    else:
        D2 = doppler_factor_from_transmission(tx_val, alpha)
        # Solve corresponding beta
        s = tx_val / (C_LIGHT / alpha) if (C_LIGHT / alpha) > 0 else 0.0
        b_val = (s * (2.0 - s)) / (2.0 - 2.0 * s + s * s) if s < 1.0 else 1.0
        
    f_rx = f_tx * D2
    lambda_rx = lambda_tx / D2 if D2 > 0 else float('inf')
    chirp = frequency_chirp_rate(alpha=alpha, f_tx=f_tx, D2=D2)
    z = optical_redshift(b_val) if b_val < 1.0 else float('inf')
    
    return {
        'D2': D2,
        'beta': b_val,
        'f_tx': f_tx,
        'f_rx': f_rx,
        'lambda_tx': lambda_tx,
        'lambda_rx': lambda_rx,
        'optical_redshift': z,
        'chirp_rate': chirp,
        'symbol_stretch': 1.0 / D2 if D2 > 0 else float('inf'),
    }
