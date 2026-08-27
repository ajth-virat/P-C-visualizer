import { useRef, useEffect } from 'react'

const PC_GREEN  = 1e-5
const PC_YELLOW = 1e-4

export default function PcTimeline({ result, animT, onScrub, tStart, tEnd }) {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    canvas.width  = rect.width  || 800
    canvas.height = rect.height || 80

    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#080d18'
    ctx.fillRect(0, 0, W, H)

    // HARD GUARD — exit immediately if data not ready
    const t  = result && result.pc_timeline && result.pc_timeline.t
    const pc = result && result.pc_timeline && result.pc_timeline.pc
    if (!Array.isArray(t) || !Array.isArray(pc) || t.length === 0) return

    const tRange = tEnd - tStart
    const pcMax  = Math.max.apply(null, pc.concat([PC_YELLOW * 2]))

    const tx = v => ((v - tStart) / tRange) * (W - 40) + 20
    const ty = v => {
      const logMin = Math.log10(1e-12)
      const logMax = Math.log10(pcMax)
      const logV   = Math.log10(Math.max(v, 1e-12))
      return H - 24 - (logV - logMin) / (logMax - logMin) * (H - 40)
    }

    // Threshold lines
    [[PC_GREEN, '#00ff88', '1e-5'], [PC_YELLOW, '#ffd600', '1e-4']].forEach(function(item) {
      const val = item[0], col = item[1], lbl = item[2]
      const y = ty(val)
      if (y < 0 || y > H) return
      ctx.strokeStyle = col + '44'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = col + '99'
      ctx.font = '9px monospace'
      ctx.fillText(lbl, 24, y - 3)
    })

    // Area fill
    ctx.beginPath()
    ctx.moveTo(tx(t[0]), H - 24)
    for (var i = 0; i < t.length; i++) { ctx.lineTo(tx(t[i]), ty(pc[i])) }
    ctx.lineTo(tx(t[t.length - 1]), H - 24)
    ctx.closePath()
    ctx.fillStyle = '#00d4ff11'
    ctx.fill()

    // Curve
    ctx.beginPath()
    ctx.strokeStyle = '#00d4ff'
    ctx.lineWidth = 1.5
    for (var j = 0; j < t.length; j++) {
      j === 0 ? ctx.moveTo(tx(t[j]), ty(pc[j])) : ctx.lineTo(tx(t[j]), ty(pc[j]))
    }
    ctx.stroke()

    // Cursor
    if (animT !== null && animT !== undefined) {
      const cx = tx(animT)
      ctx.strokeStyle = '#ffffff66'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cx, 4); ctx.lineTo(cx, H - 20); ctx.stroke()
    }

    // Labels
    ctx.fillStyle = '#4a6080'
    ctx.font = '9px monospace'
    ctx.fillText(tStart + 's', 22, H - 6)
    ctx.fillText('0', tx(0) - 4, H - 6)
    ctx.fillText(tEnd + 's', W - 36, H - 6)

  }, [result, animT, tStart, tEnd])

  const handleClick = (e) => {
    if (!result) return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const frac = (e.clientX - rect.left - 20) / (rect.width - 40)
    onScrub(tStart + frac * (tEnd - tStart))
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span style={styles.label}>Pc vs TIME</span>
        <span style={styles.sublabel}>log scale · click to scrub</span>
      </div>
      <canvas ref={canvasRef} style={styles.canvas} onClick={handleClick} />
    </div>
  )
}

const styles = {
  wrap: { height:110, borderTop:'1px solid #1a2540', background:'#080d18', flexShrink:0 },
  header: { display:'flex', alignItems:'center', gap:12, padding:'4px 16px', borderBottom:'1px solid #1a2540' },
  label:    { fontFamily:'monospace', fontSize:9, letterSpacing:'0.2em', color:'#4a6080' },
  sublabel: { fontFamily:'monospace', fontSize:9, color:'#2a3f6a' },
  canvas:   { width:'100%', height:84, display:'block', cursor:'crosshair' },
}
