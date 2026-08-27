"""
covariance_prop.py
------------------
Covariance propagation via State Transition Matrix (STM) for conjunction analysis.

Primary reference: Tapley, Schutz & Born — Statistical Orbit Determination, Ch. 4/5
Secondary: Vallado — Fundamentals of Astrodynamics and Applications, Ch. 9

Linear covariance propagation:
    P(t) = Φ(t, t₀) · P(t₀) · Φ(t, t₀)ᵀ

NOTE ON VALIDITY:
- STM is valid only when covariance remains small relative to orbital curvature.
- For propagation > ~1 orbital period, nonlinear stretching (banana shape) invalidates this.
- For LEO conjunction screening (propagation to TCA within one pass), linear is sufficient.
- This module flags when propagation window exceeds one orbital period.
"""

import numpy as np
from scipy.integrate import solve_ivp
from typing import Tuple

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────
MU_EARTH = 3.986004418e14  # m³/s²  [Certain]
SECONDS_PER_ORBIT_LEO = 5400.0  # ~90 min, used for validity warning [Certain]


# ─────────────────────────────────────────────────────────────────────────────
# Two-body EOM + STM variational equations
# ─────────────────────────────────────────────────────────────────────────────

def _two_body_stm_ode(t: float, y: np.ndarray, mu: float) -> np.ndarray:
    """
    Equations of motion for state + STM (6 + 36 = 42 elements).

    State vector layout:
        y[0:3]   = position [m]
        y[3:6]   = velocity [m/s]
        y[6:42]  = STM Φ flattened row-major (6×6)

    Φ̇ = A(t) · Φ
    where A is the Jacobian of the EOM w.r.t. state.
    """
    r_vec = y[0:3]
    v_vec = y[3:6]
    phi   = y[6:42].reshape(6, 6)

    r = np.linalg.norm(r_vec)
    r3 = r ** 3
    r5 = r ** 5

    # Acceleration
    a_vec = -mu / r3 * r_vec

    # Jacobian A (6×6)
    # ∂ṙ/∂r = 0,  ∂ṙ/∂v = I
    # ∂v̇/∂r = gravity gradient,  ∂v̇/∂v = 0
    A = np.zeros((6, 6))
    A[0:3, 3:6] = np.eye(3)
    # Gravity gradient tensor (upper-left 3×3 of lower-left block)
    for i in range(3):
        for j in range(3):
            A[3 + i, j] = 3 * mu * r_vec[i] * r_vec[j] / r5
            if i == j:
                A[3 + i, j] -= mu / r3

    phi_dot = A @ phi

    dydt = np.zeros(42)
    dydt[0:3] = v_vec
    dydt[3:6] = a_vec
    dydt[6:42] = phi_dot.flatten()

    return dydt


def propagate_state_and_stm(
    state0: np.ndarray,
    t_span: Tuple[float, float],
    mu: float = MU_EARTH,
    rtol: float = 1e-10,
    atol: float = 1e-12,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Propagate a Cartesian state and STM from t_span[0] to t_span[1].

    Parameters
    ----------
    state0 : ndarray, shape (6,)
        Initial state [x, y, z, vx, vy, vz] in meters and m/s.
    t_span : (t0, tf) in seconds
    mu : gravitational parameter [m³/s²]
    rtol, atol : RK45 tolerances

    Returns
    -------
    state_f : ndarray (6,)   — final Cartesian state
    stm     : ndarray (6,6)  — Φ(tf, t0)
    t_eval  : ndarray        — times at each integration step (for animation)

    Raises
    ------
    ValueError if propagation window exceeds one orbital period (warns, not hard fail).
    """
    dt = abs(t_span[1] - t_span[0])
    if dt > SECONDS_PER_ORBIT_LEO:
        import warnings
        warnings.warn(
            f"Propagation window {dt:.0f}s exceeds one LEO orbital period "
            f"({SECONDS_PER_ORBIT_LEO:.0f}s). Linear covariance propagation "
            "may be invalid — nonlinear banana-shape effects can dominate.",
            stacklevel=2,
        )

    # Initial STM = identity
    phi0 = np.eye(6).flatten()
    y0 = np.concatenate([state0, phi0])

    sol = solve_ivp(
        _two_body_stm_ode,
        t_span,
        y0,
        args=(mu,),
        method="RK45",
        rtol=rtol,
        atol=atol,
        dense_output=True,
    )

    if not sol.success:
        raise RuntimeError(f"STM integration failed: {sol.message}")

    state_f = sol.y[0:6, -1]
    stm     = sol.y[6:42, -1].reshape(6, 6)
    t_eval  = sol.t

    return state_f, stm, t_eval


def propagate_covariance(
    P0: np.ndarray,
    stm: np.ndarray,
) -> np.ndarray:
    """
    Propagate a 6×6 covariance via linear STM mapping.

        P(t) = Φ · P₀ · Φᵀ

    Parameters
    ----------
    P0  : (6,6) initial covariance [m², m²/s, (m/s)²]
    stm : (6,6) state transition matrix Φ(t, t₀)

    Returns
    -------
    P_f : (6,6) propagated covariance
    """
    return stm @ P0 @ stm.T


def extract_position_covariance(P: np.ndarray) -> np.ndarray:
    """
    Extract the 3×3 position-only block from a full 6×6 covariance.
    Top-left 3×3 block = position covariance [m²].
    """
    return P[0:3, 0:3]


def get_covariance_ellipsoid_axes(C3: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    Compute eigendecomposition of a 3×3 position covariance for 3D ellipsoid rendering.

    Returns
    -------
    semi_axes : (3,) 1-sigma semi-axis lengths [m]  (sqrt of eigenvalues)
    directions: (3,3) columns = unit eigenvectors (principal axes)
    """
    eigvals, eigvecs = np.linalg.eigh(C3)
    eigvals = np.maximum(eigvals, 0.0)  # numerical guard
    semi_axes = np.sqrt(eigvals)
    return semi_axes, eigvecs


# ─────────────────────────────────────────────────────────────────────────────
# Combined covariance for conjunction (Section I.2 of AI context doc)
# ─────────────────────────────────────────────────────────────────────────────

def combine_position_covariances(
    C1: np.ndarray,
    C2: np.ndarray,
) -> np.ndarray:
    """
    Combined position covariance for conjunction Pc computation.

        C_combined = C1 + C2  (in inertial frame)

    Both inputs must be 3×3 position covariance matrices.
    Anti-pattern avoided: do NOT pass each object's covariance separately to Pc calculator.
    """
    assert C1.shape == (3, 3), "C1 must be 3×3 position covariance"
    assert C2.shape == (3, 3), "C2 must be 3×3 position covariance"
    return C1 + C2


def project_covariance_to_encounter_plane(
    C_combined: np.ndarray,
    rel_vel: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Project 3×3 combined covariance into the 2D encounter (conjunction) plane.

    The encounter plane is ALWAYS perpendicular to the relative velocity vector at TCA.
    This is the most commonly misimplemented step.

        C_2D = P_enc @ C_combined @ P_enc.T

    where P_enc is the 2×3 projection matrix whose rows are the two basis vectors
    of the encounter plane.

    Parameters
    ----------
    C_combined : (3,3) combined position covariance in inertial frame [m²]
    rel_vel    : (3,) relative velocity vector at TCA [m/s]

    Returns
    -------
    C_2D     : (2,2) covariance in encounter plane
    P_enc    : (2,3) projection matrix (rows = encounter plane basis vectors)
    """
    # Unit vector along relative velocity (normal to encounter plane)
    v_hat = rel_vel / np.linalg.norm(rel_vel)

    # Build orthonormal basis for encounter plane
    # Choose a reference vector not parallel to v_hat
    ref = np.array([1.0, 0.0, 0.0])
    if abs(np.dot(v_hat, ref)) > 0.9:
        ref = np.array([0.0, 1.0, 0.0])

    # First basis vector: component of ref perpendicular to v_hat
    u1 = ref - np.dot(ref, v_hat) * v_hat
    u1 /= np.linalg.norm(u1)

    # Second basis vector: complete right-hand frame
    u2 = np.cross(v_hat, u1)
    u2 /= np.linalg.norm(u2)

    # 2×3 projection matrix
    P_enc = np.array([u1, u2])

    # Project covariance
    C_2D = P_enc @ C_combined @ P_enc.T

    return C_2D, P_enc


# ─────────────────────────────────────────────────────────────────────────────
# Closest approach search (Section VII of AI context doc)
# ─────────────────────────────────────────────────────────────────────────────

def find_closest_approach(
    state1: np.ndarray,
    state2: np.ndarray,
    t_start: float,
    t_end: float,
    mu: float = MU_EARTH,
    n_coarse: int = 200,
) -> Tuple[float, float, np.ndarray, np.ndarray, np.ndarray]:
    """
    Find Time of Closest Approach (TCA) and miss distance via Brent's method.

    Two-stage: coarse grid scan to bracket, then Brent refinement.
    Brent used (not gradient descent) because separation can have multiple local minima.

    Parameters
    ----------
    state1, state2 : (6,) Cartesian states at t=0
    t_start, t_end : search window [seconds]
    n_coarse       : number of coarse grid points for bracketing

    Returns
    -------
    t_TCA          : time of closest approach [s]
    miss_distance  : minimum separation [m]
    rel_pos_TCA    : relative position vector at TCA [m]
    rel_vel_TCA    : relative velocity vector at TCA [m/s]
    t_grid         : coarse time grid (for animation)
    """
    from scipy.optimize import minimize_scalar

    def _separation(t):
        r1, _, _ = propagate_state_and_stm(state1, (0.0, t), mu)
        r2, _, _ = propagate_state_and_stm(state2, (0.0, t), mu)
        return np.linalg.norm(r1[0:3] - r2[0:3])

    # Coarse scan to find bracket around global minimum
    t_grid = np.linspace(t_start, t_end, n_coarse)
    separations = np.array([_separation(t) for t in t_grid])
    idx_min = np.argmin(separations)

    # Bracket around coarse minimum
    t_lo = t_grid[max(0, idx_min - 1)]
    t_hi = t_grid[min(n_coarse - 1, idx_min + 1)]

    result = minimize_scalar(
        _separation,
        bounds=(t_lo, t_hi),
        method="bounded",
        options={"xatol": 1.0},  # 1-second TCA precision
    )

    t_TCA = result.x

    # States at TCA
    s1_tca, _, _ = propagate_state_and_stm(state1, (0.0, t_TCA), mu)
    s2_tca, _, _ = propagate_state_and_stm(state2, (0.0, t_TCA), mu)

    rel_pos_TCA = s1_tca[0:3] - s2_tca[0:3]
    rel_vel_TCA = s1_tca[3:6] - s2_tca[3:6]
    miss_distance = np.linalg.norm(rel_pos_TCA)

    return t_TCA, miss_distance, rel_pos_TCA, rel_vel_TCA, t_grid


# ─────────────────────────────────────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────────────────────────────────────

def validate_stm_identity(mu: float = MU_EARTH) -> bool:
    """
    Sanity check: propagate for dt→0, STM should be near identity.
    """
    r0 = np.array([7e6, 0.0, 0.0])      # 7000 km altitude
    v0 = np.array([0.0, np.sqrt(mu / 7e6), 0.0])
    state0 = np.concatenate([r0, v0])

    _, stm, _ = propagate_state_and_stm(state0, (0.0, 1e-3), mu)
    err = np.max(np.abs(stm - np.eye(6)))
    # At dt=1e-3s, A*dt ~ 1e-3 is the expected first-order deviation from I
    # Tolerance is set to 2e-3 (consistent with A·dt for orbital dynamics)
    passed = err < 2e-3
    print(f"[STM identity check] max deviation from I: {err:.2e} — {'PASS' if passed else 'FAIL'}")
    return passed


def validate_energy_conservation(mu: float = MU_EARTH, t_end: float = 5400.0) -> bool:
    """
    Propagate one full orbit and check specific energy conservation.
    """
    r0 = np.array([7e6, 0.0, 0.0])
    v0 = np.array([0.0, np.sqrt(mu / 7e6), 0.0])
    state0 = np.concatenate([r0, v0])

    E0 = 0.5 * np.dot(v0, v0) - mu / np.linalg.norm(r0)

    state_f, _, _ = propagate_state_and_stm(state0, (0.0, t_end), mu)
    Ef = 0.5 * np.dot(state_f[3:6], state_f[3:6]) - mu / np.linalg.norm(state_f[0:3])

    rel_err = abs((Ef - E0) / E0)
    passed = rel_err < 1e-8
    print(f"[Energy conservation] relative error: {rel_err:.2e} — {'PASS' if passed else 'FAIL'}")
    return passed


def validate_covariance_projection() -> bool:
    """
    Check that encounter plane projection produces a 2×2 positive-definite matrix
    and that the projection discards the velocity component (perpendicular to plane).
    """
    C_combined = np.diag([1e6, 4e6, 9e6])  # 1km, 2km, 3km sigma
    rel_vel = np.array([0.0, 0.0, 7500.0])  # along Z

    C_2D, P_enc = project_covariance_to_encounter_plane(C_combined, rel_vel)

    # Should be 2×2 positive definite
    eigvals = np.linalg.eigvalsh(C_2D)
    passed = np.all(eigvals > 0) and C_2D.shape == (2, 2)

    # P_enc rows should be orthogonal to rel_vel
    v_hat = rel_vel / np.linalg.norm(rel_vel)
    orth_err = max(abs(np.dot(P_enc[0], v_hat)), abs(np.dot(P_enc[1], v_hat)))
    passed = passed and orth_err < 1e-12

    print(f"[Covariance projection] 2D eigenvalues: {eigvals} — {'PASS' if passed else 'FAIL'}")
    print(f"[Covariance projection] orthogonality to rel_vel: {orth_err:.2e}")
    return passed


if __name__ == "__main__":
    print("=== covariance_prop.py validation ===\n")
    v1 = validate_stm_identity()
    v2 = validate_energy_conservation()
    v3 = validate_covariance_projection()
    all_pass = v1 and v2 and v3
    print(f"\nOverall: {'ALL PASS' if all_pass else 'FAILURES DETECTED'}")
    print("\nNOTE: STM accuracy against Alfano (2005) Appendix B test cases")
    print("requires external paper access. Run pc_calculator.py validation")
    print("when Alfano cases are available.")
