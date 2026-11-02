"""
Relativistic Optical Link Budget and ISM Extinction Engine.

Models the end-to-end optical transmission channel between Earth and the receding spacecraft:
- Near-to-far field geometric diffraction with 1/d^4 scaling and D_2^2 relativistic energy penalty
- Wavelength-dependent Beer-Lambert interstellar dust and gas extinction in the Local Interstellar Cloud
- Background noise (Zodiacal light, integrated starlight, CMB blackbody)
- Gordon-Holevo bosonic channel capacity and photon information efficiency integration

References:
- survey_physics_report.md §3: Two-Way Optical Link Budget, ISM Dust/Gas Extinction & Quantum Channel Capacity
- PROJECT.md § Interface Contracts
"""

import math
from typing import Dict, Any, Optional, Tuple, Union

from .capacity import g_holevo, holevo_capacity_bps, photon_information_efficiency

# Fundamental Constants (SI)
C_LIGHT: float = 299792458.0          # Speed of light in vacuum (m/s)
H_PLANCK: float = 6.62607015e-34      # Planck constant (J s)
K_BOLTZMANN: float = 1.380649e-23     # Boltzmann constant (J/K)
SIGMA_DUST_REF: float = 2.3e-30       # Reference dust cross-section per H nucleon at 1064 nm (m^2 / H)
LAMBDA_REF: float = 1064.0e-9         # Reference Nd:YAG wavelength (m)
DUST_INDEX: float = 1.7               # Rayleigh-Mie power-law index


def transmitter_gain(D_tx: float, lambda_tx: float, eta_tx: float = 1.0) -> float:
    """
    Computes transmitter aperture directive gain: G_tx = (pi * D_tx / lambda_tx)^2 * eta_tx.
    """
    if D_tx <= 0.0 or lambda_tx <= 0.0:
        raise ValueError("Aperture diameter and wavelength must be positive")
    return ((math.pi * D_tx / lambda_tx) ** 2) * eta_tx


def retroreflector_rcs(
    D_refl: float,
    lambda_rx: float,
    R_mirror: float = 0.999,
    eta_refl: float = 1.0
) -> float:
    """
    Computes the optical radar cross section (RCS) of the retroreflector:
    sigma_RCS = (4 * pi * A_refl^2 / lambda_rx^2) * R_mirror * eta_refl
              = (pi^3 * D_refl^4 / (4 * lambda_rx^2)) * R_mirror * eta_refl
    """
    if D_refl <= 0.0 or lambda_rx <= 0.0:
        raise ValueError("Reflector diameter and wavelength must be positive")
    A_refl = math.pi * ((D_refl / 2.0) ** 2)
    return (4.0 * math.pi * (A_refl ** 2) / (lambda_rx ** 2)) * R_mirror * eta_refl


def two_way_geometric_transfer(
    x_refl: float,
    D2: float,
    D_tx: float,
    D_refl: float,
    D_rx: float,
    lambda_tx: float,
    R_mirror: float = 0.999,
    eta_opt: float = 0.6
) -> float:
    """
    Computes unified near-field to far-field two-way geometric power transfer ratio P_rx_geom / P_tx.

    Uses Lorentzian spatial-mode coupling to ensure smooth, non-singular behavior from d=0
    to the deep-space far field:
    P_rx / P_tx = R_mirror * eta_opt * [1 + (lambda_tx * d / sqrt(A_tx * A_refl))^2]^(-1)
                                     * [1 + (lambda_rx * d / sqrt(A_refl * A_rx))^2]^(-1)

    In the far field (d >> d_Rayleigh):
    P_rx / P_tx -> R_mirror * eta_opt * (A_tx * A_refl^2 * A_rx / (lambda_tx^4 * d^4)) * D_2^2
    """
    if x_refl < 0.0:
        raise ValueError(f"Range x_refl must be non-negative, got {x_refl}")
    if D2 <= 0.0:
        return 0.0
        
    lambda_rx = lambda_tx / D2
    A_tx = math.pi * ((D_tx / 2.0) ** 2)
    A_refl = math.pi * ((D_refl / 2.0) ** 2)
    A_rx = math.pi * ((D_rx / 2.0) ** 2)
    
    # Mode-coupling geometric terms
    w_forward = math.sqrt(A_tx * A_refl)
    w_return = math.sqrt(A_refl * A_rx)
    
    term1 = 1.0 / (1.0 + ((lambda_tx * x_refl) / w_forward) ** 2)
    term2 = 1.0 / (1.0 + ((lambda_rx * x_refl) / w_return) ** 2)
    
    return R_mirror * eta_opt * term1 * term2


def beer_lambert_dust_extinction(
    x_refl: float,
    D2: float,
    lambda_tx: float = LAMBDA_REF,
    n_H: float = 1.0e5,
    sigma_0: float = SIGMA_DUST_REF,
    alpha_dust: float = DUST_INDEX
) -> float:
    """
    Computes the two-way interstellar dust and gas transmittance via the Beer-Lambert law:
    T_ISM = exp( - tau_ext )
    tau_ext = n_H * x_refl * [ sigma_dust(lambda_tx) + sigma_dust(lambda_rx) ]

    Because lambda_rx = lambda_tx / D_2 > lambda_tx, the return path experiences
    reduced dust extinction compared to the outbound path.
    """
    if x_refl <= 0.0 or n_H <= 0.0:
        return 1.0
    if D2 <= 0.0:
        return 0.0
        
    lambda_rx = lambda_tx / D2
    
    # Rayleigh-Mie power-law extinction cross section
    sigma_tx = sigma_0 * ((LAMBDA_REF / lambda_tx) ** alpha_dust)
    sigma_rx = sigma_0 * ((LAMBDA_REF / lambda_rx) ** alpha_dust)
    
    tau_ext = n_H * x_refl * (sigma_tx + sigma_rx)
    return math.exp(-tau_ext)


def compute_background_noise(
    lambda_rx: float,
    D_rx: float,
    B_opt: float,
    delta_lambda_filter: float = 1.0e-9,
    I_zodi: float = 1.0e-5,
    I_star: float = 1.0e-6,
    T_cmb: float = 2.7255,
    eta_rx: float = 0.8
) -> Dict[str, float]:
    """
    Computes celestial and thermal background noise collected within the receiver aperture.

    Parameters:
    -----------
    lambda_rx : float
        Received carrier wavelength in meters.
    D_rx : float
        Receiver aperture diameter in meters.
    B_opt : float
        Optical detection bandwidth in Hz.
    delta_lambda_filter : float
        Optical bandpass filter width in meters (default 1 nm).
    I_zodi : float
        Zodiacal dust spectral radiance (W / (m^2 sr m)).
    I_star : float
        Integrated starlight spectral radiance (W / (m^2 sr m)).
    T_cmb : float
        Cosmic microwave background temperature in Kelvin (2.7255 K).
    eta_rx : float
        Receiver optical transmission efficiency.

    Returns:
    --------
    dict
        { P_noise, N_noise, N_noise_sky, N_noise_cmb }
    """
    if lambda_rx <= 0.0 or D_rx <= 0.0 or B_opt <= 0.0:
        return {'P_noise': 0.0, 'N_noise': 0.0, 'N_noise_sky': 0.0, 'N_noise_cmb': 0.0}
        
    f_rx = C_LIGHT / lambda_rx
    A_rx = math.pi * ((D_rx / 2.0) ** 2)
    
    # Receiver diffraction field of view
    theta_fov = 1.22 * lambda_rx / D_rx
    omega_fov = (math.pi / 4.0) * (theta_fov ** 2)
    
    # Sky background noise power (W)
    P_sky = (I_zodi + I_star) * A_rx * omega_fov * delta_lambda_filter * eta_rx
    N_noise_sky = P_sky / (H_PLANCK * f_rx * B_opt) if (f_rx * B_opt > 0) else 0.0
    
    # Blackbody thermal occupancy (Planck law)
    exp_arg = (H_PLANCK * f_rx) / (K_BOLTZMANN * T_cmb)
    if exp_arg > 700.0:
        N_noise_cmb = 0.0
    else:
        N_noise_cmb = 1.0 / (math.exp(exp_arg) - 1.0)
        
    N_noise_total = N_noise_sky + N_noise_cmb
    P_noise_total = N_noise_total * H_PLANCK * f_rx * B_opt
    
    return {
        'P_noise': P_noise_total,
        'N_noise': N_noise_total,
        'N_noise_sky': N_noise_sky,
        'N_noise_cmb': N_noise_cmb,
    }


def compute_link_budget(
    params: Optional[Dict[str, Any]] = None,
    x_refl: Optional[float] = None,
    D2: Optional[float] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Unified public interface for two-way link budget, ISM extinction, and Holevo capacity.
    Conforms to PROJECT.md interface contract:
    compute_link_budget(params, x_refl, D2)

    Parameters:
    -----------
    params : dict, optional
        Contains:
        - P_tx : float (Transmitter laser power in W, default 100 GW = 1e11)
        - D_tx : float (Transmitter aperture diameter in m, default 1000.0)
        - D_refl : float (Retroreflector aperture diameter in m, default 4.0)
        - D_rx : float (Receiver aperture diameter in m, default 100.0)
        - lambda_0 : float (Transmitter optical wavelength in m, default 1064 nm)
        - n_H : float (ISM neutral hydrogen density in m^-3, default 1e5 = 0.1 cm^-3)
        - B_opt : float, optional (Channel bandwidth in Hz, default 1 GHz = 1e9)
        - eta_opt : float, optional (System optical efficiency, default 0.6)
        - R_mirror : float, optional (Mirror reflectance, default 0.999)
        - N_noise : float, optional (Receiver noise photon occupancy, default 1e-4)
    x_refl : float, optional
        Spacecraft distance at reflection event in meters (overrides params).
    D2 : float, optional
        Two-way Doppler factor (overrides params).

    Returns:
    --------
    dict
        { eta_geom, eta_dust, eta_rel, P_rx, photon_flux_rx, C_holevo_bps, bits_per_photon, ... }
    """
    cfg = {}
    if params is not None and isinstance(params, dict):
        cfg.update(params)
    cfg.update(kwargs)
    
    # Extract parameters
    P_tx = float(cfg['P_tx']) if ('P_tx' in cfg and cfg['P_tx'] is not None) else 1.0e11
    D_tx = float(cfg.get('D_tx', 1000.0))
    D_refl = float(cfg.get('D_refl', 4.0))
    D_rx = float(cfg.get('D_rx', 100.0))
    lambda_0 = float(cfg.get('lambda_0', cfg.get('lambda_tx', LAMBDA_REF)))
    n_H = float(cfg.get('n_H', 1.0e5))
    B_opt = float(cfg.get('B_opt', cfg.get('B_hz', 1.0e9)))
    eta_opt = float(cfg.get('eta_opt', 0.6))
    R_mirror = float(cfg.get('R_mirror', 0.999))
    noise_param = cfg.get('N_noise', None)
    
    # Extract reflection distance and Doppler factor
    dist = x_refl if x_refl is not None else float(cfg.get('x_refl', 0.0))
    d2_val = D2 if D2 is not None else float(cfg.get('D2', 1.0))
    
    if dist < 0.0:
        raise ValueError(f"Range x_refl must be non-negative, got {dist}")
        
    # Relativistic energy scaling factor
    eta_rel = d2_val ** 2 if d2_val > 0.0 else 0.0
    
    # Geometric power transfer
    eta_geom = two_way_geometric_transfer(
        x_refl=dist,
        D2=d2_val,
        D_tx=D_tx,
        D_refl=D_refl,
        D_rx=D_rx,
        lambda_tx=lambda_0,
        R_mirror=R_mirror,
        eta_opt=eta_opt
    )
    
    # ISM extinction
    eta_dust = beer_lambert_dust_extinction(
        x_refl=dist,
        D2=d2_val,
        lambda_tx=lambda_0,
        n_H=n_H
    )
    
    # Total received power (W)
    P_rx = P_tx * eta_geom * eta_dust
    
    # Optical frequencies and wavelengths
    f_tx = C_LIGHT / lambda_0
    f_rx = f_tx * d2_val
    lambda_rx = lambda_0 / d2_val if d2_val > 0.0 else float('inf')
    
    # Energy per received photon
    E_rx_photon = H_PLANCK * f_rx if f_rx > 0.0 else 1.0
    
    # Received photon flux (photons/s)
    photon_flux_rx = P_rx / E_rx_photon if E_rx_photon > 0.0 else 0.0
    
    # Mean signal photons per mode
    N_sig = photon_flux_rx / B_opt if B_opt > 0.0 else 0.0
    
    # Background noise photons per mode
    if noise_param is not None:
        N_noise = float(noise_param)
    else:
        bg = compute_background_noise(lambda_rx=lambda_rx, D_rx=D_rx, B_opt=B_opt)
        N_noise = max(bg['N_noise'], 1.0e-4)
        
    # Gordon-Holevo channel capacity
    C_holevo_bps = holevo_capacity_bps(N_sig=N_sig, B_opt=B_opt, N_noise=N_noise)
    bits_per_photon = photon_information_efficiency(N_sig=N_sig, N_noise=N_noise)
    
    return {
        'eta_geom': eta_geom,
        'eta_dust': eta_dust,
        'eta_rel': eta_rel,
        'P_rx': P_rx,
        'photon_flux_rx': photon_flux_rx,
        'N_sig': N_sig,
        'N_noise': N_noise,
        'C_holevo_bps': C_holevo_bps,
        'bits_per_photon': bits_per_photon,
        'lambda_rx': lambda_rx,
        'f_rx': f_rx,
        'P_tx': P_tx,
        'x_refl': dist,
        'D2': d2_val,
    }
