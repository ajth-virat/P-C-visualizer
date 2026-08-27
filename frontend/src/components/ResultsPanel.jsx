import { motion } from 'framer-motion'

const fmt = (v, digits=4) => v !== undefined && v !== null
  ? v.toExponential(digits)
  : '—'

const fmtM = v => v !== undefined ? `${(v/1000).toFixed(3)} km` : '—'
const fmtS = v => v !== undefined ? `${v.toFixed(1)} s` : '—'
const fmtKms = v => v !== undefined ? `${(v/1000).toFixed(3)} km/s` : '—'

function RiskBadge({ color, desc }) {
  const c = color === 'GREEN' ? 'var(--green)'
          : color === 'YELLOW' ? 'var(--yellow)'
          : 'var(--red)'
  return (
    <div style={{ border: `1px solid ${c}`, borderRadius: 2, padding: '8px 12px', marginBottom: 16 }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:16, color:c, letterSpacing:'0.1em' }}>
        ● {color}
      </div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-dim)', marginTop:4 }}>
        {desc}
      </div>
    </div>
  )
}

function Row({ label, value, accent }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline',
      padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-dim)', letterSpacing:'0.05em' }}>
        {label}
      </span>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:12,
        color: accent || 'var(--text-mono)' }}>
        {value}
      </span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.2em',
        color:'var(--text-dim)', marginBottom:8, paddingBottom:4, borderBottom:'1px solid var(--border)' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function ResultsPanel({ result, loading, error, playing, onPlayToggle }) {
  if (loading) return (
    <div style={styles.center}>
      <motion.div
        animate={{ opacity:[0.3,1,0.3] }}
        transition={{ duration:1.5, repeat:Infinity }}
        style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--accent)', letterSpacing:'0.15em' }}
      >
        COMPUTING...
      </motion.div>
    </div>
  )

  if (error) return (
    <div style={{ ...styles.center, padding:20 }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--red)', textAlign:'center' }}>
        ERROR<br/>
        <span style={{ color:'var(--text-dim)', fontSize:10, marginTop:8, display:'block' }}>{error}</span>
      </div>
    </div>
  )

  if (!result) return null

  const pc = result.final_pc
  const pcColor = pc >= 1e-4 ? 'var(--red)' : pc >= 1e-5 ? 'var(--yellow)' : 'var(--green)'

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>RESULTS</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-dim)' }}>
          {result.final_method?.toUpperCase()}
        </span>
      </div>

      <div style={styles.body}>
        {/* Pc — hero number */}
        <div style={styles.pcHero}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-dim)',
            letterSpacing:'0.2em', marginBottom:6 }}>COLLISION PROBABILITY</div>
          <motion.div
            key={pc}
            initial={{ opacity:0, scale:0.9 }}
            animate={{ opacity:1, scale:1 }}
            style={{ fontFamily:'var(--font-mono)', fontSize:28, color:pcColor, letterSpacing:'-0.02em' }}
          >
            {pc.toExponential(4)}
          </motion.div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-dim)', marginTop:4 }}>
            1-in-{pc > 0 ? Math.round(1/pc).toLocaleString() : '∞'}
          </div>
        </div>

        <RiskBadge color={result.risk_color} desc={result.risk_desc} />

        <Section title="CLOSEST APPROACH">
          <Row label="MISS DISTANCE" value={fmtM(result.miss_distance_m)} />
          <Row label="REL. SPEED"    value={fmtKms(result.rel_speed_ms)} />
          <Row label="r_HBR"         value={fmtM(result.r_HBR)} />
        </Section>

        <Section title="ENCOUNTER GEOMETRY">
          <Row label="σ_x (enc plane)" value={`${(result.sigma_x/1000).toFixed(3)} km`} />
          <Row label="σ_y (enc plane)" value={`${(result.sigma_y/1000).toFixed(3)} km`} />
          <Row label="miss / σ_x"      value={(result.miss_distance_m / result.sigma_x).toFixed(2)} />
        </Section>

        {result.offset_test && (
          <Section title="VALIDITY CHECK">
            <Row
              label="SHORT-ENC. VALID"
              value={result.offset_test.valid ? 'YES' : 'NO — MC USED'}
              accent={result.offset_test.valid ? 'var(--green)' : 'var(--yellow)'}
            />
            <Row
              label="Pc VARIATION"
              value={`${(result.offset_test.max_variation * 100).toFixed(1)}%`}
            />
            {!result.offset_test.valid && (
              <p style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--yellow)',
                marginTop:8, lineHeight:1.6 }}>
                {result.offset_test.recommendation}
              </p>
            )}
          </Section>
        )}

        {result.monte_carlo && (
          <Section title="MONTE CARLO">
            <Row label="Pc (MC)"       value={fmt(result.monte_carlo.pc)} />
            <Row label="±1σ"           value={fmt(result.monte_carlo.pc_uncertainty)} />
            <Row label="HITS / N"      value={`${result.monte_carlo.n_hits} / ${result.monte_carlo.N.toLocaleString()}`} />
            {result.monte_carlo.warning && (
              <p style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--yellow)',
                marginTop:8, lineHeight:1.6 }}>
                {result.monte_carlo.warning}
              </p>
            )}
          </Section>
        )}

        {/* Play button */}
        <button
          style={{ ...styles.playBtn, borderColor: playing ? 'var(--accent)' : 'var(--border)' }}
          onClick={onPlayToggle}
        >
          {playing ? '⏸ PAUSE ANIMATION' : '▶ PLAY ANIMATION'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  panel: { display:'flex', flexDirection:'column', height:'100%' },
  header: {
    padding:'10px 16px', borderBottom:'1px solid var(--border)',
    display:'flex', justifyContent:'space-between', alignItems:'center',
  },
  title: { fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.2em', color:'var(--text-dim)' },
  body: { padding:16, flex:1, overflowY:'auto' },
  center: { height:'100%', display:'flex', alignItems:'center', justifyContent:'center' },
  pcHero: { marginBottom:16, paddingBottom:16, borderBottom:'1px solid var(--border)' },
  playBtn: {
    width:'100%', padding:'10px', background:'transparent',
    border:'1px solid var(--border)', color:'var(--text-mono)',
    fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.1em',
    borderRadius:2, marginTop:8, cursor:'pointer',
  },
}
