# Pc Visualiser — Conjunction Probability Tool

## Starting point
Given two orbiting objects with position/velocity uncertainty, this tool answers: **how likely are they to collide, and why?** It returns a probability of collision (Pc), a risk class, and a 3D view of the encounter.

## Introduction
Satellite operators receive conjunction warnings and must decide whether to manoeuvre. This project reproduces the standard analysis chain end to end: find the closest approach, propagate each object's uncertainty to that moment, reduce the 3D problem to the 2D encounter plane, and integrate the collision probability. A FastAPI backend exposes the pipeline, and a React/Three.js frontend renders the geometry, the covariance ellipsoids and a scrubbable Pc-vs-time chart.

**Status:** working prototype. The maths is checked by internal tests only; there is no external benchmark yet (see *Validation and known limitations*). Dynamics are two-body only.

**Stack:** Python (NumPy, SciPy), FastAPI, React, Three.js, Vite.

---

## Repository layout
```
/
├── math/                    # Core maths
│   ├── pc_calculator.py     # Pc methods, risk classes, validation
│   └── covariance_prop.py   # STM propagation, encounter-plane projection, TCA search
├── backend/
│   ├── app_conjunction.py   # FastAPI REST API
│   └── requirements.txt
└── frontend/                # React + Three.js
    └── src/components/      # Scene3D, InputPanel, ResultsPanel, PcTimeline, StatusBar
```

## How it works (the pipeline)

Starting point: every result comes from the same six steps, in this order.

1. **Elements to state.** Keplerian elements are converted to an inertial Cartesian state (`keplerian_to_cartesian`).
2. **Time of closest approach (TCA).** A 200-point coarse scan over the search window brackets the minimum separation. A bounded scalar minimiser then refines it to about 1 s (`find_closest_approach`).
3. **State transition matrix (STM).** The state and the 6x6 STM are integrated together as a 42-element ODE with RK45 (rtol 1e-10, atol 1e-12) from epoch to TCA (`propagate_state_and_stm`).
4. **Covariance propagation.** `P(TCA) = Φ P₀ Φᵀ`. The 3x3 position block is extracted for each object.
5. **Combine and project.** Position covariances are summed (`C = C1 + C2`) and projected onto the **encounter plane, which is perpendicular to the relative velocity at TCA**. The hard-body radius is the sum of both object radii.
6. **Pc.** Foster's method integrates the 2D Gaussian over the hard-body disc by polar-grid quadrature (200 x 200 points). A Monte Carlo estimator is available as a cross-check and fallback. The result is classified GREEN (Pc < 1e-5), YELLOW (< 1e-4) or RED (≥ 1e-4), using thresholds cited from NASA-STD-8719.14C.

Pitfalls the implementation is written to avoid: wrong encounter plane (position instead of relative velocity), passing covariances separately instead of combining them, sampling Monte Carlo around the wrong centre, using one object's radius instead of the sum, and assuming Pc falls monotonically with miss distance (covariance orientation matters).

## Running it

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app_conjunction:app --reload --port 8000
```
`app_conjunction.py` adds `../math` to the import path, so the maths files do not need to be copied.

```bash
# Frontend
cd frontend
npm install
npm run dev        # proxies /api to localhost:8000
```

## API

`GET /health` returns `{"status": "ok"}`.

`POST /conjunction` takes two objects and a search window.

| Field | Unit / format |
|---|---|
| `a` | metres |
| `e` | unitless |
| `inc`, `raan`, `argp`, `nu` | degrees |
| `radius` | metres |
| `cov` | 36 numbers, row-major 6x6, inertial frame, units m², m²/s, (m/s)² |
| `t_start`, `t_end` | seconds relative to the epoch of the given states (default -300 and +300) |

**Response fields:** `final_pc`, `final_method`, `risk_color`, `risk_desc`, `miss_distance_m`, `rel_speed_ms`, `r_HBR`, `sigma_x`, `sigma_y`, `offset_test`, `monte_carlo`, `t_TCA_offset`, `pc_timeline`, `trajectory`, `ellipsoids`.

**Example (verified run).** Two circular orbits that cross at the ascending node: 98 deg and 60 deg inclination, semi-major axes 7000.0 km and 7000.2 km, position variance 1e4 m² (100 m sigma) and velocity variance 1e-2 (m/s)² on the diagonal, radii 1 m and 2 m.

```python
cov = [([1e4]*3 + [1e-2]*3)[i] if i == j else 0.0 for i in range(6) for j in range(6)]
obj1 = dict(a=7000e3,   e=0.0, inc=98.0, raan=0.0, argp=0.0, nu=0.0, radius=1.0, cov=cov)
obj2 = dict(a=7000.2e3, e=0.0, inc=60.0, raan=0.0, argp=0.0, nu=0.0, radius=2.0, cov=cov)
# POST /conjunction {"obj1": obj1, "obj2": obj2, "t_start": -300, "t_end": 300}
```
Result: miss distance about 459 m, relative speed about 4.91 km/s, Pc about 8.3e-5 (YELLOW), method `foster`. The request takes about 3 s.

The API accepts elements plus a covariance as JSON. It does not ingest CDMs, TLEs or live catalogue data, so it is an integration point for such feeds, not an integration with them.

## Validation and known limitations

Starting point: the checks below prove the code is internally consistent, not that it matches published reference values. [Certain]

Introduction: what passes today, and what an external reviewer should know before trusting the numbers.

**What passes (run `python covariance_prop.py` and `python pc_calculator.py`):**
- STM is near identity for a tiny time step; specific energy is conserved over one orbit (relative error below 1e-8); the encounter-plane basis is orthogonal to the relative velocity.
- Zero-miss and large-miss limits, risk classification, hard-body-radius scaling, isotropic symmetry, and anisotropy behave as expected.
- Foster and Monte Carlo agree to about 13% on the built-in test case, inside the test's tolerance, and the gap has not been investigated further. [Likely]

**Known limitations:**
1. **No external benchmark.** The function named as literature validation runs first-principles consistency checks, not the published reference cases (Alfano 2005 Appendix B is charts, not tabulated rows, and the Serra et al. 2016 cases are not yet loaded). External validation is pending. [Certain]
2. **Two-body dynamics only.** No J2, drag, SRP or third-body terms in the propagation or the STM, so uncertainty growth is optimistic for LEO over longer windows. [Certain]
3. **The offset validity test is not yet effective.** It shifts the miss vector along the relative velocity with constant covariance, so the projected miss is unchanged and Pc is identical at every offset (variation about 1e-16). It cannot detect slow or co-orbiting encounters, and the Monte Carlo fallback is therefore not triggered by it. A proper test needs trajectories and covariance re-evaluated at the offset times. [Certain]
4. **Linear covariance propagation.** Valid for propagation to TCA within roughly one orbital period. The warning threshold is a fixed 5400 s, a LEO figure, so it is not meaningful for MEO or GEO. [Certain]
5. **Performance.** TCA search re-integrates the STM from epoch for every trial time, which is fine for a demo but slow for screening many pairs.

## References
- Foster & Estes (1992), NASA JSC-25898
- Akella & Alfriend (2000), *JGCD* 23(5)
- Hall (2019), AAS 19-632
- Tapley, Schutz & Born, *Statistical Orbit Determination*
- Vallado, *Fundamentals of Astrodynamics and Applications*
- NASA-STD-8719.14C (2021)
