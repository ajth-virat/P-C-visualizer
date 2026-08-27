import { useState } from 'react'
import { motion } from 'framer-motion'

const FIELD_DEFS = [
  { key: 'a',    label: 'a',      unit: 'm',   tip: 'Semi-major axis' },
  { key: 'e',    label: 'e',      unit: '—',   tip: 'Eccentricity' },
  { key: 'inc',  label: 'i',      unit: 'deg', tip: 'Inclination' },
  { key: 'raan', label: 'Ω',      unit: 'deg', tip: 'RAAN' },
  { key: 'argp', label: 'ω',      unit: 'deg', tip: 'Arg. of perigee' },
  { key: 'nu',   label: 'ν',      unit: 'deg', tip: 'True anomaly' },
  { key: 'radius', label: 'r_obj', unit: 'm',  tip: 'Physical radius (HBR)' },
]

function ObjSection({ label, color, data, onChange }) {
  const [covOpen, setCovOpen] = useState(false)

  const handleField = (key, val) => {
    onChange({ ...data, [key]: parseFloat(val) || 0 })
  }

  const handleCovCell = (i, val) => {
    const c = [...data.cov]
    c[i] = parseFloat(val) || 0
    // Enforce symmetry
    const row = Math.floor(i / 6), col = i % 6
    if (row !== col) {
      c[col * 6 + row] = c[i]
    }
    onChange({ ...data, cov: c })
  }

  return (
    <div style={styles.section}>
      <div style={{ ...styles.sectionHeader, borderLeftColor: color }}>
        <span style={{ color }}>{label}</span>
      </div>

      <div style={styles.fields}>
        {FIELD_DEFS.map(f => (
          <div key={f.key} style={styles.fieldRow}>
            <label style={styles.label} title={f.tip}>
              {f.label}
            </label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                value={data[f.key]}
                onChange={e => handleField(f.key, e.target.value)}
                step={f.key === 'e' ? 0.0001 : f.key === 'a' ? 1000 : 0.01}
              />
              <span style={styles.unit}>{f.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Covariance toggle */}
      <button style={styles.covToggle} onClick={() => setCovOpen(o => !o)}>
        <span style={{ color: covOpen ? 'var(--accent)' : 'var(--text-dim)' }}>
          {covOpen ? '▾' : '▸'} COV 6×6
        </span>
      </button>

      {covOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          style={styles.covGrid}
        >
          <p style={styles.covHint}>Position-velocity covariance (6×6). Symmetric — edit upper triangle.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2 }}>
            {data.cov.map((v, i) => {
              const row = Math.floor(i / 6), col = i % 6
              const isLower = row > col
              return (
                <input
                  key={i}
                  type="number"
                  value={v}
                  disabled={isLower}
                  style={{
                    ...styles.covCell,
                    opacity: isLower ? 0.35 : 1,
                    background: isLower ? 'transparent' : 'var(--bg)',
                  }}
                  onChange={e => handleCovCell(i, e.target.value)}
                />
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default function InputPanel({ inputs, onChange, onRun, loading }) {
  const setObj = (key, val) => onChange({ ...inputs, [key]: val })

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <span style={styles.panelTitle}>INPUT</span>
      </div>

      <ObjSection
        label="OBJ-1"
        color="var(--obj1)"
        data={inputs.obj1}
        onChange={v => setObj('obj1', v)}
      />

      <ObjSection
        label="OBJ-2"
        color="var(--obj2)"
        data={inputs.obj2}
        onChange={v => setObj('obj2', v)}
      />

      {/* Time window */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={{ color: 'var(--text-dim)' }}>TIME WINDOW</span>
        </div>
        <div style={styles.fields}>
          {[['t_start', 'T start', 's'], ['t_end', 'T end', 's']].map(([k, lbl, unit]) => (
            <div key={k} style={styles.fieldRow}>
              <label style={styles.label}>{lbl}</label>
              <div style={styles.inputWrap}>
                <input
                  type="number"
                  value={inputs[k]}
                  step={30}
                  onChange={e => setObj(k, parseFloat(e.target.value))}
                />
                <span style={styles.unit}>{unit}</span>
              </div>
            </div>
          ))}
        </div>
        <p style={{ ...styles.covHint, marginTop: 4 }}>
          Relative to epoch (t=0). TCA will be found within window.
        </p>
      </div>

      {/* Run button */}
      <div style={styles.runWrap}>
        <motion.button
          style={styles.runBtn}
          onClick={onRun}
          disabled={loading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {loading ? (
            <span style={{ color: 'var(--text-dim)' }}>COMPUTING...</span>
          ) : (
            <span>▶ RUN ANALYSIS</span>
          )}
        </motion.button>
      </div>
    </div>
  )
}

const styles = {
  panel: { display: 'flex', flexDirection: 'column', minHeight: '100%' },
  panelHeader: {
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
  },
  panelTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: '0.2em',
    color: 'var(--text-dim)',
  },
  section: {
    borderBottom: '1px solid var(--border)',
    padding: '12px 0',
  },
  sectionHeader: {
    padding: '0 16px 8px',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    letterSpacing: '0.15em',
    borderLeft: '2px solid transparent',
    marginLeft: 14,
  },
  fields: { padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 },
  fieldRow: { display: 'flex', alignItems: 'center', gap: 8 },
  label: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--text-mono)',
    width: 36,
    flexShrink: 0,
    textAlign: 'right',
  },
  inputWrap: { flex: 1, position: 'relative', display: 'flex', alignItems: 'center' },
  unit: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-dim)',
    position: 'absolute',
    right: 8,
    pointerEvents: 'none',
  },
  covToggle: {
    background: 'none',
    padding: '6px 16px',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: '0.1em',
    color: 'var(--text-dim)',
    textAlign: 'left',
    width: '100%',
    cursor: 'pointer',
  },
  covGrid: { padding: '0 16px 8px' },
  covHint: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    color: 'var(--text-dim)',
    padding: '0 16px',
    marginBottom: 6,
    lineHeight: 1.5,
  },
  covCell: {
    padding: '3px 2px',
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    border: '1px solid var(--border)',
    color: 'var(--text-mono)',
    borderRadius: 1,
    textAlign: 'center',
  },
  runWrap: { padding: 16, marginTop: 'auto' },
  runBtn: {
    width: '100%',
    padding: '12px',
    background: 'var(--accent)',
    color: '#000',
    fontWeight: 600,
    letterSpacing: '0.1em',
    fontSize: 12,
    borderRadius: 2,
  },
}
