"""
Relativistic Optical Delay-Line Data Storage: Physics Core Engine Package.

Provides reference Python implementations of:
- Hyperbolic and piecewise relativistic kinematics & retarded-time solvers
- Two-way Doppler factor, acceleration chirp rate, and time-integrated bit conservation
- Moving retroreflector electrodynamics, velocity aberration, and dihedral compensation
- Two-way geometric diffraction link budget and Beer-Lambert ISM dust extinction
- Gordon-Holevo bosonic quantum channel capacity and in-flight storage integrals
"""

from .kinematics import (
    C_LIGHT,
    G_ACCEL,
    RindlerHorizonError,
    rindler_horizon_time,
    rindler_scale_length,
    hyperbolic_position,
    hyperbolic_velocity,
    hyperbolic_beta,
    hyperbolic_gamma,
    hyperbolic_proper_time,
    hyperbolic_coord_time_from_proper,
    solve_hyperbolic_reflection,
    parse_piecewise_parameters,
    solve_piecewise_reflection,
    reception_to_transmission_time,
    compute_kinematics,
)

from .optics import (
    ARCSEC_PER_RAD,
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
)

from .link_budget import (
    H_PLANCK,
    K_BOLTZMANN,
    SIGMA_DUST_REF,
    LAMBDA_REF,
    DUST_INDEX,
    transmitter_gain,
    retroreflector_rcs,
    two_way_geometric_transfer,
    beer_lambert_dust_extinction,
    compute_background_noise,
    compute_link_budget,
)

from .capacity import (
    g_holevo,
    holevo_capacity_per_mode,
    holevo_capacity_bps,
    photon_information_efficiency,
    shannon_capacity_bps,
    compute_stored_capacity,
    compute_capacity,
)

__all__ = [
    # Constants
    'C_LIGHT',
    'G_ACCEL',
    'H_PLANCK',
    'K_BOLTZMANN',
    'ARCSEC_PER_RAD',
    'SIGMA_DUST_REF',
    'LAMBDA_REF',
    'DUST_INDEX',
    # Exceptions
    'RindlerHorizonError',
    # Kinematics
    'rindler_horizon_time',
    'rindler_scale_length',
    'hyperbolic_position',
    'hyperbolic_velocity',
    'hyperbolic_beta',
    'hyperbolic_gamma',
    'hyperbolic_proper_time',
    'hyperbolic_coord_time_from_proper',
    'solve_hyperbolic_reflection',
    'parse_piecewise_parameters',
    'solve_piecewise_reflection',
    'reception_to_transmission_time',
    'compute_kinematics',
    # Optics
    'two_way_doppler_factor',
    'doppler_factor_from_transmission',
    'received_frequency',
    'received_wavelength',
    'optical_redshift',
    'frequency_chirp_rate',
    'symbol_duration_rx',
    'bit_rate_rx',
    'verify_bit_conservation',
    'compute_in_flight_bits',
    'lorentz_transform_wavevector',
    'compute_reflector_aberration',
    'compute_optics',
    # Link budget
    'transmitter_gain',
    'retroreflector_rcs',
    'two_way_geometric_transfer',
    'beer_lambert_dust_extinction',
    'compute_background_noise',
    'compute_link_budget',
    # Capacity
    'g_holevo',
    'holevo_capacity_per_mode',
    'holevo_capacity_bps',
    'photon_information_efficiency',
    'shannon_capacity_bps',
    'compute_stored_capacity',
    'compute_capacity',
]
