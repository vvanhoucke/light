"""
Quantum Channel Capacity Engine for Optical Delay-Line Data Storage.

Implements:
- Gordon-Holevo bosonic channel capacity for single-mode quantum optical states
- Photon Information Efficiency (PIE, bits/photon) in the photon-starved regime
- Classical Shannon AWGN capacity comparison in the thermal/high-noise limit
- Dynamic in-flight stored data capacity integral over the storage delay window

References:
- survey_physics_report.md §3.4: Gordon-Holevo Quantum Channel Capacity
- survey_physics_report.md §3.5: Total In-Flight Data Storage Capacity
- PROJECT.md § Interface Contracts
"""

import math
from typing import Dict, Any, Optional, Callable, Union

# Fundamental Physical Constants (SI)
C_LIGHT: float = 299792458.0      # m/s
H_PLANCK: float = 6.62607015e-34  # J s
LN2: float = 0.6931471805599453   # ln(2)
LOG2_E: float = 1.4426950408889634 # log2(e)


def g_holevo(x: float) -> float:
    """
    Computes the von Neumann entropy function g(x) for bosonic thermal states:
    g(x) = (x + 1) * log2(x + 1) - x * log2(x)

    Handles limits with analytical precision:
    - g(0) = 0
    - For x << 1: g(x) = x * (log2(1/x) + log2(e)) + x^2 / (2 * ln 2) - ...

    Parameters:
    -----------
    x : float
        Mean photon number per mode (x >= 0).

    Returns:
    --------
    float
        Entropy in bits per mode.
    """
    if x <= 0.0:
        return 0.0
    if x < 1e-15:
        # Taylor series expansion to avoid log(0) and loss of precision
        return x * (-math.log2(x) + LOG2_E)
    if x > 1e7:
        # Asymptotic expansion for large photon counts to prevent IEEE 754 float cancellation
        return math.log2(x) + LOG2_E + (LOG2_E / (2.0 * x)) - (LOG2_E / (12.0 * x * x))
    
    return (x + 1.0) * math.log2(x + 1.0) - x * math.log2(x)


def holevo_capacity_per_mode(N_sig: float, N_noise: float = 0.0) -> float:
    """
    Computes the Gordon-Holevo channel capacity per spatiotemporal mode:
    C_mode = g(N_sig + N_noise) - g(N_noise)  [bits / mode]

    Parameters:
    -----------
    N_sig : float
        Mean signal photon number per mode.
    N_noise : float
        Mean background/thermal noise photon number per mode.

    Returns:
    --------
    float
        Capacity in bits per mode.
    """
    if N_sig <= 0.0:
        return 0.0
    if N_noise < 0.0:
        N_noise = 0.0
        
    return g_holevo(N_sig + N_noise) - g_holevo(N_noise)


def holevo_capacity_bps(N_sig: float, B_opt: float, N_noise: float = 0.0) -> float:
    """
    Computes total Gordon-Holevo channel capacity in bits per second:
    C_bps = B_opt * [ g(N_sig + N_noise) - g(N_noise) ]

    Parameters:
    -----------
    N_sig : float
        Signal photons per mode.
    B_opt : float
        Optical channel bandwidth in Hz (modes per second).
    N_noise : float
        Noise photons per mode.

    Returns:
    --------
    float
        Channel capacity in bits/s.
    """
    if B_opt <= 0.0 or N_sig <= 0.0:
        return 0.0
    return B_opt * holevo_capacity_per_mode(N_sig, N_noise)


def photon_information_efficiency(N_sig: float, N_noise: float = 0.0) -> float:
    """
    Computes Photon Information Efficiency (PIE) in bits per photon:
    PIE = C_mode / N_sig

    In the photon-starved quantum regime (N_sig -> 0, N_noise -> 0):
    PIE -> log2(1 / N_sig) + log2(e) -> infinity.

    Parameters:
    -----------
    N_sig : float
        Signal photons per mode.
    N_noise : float
        Noise photons per mode.

    Returns:
    --------
    float
        Information efficiency in bits / photon.
    """
    if N_sig <= 0.0:
        return 0.0
    c_mode = holevo_capacity_per_mode(N_sig, N_noise)
    return c_mode / N_sig


def shannon_capacity_bps(SNR: float, B_opt: float) -> float:
    """
    Computes classical Shannon capacity for AWGN channel:
    C_shannon = B_opt * log2(1 + SNR) [bits/s]
    """
    if SNR <= 0.0 or B_opt <= 0.0:
        return 0.0
    return B_opt * math.log2(1.0 + SNR)


def compute_stored_capacity(
    t_earth: float,
    capacity_profile: Callable[[float], float],
    alpha: float,
    trajectory_type: str = 'hyperbolic',
    beta_coast: Optional[float] = None,
    t_burn: Optional[float] = None,
    num_steps: int = 500
) -> Dict[str, Any]:
    """
    Computes total in-flight data storage capacity in bits by integrating the upload
    channel capacity C(t') over the active delay window:
    C_stored(t_earth) = \int_{t_tx*(t_earth)}^{t_earth} C(t') dt'

    Parameters:
    -----------
    t_earth : float
        Current Earth coordinate time in seconds.
    capacity_profile : callable
        Function C(t) returning upload capacity in bits/s at transmission time t.
    alpha : float
        Proper acceleration in m/s^2.
    trajectory_type : str
        'hyperbolic' or 'piecewise'.
    beta_coast : float, optional
        Cruise velocity fraction.
    t_burn : float, optional
        Burn duration in seconds.
    num_steps : int
        Number of numerical integration quadrature steps.

    Returns:
    --------
    dict
        { t_earth, t_tx_star, storage_delay_s, stored_capacity_bits, stored_capacity_bytes }
    """
    Th = C_LIGHT / alpha
    
    if trajectory_type == 'hyperbolic':
        t_tx_star = (Th * t_earth) / (Th + t_earth)
    else:
        # Piecewise boost-and-coast
        from .kinematics import reception_to_transmission_time
        t_tx_star = reception_to_transmission_time(
            t_rx=t_earth,
            alpha=alpha,
            trajectory_type='piecewise',
            beta_coast=beta_coast,
            t_burn=t_burn
        )
        
    delay_window = t_earth - t_tx_star
    dt = delay_window / num_steps
    total_stored_bits = 0.0
    
    for i in range(num_steps):
        t_mid = t_tx_star + (i + 0.5) * dt
        total_stored_bits += capacity_profile(t_mid) * dt
        
    return {
        't_earth': t_earth,
        't_tx_star': t_tx_star,
        'storage_delay_s': delay_window,
        'stored_capacity_bits': total_stored_bits,
        'stored_capacity_bytes': total_stored_bits / 8.0,
        'stored_capacity_GB': total_stored_bits / (8.0 * 1e9),
        'stored_capacity_TB': total_stored_bits / (8.0 * 1e12),
    }


def compute_capacity(
    params: Optional[Dict[str, Any]] = None,
    N_sig: Optional[float] = None,
    P_rx: Optional[float] = None,
    f_rx: Optional[float] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Unified public interface for quantum channel capacity.
    """
    cfg = {}
    if params is not None and isinstance(params, dict):
        cfg.update(params)
    cfg.update(kwargs)
    
    B_opt = float(cfg.get('B_opt', cfg.get('B_hz', 1.0e9)))  # 1 GHz optical bandwidth default
    N_noise = float(cfg.get('N_noise', 1.0e-4))
    
    if N_sig is not None:
        n_sig_val = float(N_sig)
    elif P_rx is not None and f_rx is not None and f_rx > 0:
        photon_rate = float(P_rx) / (H_PLANCK * float(f_rx))
        n_sig_val = photon_rate / B_opt if B_opt > 0 else 0.0
    else:
        n_sig_val = float(cfg.get('N_sig', 1.0))
        
    c_mode = holevo_capacity_per_mode(n_sig_val, N_noise)
    c_bps = B_opt * c_mode
    pie = photon_information_efficiency(n_sig_val, N_noise)
    
    # SNR equivalent for classical comparison
    snr = n_sig_val / N_noise if N_noise > 0 else float('inf')
    c_shannon = shannon_capacity_bps(snr, B_opt) if N_noise > 0 else float('inf')
    
    return {
        'N_sig': n_sig_val,
        'N_noise': N_noise,
        'B_opt': B_opt,
        'C_holevo_per_mode': c_mode,
        'C_holevo_bps': c_bps,
        'bits_per_photon': pie,
        'SNR': snr,
        'C_shannon_bps': c_shannon,
    }
