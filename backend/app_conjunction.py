"""
app_conjunction.py
FastAPI backend for Conjunction Probability Visualiser.
Wires pc_calculator.py and covariance_prop.py to REST endpoints.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'math'))

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

from pc_calculator import compute_pc, compute_pc_vs_time
from covariance_prop import (
    propagate_state_and_stm, propagate_covariance,
    extract_position_covariance, get_covariance_ellipsoid_axes,
    find_closest_approach
)

app = FastAPI(title="Pc Visualiser API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

MU = 3.986004418e14  # m³/s²

def keplerian_to_cartesian(a, e, inc, raan, argp, nu):
    """Convert orbital elements to Cartesian state [m, m/s]."""
    inc  = np.radians(inc)
    raan = np.radians(raan)
    argp = np.radians(argp)
    nu   = np.radians(nu)

    p = a * (1 - e**2)
    r = p / (1 + e * np.cos(nu))

    # PQW frame
    r_pqw = np.array([r * np.cos(nu), r * np.sin(nu), 0.0])
    v_pqw = np.sqrt(MU / p) * np.array([-np.sin(nu), e + np.cos(nu), 0.0])

    # Rotation matrix PQW → ECI
    cO, sO = np.cos(raan), np.sin(raan)
    ci, si = np.cos(inc),  np.sin(inc)
    co, so = np.cos(argp), np.sin(argp)

    R = np.array([
        [cO*co - sO*so*ci,  -cO*so - sO*co*ci,  sO*si],
        [sO*co + cO*so*ci,  -sO*so + cO*co*ci, -cO*si],
        [so*si,              co*si,              ci   ],
    ])

    return np.concatenate([R @ r_pqw, R @ v_pqw])


class ObjInput(BaseModel):
    a: float; e: float; inc: float; raan: float; argp: float; nu: float
    radius: float
    cov: List[float]  # 36 elements, row-major 6×6

class ConjunctionInput(BaseModel):
    obj1: ObjInput
    obj2: ObjInput
    t_start: float = -300.0
    t_end:   float =  300.0


@app.post("/conjunction")
def run_conjunction(inp: ConjunctionInput):
    try:
        # Convert to Cartesian
        s1 = keplerian_to_cartesian(inp.obj1.a, inp.obj1.e, inp.obj1.inc,
                                     inp.obj1.raan, inp.obj1.argp, inp.obj1.nu)
        s2 = keplerian_to_cartesian(inp.obj2.a, inp.obj2.e, inp.obj2.inc,
                                     inp.obj2.raan, inp.obj2.argp, inp.obj2.nu)

        C1_full = np.array(inp.obj1.cov).reshape(6, 6)
        C2_full = np.array(inp.obj2.cov).reshape(6, 6)

        # Find TCA
        t_TCA, miss_m, rel_pos_TCA, rel_vel_TCA, t_grid = find_closest_approach(
            s1, s2, inp.t_start, inp.t_end)

        # Propagate covariances to TCA
        _, stm1, _ = propagate_state_and_stm(s1, (0.0, t_TCA))
        _, stm2, _ = propagate_state_and_stm(s2, (0.0, t_TCA))
        C1_tca = propagate_covariance(C1_full, stm1)
        C2_tca = propagate_covariance(C2_full, stm2)
        C1_pos = extract_position_covariance(C1_tca)
        C2_pos = extract_position_covariance(C2_tca)

        # Compute Pc
        result = compute_pc(
            rel_pos_TCA, rel_vel_TCA,
            C1_pos, C2_pos,
            inp.obj1.radius, inp.obj2.radius,
        )

        # Pc vs time curve (for animation)
        C_combined = C1_pos + C2_pos
        t_arr, pc_arr = compute_pc_vs_time(
            rel_pos_TCA, rel_vel_TCA, C_combined,
            inp.obj1.radius + inp.obj2.radius,
            t_window=abs(inp.t_end - inp.t_start) / 2,
            n_points=120,
        )

        # Trajectory for 3D animation (coarse — 60 points)
        n_traj = 60
        t_traj = np.linspace(inp.t_start, inp.t_end, n_traj)
        r1_traj, r2_traj = [], []
        for t in t_traj:
            sf1, _, _ = propagate_state_and_stm(s1, (0.0, float(t)))
            sf2, _, _ = propagate_state_and_stm(s2, (0.0, float(t)))
            r1_traj.append(sf1[:3].tolist())
            r2_traj.append(sf2[:3].tolist())

        # Ellipsoid axes for 3D rendering
        axes1, dirs1 = get_covariance_ellipsoid_axes(C1_pos)
        axes2, dirs2 = get_covariance_ellipsoid_axes(C2_pos)

        return {
            "final_pc":       result["final_pc"],
            "final_method":   result["final_method"],
            "risk_color":     result["risk_color"],
            "risk_desc":      result["risk_desc"],
            "miss_distance_m": result["miss_distance_m"],
            "rel_speed_ms":   result["rel_speed_ms"],
            "r_HBR":          result["r_HBR"],
            "sigma_x":        float(result["primary"]["sigma_x"]),
            "sigma_y":        float(result["primary"]["sigma_y"]),
            "offset_test":    result["offset_test"],
            "monte_carlo":    result["monte_carlo"],
            "t_TCA_offset":   float(t_TCA),
            "pc_timeline":    { "t": t_arr.tolist(), "pc": pc_arr.tolist() },
            "trajectory":     { "t": t_traj.tolist(), "r1": r1_traj, "r2": r2_traj },
            "ellipsoids": {
                "semi_axes_1":  axes1.tolist(),
                "directions_1": dirs1.tolist(),
                "semi_axes_2":  axes2.tolist(),
                "directions_2": dirs2.tolist(),
            },
        }

    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))


@app.get("/health")
def health():
    return {"status": "ok"}
