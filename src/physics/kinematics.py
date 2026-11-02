"""
Relativistic Kinematics Engine for Optical Delay-Line Data Storage.

Derives and computes exact analytical closed-form reflection coordinates,
reception times, two-way retrieval delays, and Rindler causal horizon boundaries
for continuous hyperbolic motion and piecewise boost-plus-coast trajectories.

References:
- survey_physics_report.md §1: Relativistic Kinematics & Retarded-Time Delay
- PROJECT.md § Interface Contracts
"""

import math
from typing import Dict, Any, Optional, Tuple, Union

# Fundamental Physical Constants (SI)
C_LIGHT: float = 299792458.0  # Speed of light in vacuum (m/s)
G_ACCEL: float = 9.80665      # Standard Earth surface gravity (m/s^2)


class RindlerHorizonError(ValueError):
    """Raised when transmission coordinate time exceeds the spacecraft's Rindler event horizon."""
    pass


def rindler_horizon_time(alpha: float) -> float:
    """
    Computes characteristic Rindler horizon coordinate time T_h = c / alpha.

    Parameters:
    -----------
    alpha : float
        Proper acceleration in m/s^2 (must be > 0).

    Returns:
    --------
    float
        Horizon coordinate time in seconds.
    """
    if alpha <= 0.0:
        raise ValueError(f"Proper acceleration alpha must be positive, got {alpha}")
    return C_LIGHT / alpha


def rindler_scale_length(alpha: float) -> float:
    """
    Computes characteristic Rindler scale length X_0 = c^2 / alpha = c * T_h.

    Parameters:
    -----------
    alpha : float
        Proper acceleration in m/s^2 (must be > 0).

    Returns:
    --------
    float
        Characteristic length scale in meters.
    """
    if alpha <= 0.0:
        raise ValueError(f"Proper acceleration alpha must be positive, got {alpha}")
    return (C_LIGHT ** 2) / alpha


def hyperbolic_position(t: float, alpha: float) -> float:
    """
    Computes coordinate position x(t) under constant proper acceleration alpha.
    x(t) = (c^2 / alpha) * (sqrt(1 + (alpha * t / c)^2) - 1)

    Parameters:
    -----------
    t : float
        Coordinate time in seconds (t >= 0).
    alpha : float
        Proper acceleration in m/s^2.
    """
    if t < 0.0:
        raise ValueError(f"Coordinate time t must be non-negative, got {t}")
    Th = rindler_horizon_time(alpha)
    X0 = rindler_scale_length(alpha)
    s = t / Th
    return X0 * (math.sqrt(1.0 + s * s) - 1.0)


def hyperbolic_velocity(t: float, alpha: float) -> float:
    """
    Computes coordinate velocity v(t) = c * beta(t) under constant proper acceleration alpha.
    """
    return hyperbolic_beta(t, alpha) * C_LIGHT


def hyperbolic_beta(t: float, alpha: float) -> float:
    """
    Computes velocity ratio beta(t) = v(t) / c under constant proper acceleration alpha.
    beta(t) = (alpha * t / c) / sqrt(1 + (alpha * t / c)^2)
    """
    if t < 0.0:
        raise ValueError(f"Coordinate time t must be non-negative, got {t}")
    Th = rindler_horizon_time(alpha)
    s = t / Th
    return s / math.sqrt(1.0 + s * s)


def hyperbolic_gamma(t: float, alpha: float) -> float:
    """
    Computes Lorentz factor gamma(t) = 1 / sqrt(1 - beta^2) = sqrt(1 + (alpha * t / c)^2).
    """
    if t < 0.0:
        raise ValueError(f"Coordinate time t must be non-negative, got {t}")
    Th = rindler_horizon_time(alpha)
    s = t / Th
    return math.sqrt(1.0 + s * s)


def hyperbolic_proper_time(t: float, alpha: float) -> float:
    """
    Computes spacecraft proper time tau(t) from coordinate time t.
    tau(t) = (c / alpha) * arsinh(alpha * t / c)
    """
    if t < 0.0:
        raise ValueError(f"Coordinate time t must be non-negative, got {t}")
    Th = rindler_horizon_time(alpha)
    s = t / Th
    return Th * math.asinh(s)


def hyperbolic_coord_time_from_proper(tau: float, alpha: float) -> float:
    """
    Computes coordinate time t(tau) from spacecraft proper time tau.
    t(tau) = (c / alpha) * sinh(alpha * tau / c)
    """
    if tau < 0.0:
        raise ValueError(f"Proper time tau must be non-negative, got {tau}")
    Th = rindler_horizon_time(alpha)
    return Th * math.sinh(tau / Th)


def solve_hyperbolic_reflection(
    t_tx: float,
    alpha: float,
    strict: bool = False
) -> Dict[str, Any]:
    """
    Computes exact closed-form reflection event coordinates and retrieval timing
    for continuous hyperbolic motion under proper acceleration alpha.

    Exact closed forms:
    - Rindler horizon time: T_h = c / alpha
    - Normalized time: s = t_tx / T_h
    - Reflection time: t_refl = t_tx * (2*T_h - t_tx) / (2 * (T_h - t_tx))
    - Reflection position: x_refl = c * t_tx^2 / (2 * (T_h - t_tx))
    - Reception time: t_rx = T_h * t_tx / (T_h - t_tx) = t_tx / (1 - alpha * t_tx / c)
    - Retrieval delay: delta_t = t_rx - t_tx = t_tx^2 / (T_h - t_tx)
    - Doppler factor: D_2 = (1 - s)^2 = (1 - alpha * t_tx / c)^2

    Parameters:
    -----------
    t_tx : float
        Earth transmission coordinate time in seconds.
    alpha : float
        Proper acceleration in m/s^2.
    strict : bool
        If True, raises RindlerHorizonError when t_tx >= T_h.
        If False, returns horizon-cutoff indicator dict with infinite delays.

    Returns:
    --------
    dict
        Contains t_tx, t_refl, x_refl, t_rx, delta_t, beta_refl, gamma_refl,
        D2, horizon_cutoff, is_past_horizon, T_h, X_0.
    """
    if t_tx < 0.0:
        raise ValueError(f"Transmission time t_tx must be non-negative, got {t_tx}")
    
    Th = rindler_horizon_time(alpha)
    X0 = rindler_scale_length(alpha)
    
    if t_tx >= Th:
        if strict:
            raise RindlerHorizonError(
                f"Transmission time t_tx={t_tx:.4f}s meets or exceeds Rindler horizon "
                f"T_h={Th:.4f}s (t_tx >= c/alpha). Outbound light never catches the craft."
            )
        return {
            't_tx': t_tx,
            't_refl': float('inf'),
            'x_refl': float('inf'),
            't_rx': float('inf'),
            'delta_t': float('inf'),
            'beta_refl': 1.0,
            'gamma_refl': float('inf'),
            'D2': 0.0,
            'horizon_cutoff': True,
            'is_past_horizon': True,
            'T_h': Th,
            'X_0': X0,
        }
    
    s = t_tx / Th
    denom = 2.0 * (1.0 - s)
    t_refl = Th * (s * (2.0 - s)) / denom
    x_refl = C_LIGHT * (t_tx ** 2) / (2.0 * (Th - t_tx))
    t_rx = (Th * t_tx) / (Th - t_tx)
    delta_t = (t_tx ** 2) / (Th - t_tx)
    
    beta_refl = (s * (2.0 - s)) / (2.0 - 2.0 * s + s * s)
    gamma_refl = (2.0 - 2.0 * s + s * s) / denom
    D2 = (1.0 - s) ** 2
    
    return {
        't_tx': t_tx,
        't_refl': t_refl,
        'x_refl': x_refl,
        't_rx': t_rx,
        'delta_t': delta_t,
        'beta_refl': beta_refl,
        'gamma_refl': gamma_refl,
        'D2': D2,
        'horizon_cutoff': False,
        'is_past_horizon': False,
        'T_h': Th,
        'X_0': X0,
    }


def parse_piecewise_parameters(
    alpha: float,
    beta_coast: Optional[float] = None,
    t_burn: Optional[float] = None
) -> Tuple[float, float, float, float, float]:
    """
    Parses and unifies piecewise trajectory parameters into:
    (t1, x1, beta_coast, gamma_coast, t_tx_crit).

    Ensures C^1 continuity between boost and coast phases.
    """
    Th = rindler_horizon_time(alpha)
    X0 = rindler_scale_length(alpha)
    
    if beta_coast is not None and beta_coast > 0.0:
        if beta_coast >= 1.0:
            raise ValueError(f"Coast velocity fraction beta_coast must be < 1.0, got {beta_coast}")
        beta_c = float(beta_coast)
        gamma_c = 1.0 / math.sqrt(1.0 - beta_c * beta_c)
        t1 = Th * beta_c * gamma_c
    elif t_burn is not None and t_burn > 0.0:
        t1 = float(t_burn)
        s1 = t1 / Th
        gamma_c = math.sqrt(1.0 + s1 * s1)
        beta_c = s1 / gamma_c
    else:
        # Default fallback: relativistic coast at 0.2c
        beta_c = 0.2
        gamma_c = 1.0 / math.sqrt(1.0 - beta_c * beta_c)
        t1 = Th * beta_c * gamma_c
        
    x1 = X0 * (gamma_c - 1.0)
    # Critical transmission time where reflection occurs exactly at t_refl = t1
    # Derived from t_tx_crit = t1 - x1/c = Th * (1 - sqrt((1 - beta_c) / (1 + beta_c)))
    doppler_coast_sqrt = math.sqrt((1.0 - beta_c) / (1.0 + beta_c))
    t_tx_crit = Th * (1.0 - doppler_coast_sqrt)
    
    return t1, x1, beta_c, gamma_c, t_tx_crit


def solve_piecewise_reflection(
    t_tx: float,
    alpha: float,
    beta_coast: Optional[float] = None,
    t_burn: Optional[float] = None,
    strict: bool = False
) -> Dict[str, Any]:
    """
    Computes exact reflection event coordinates and retrieval timing
    for a piecewise boost-and-coast trajectory:
    - Phase 1: Boost phase with constant proper acceleration alpha up to burn shutoff t1.
    - Phase 2: Constant-velocity relativistic coasting at beta_coast.

    Guarantees C^1 smooth continuity of position and velocity across the boundary.

    Parameters:
    -----------
    t_tx : float
        Earth transmission coordinate time in seconds.
    alpha : float
        Proper acceleration during boost in m/s^2.
    beta_coast : float, optional
        Target cruise velocity v/c.
    t_burn : float, optional
        Burn duration coordinate time in seconds.
    strict : bool
        Passed for consistency (piecewise motion has no upload cutoff for t_tx > t_tx_crit).

    Returns:
    --------
    dict
        Kinematic results matching compute_kinematics interface.
    """
    if t_tx < 0.0:
        raise ValueError(f"Transmission time t_tx must be non-negative, got {t_tx}")
    
    Th = rindler_horizon_time(alpha)
    X0 = rindler_scale_length(alpha)
    t1, x1, beta_c, gamma_c, t_tx_crit = parse_piecewise_parameters(alpha, beta_coast, t_burn)
    
    if t_tx <= t_tx_crit:
        # Reflection occurs during the boost phase (t_refl <= t1)
        res = solve_hyperbolic_reflection(t_tx, alpha, strict=strict)
        res['t_burn'] = t1
        res['t_tx_crit'] = t_tx_crit
        res['beta_coast'] = beta_c
        res['phase'] = 'boost'
        return res
    
    # Reflection occurs during the coast phase (t_refl > t1)
    # x(t_refl) = x1 + beta_c * c * (t_refl - t1)
    # c * (t_refl - t_tx) = x(t_refl)
    # => (1 - beta_c) * t_refl = t_tx - Th * (1 - 1 / gamma_c)
    offset = Th * (1.0 - 1.0 / gamma_c)
    t_refl = (t_tx - offset) / (1.0 - beta_c)
    x_refl = C_LIGHT * (t_refl - t_tx)
    t_rx = 2.0 * t_refl - t_tx
    delta_t = t_rx - t_tx
    beta_refl = beta_c
    gamma_refl = gamma_c
    D2 = (1.0 - beta_c) / (1.0 + beta_c)
    
    return {
        't_tx': t_tx,
        't_refl': t_refl,
        'x_refl': x_refl,
        't_rx': t_rx,
        'delta_t': delta_t,
        'beta_refl': beta_refl,
        'gamma_refl': gamma_refl,
        'D2': D2,
        'horizon_cutoff': False,
        'is_past_horizon': False,
        'T_h': Th,
        'X_0': X0,
        't_burn': t1,
        't_tx_crit': t_tx_crit,
        'beta_coast': beta_c,
        'phase': 'coast',
    }


def reception_to_transmission_time(
    t_rx: float,
    alpha: float,
    trajectory_type: str = 'hyperbolic',
    beta_coast: Optional[float] = None,
    t_burn: Optional[float] = None
) -> float:
    """
    Inverse reception relation: computes the Earth transmission time t_tx*(t_rx)
    whose reflected wave arrives back at Earth at coordinate time t_rx.

    Exact analytical inverses:
    - Hyperbolic: t_tx* = (T_h * t_rx) / (T_h + t_rx) = t_rx / (1 + alpha * t_rx / c)
    - Piecewise:
        t_rx_crit = (T_h * t_tx_crit) / (T_h - t_tx_crit)
        if t_rx <= t_rx_crit: t_tx* = (T_h * t_rx) / (T_h + t_rx)
        if t_rx > t_rx_crit:  t_tx* = ((1 - beta_c) * t_rx + 2 * offset) / (1 + beta_c)
    """
    if t_rx < 0.0:
        raise ValueError(f"Reception time t_rx must be non-negative, got {t_rx}")
    
    Th = rindler_horizon_time(alpha)
    
    if trajectory_type == 'hyperbolic':
        return (Th * t_rx) / (Th + t_rx)
    
    # Piecewise
    t1, x1, beta_c, gamma_c, t_tx_crit = parse_piecewise_parameters(alpha, beta_coast, t_burn)
    t_rx_crit = (Th * t_tx_crit) / (Th - t_tx_crit)
    
    if t_rx <= t_rx_crit:
        return (Th * t_rx) / (Th + t_rx)
    
    offset = Th * (1.0 - 1.0 / gamma_c)
    return ((1.0 - beta_c) * t_rx + 2.0 * offset) / (1.0 + beta_c)


def compute_kinematics(
    params: Optional[Dict[str, Any]] = None,
    t_tx: Optional[float] = None,
    strict: bool = False,
    **kwargs
) -> Dict[str, Any]:
    """
    Unified public interface for relativistic kinematics conforming to PROJECT.md:
    compute_kinematics(params, t_tx)

    Parameters:
    -----------
    params : dict, optional
        Dictionary containing kinematics configuration:
        - alpha : float (m/s^2, default 1g = 9.80665)
        - trajectory_type : str ('hyperbolic' or 'piecewise')
        - beta_coast : float, optional (cruise velocity fraction)
        - t_burn : float, optional (burn duration coordinate time)
        - t_tx : float, optional (Earth transmission time in seconds)
    t_tx : float, optional
        Transmission time in seconds (overrides params['t_tx'] if supplied).
    strict : bool
        If True, raises RindlerHorizonError for t_tx >= T_h in hyperbolic mode.
    **kwargs:
        Additional keyword arguments supporting direct unpack calling.

    Returns:
    --------
    dict:
        { t_refl, x_refl, t_rx, delta_t, beta_refl, gamma_refl, D2, horizon_cutoff, is_past_horizon, ... }
    """
    cfg = {}
    if params is not None and isinstance(params, dict):
        cfg.update(params)
    cfg.update(kwargs)
    
    # Extract transmission time
    if t_tx is not None:
        tx_val = float(t_tx)
    elif 't_tx' in cfg:
        tx_val = float(cfg['t_tx'])
    else:
        tx_val = 0.0
        
    alpha = float(cfg.get('alpha', G_ACCEL))
    traj_type = cfg.get('trajectory_type', None)
    beta_coast = cfg.get('beta_coast', None)
    t_burn = cfg.get('t_burn', None)
    
    # Infer trajectory type if not explicitly set
    if traj_type is None:
        if beta_coast is not None or t_burn is not None:
            traj_type = 'piecewise'
        else:
            traj_type = 'hyperbolic'
            
    if traj_type == 'piecewise':
        return solve_piecewise_reflection(
            t_tx=tx_val,
            alpha=alpha,
            beta_coast=beta_coast,
            t_burn=t_burn,
            strict=strict
        )
    else:
        return solve_hyperbolic_reflection(
            t_tx=tx_val,
            alpha=alpha,
            strict=strict
        )
