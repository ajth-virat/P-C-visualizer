# Pc Visualiser — Conjunction Assessment Tool

## Monorepo Structure
```
/
├── math/                    # Core math (pc_calculator.py, covariance_prop.py)
├── backend/                 # FastAPI REST API
│   ├── app_conjunction.py
│   └── requirements.txt
└── frontend/                # React + Three.js
    ├── src/
    │   ├── App.jsx
    │   ├── components/
    │   │   ├── Scene3D.jsx        # 3D orbital animation + ellipsoids
    │   │   ├── InputPanel.jsx     # Orbital elements + covariance input
    │   │   ├── ResultsPanel.jsx   # Pc, risk classification, metrics
    │   │   ├── PcTimeline.jsx     # Pc vs time canvas chart (scrubable)
    │   │   └── StatusBar.jsx
    │   └── index.css
    ├── index.html
    ├── package.json
    └── vite.config.js
```

## Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
# Copy math files into path or install as package
cp ../math/*.py .
uvicorn app_conjunction:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # proxies /api → localhost:8000
```

## Key Implementation Notes
- Foster's method (NASA CARA baseline) for Pc computation
- STM covariance propagation (Tapley/Schutz/Born)
- Offset validity test flags slow/co-orbiting failures → Monte Carlo fallback
- r_HBR = r_obj1 + r_obj2 (combined, not individual)
- Encounter plane always perpendicular to relative velocity at TCA
- 3D covariance ellipsoids from eigendecomposition of 3×3 position covariance

## Validation Status
- Internal: ALL PASS (see math/pc_calculator.py --run validation)
- External: Alfano (2005) Appendix B — PENDING (paywalled, no public tabulated form exists)
