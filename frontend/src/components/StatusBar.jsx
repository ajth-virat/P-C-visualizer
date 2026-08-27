export default function StatusBar({ loading, result, error }) {
  const now = new Date().toISOString().replace('T',' ').slice(0,19)
  return (
    <div style={styles.bar}>
      <span style={styles.item}>
        {error
          ? <span style={{color:'var(--red)'}}>● ERROR</span>
          : loading
          ? <span style={{color:'var(--accent)'}}>● COMPUTING</span>
          : result
          ? <span style={{color:'var(--green)'}}>● READY</span>
          : <span style={{color:'var(--text-dim)'}}>● IDLE</span>
        }
      </span>
      {result && (
        <>
          <span style={styles.sep}>|</span>
          <span style={styles.item}>METHOD: {result.final_method?.toUpperCase()}</span>
          <span style={styles.sep}>|</span>
          <span style={styles.item}>Pc = {result.final_pc?.toExponential(4)}</span>
        </>
      )}
      <span style={{marginLeft:'auto', ...styles.item, color:'var(--border-hi)'}}>{now} UTC</span>
    </div>
  )
}
const styles = {
  bar: {
    height: 24, display:'flex', alignItems:'center', gap:8,
    padding:'0 16px', borderTop:'1px solid var(--border)',
    background:'var(--bg)', flexShrink:0,
    fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-dim)',
    letterSpacing:'0.05em',
  },
  item: { fontSize:10 },
  sep: { color:'var(--border-hi)' },
}
