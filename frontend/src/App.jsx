import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Scene3D from './components/Scene3D.jsx'
import InputPanel from './components/InputPanel.jsx'
import ResultsPanel from './components/ResultsPanel.jsx'
import PcTimeline from './components/PcTimeline.jsx'
import StatusBar from './components/StatusBar.jsx'
import axios from 'axios'

const DEFAULT_STATE = {
  obj1: {
    // ISS-like LEO — orbital elements (a m, e, i deg, raan deg, argp deg, nu deg)
    a: 6778000, e: 0.0001, inc: 51.6, raan: 0, argp: 0, nu: 0,
    radius: 50,
    cov: [1e6,0,0,0,0,0,  0,1e6,0,0,0,0,  0,0,4e5,0,0,0,  0,0,0,1,0,0,  0,0,0,0,1,0,  0,0,0,0,0,1]
  },
  obj2: {
    a: 6778000, e: 0.001, inc: 51.65, raan: 0.05, argp: 0, nu: 180.2,
    radius: 5,
    cov: [4e6,0,0,0,0,0,  0,4e6,0,0,0,0,  0,0,2e6,0,0,0,  0,0,0,1,0,0,  0,0,0,0,1,0,  0,0,0,0,0,1]
  },
  t_start: -300,
  t_end:    300,
}

export default function App() {
  const [inputs, setInputs]     = useState(DEFAULT_STATE)
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [animT, setAnimT]       = useState(null)   // current animation time offset from TCA
  const [playing, setPlaying]   = useState(false)

  const runAnalysis = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setPlaying(false)
    setAnimT(null)
    try {
      const { data } = await axios.post('/api/conjunction', inputs)
      setResult(data)
      setAnimT(inputs.t_start)
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Backend error')
    } finally {
      setLoading(false)
    }
  }, [inputs])

  return (
    <div style={styles.root}>
      {/* Header */}
      <header style={styles.header}>
        <span style={styles.logo}>Pc<span style={{color:'var(--accent)'}}>.</span>vis</span>
        <span style={styles.subtitle}>CONJUNCTION ASSESSMENT VISUALISER</span>
        <div style={styles.headerRight}>
          <span style={{color:'var(--text-dim)', fontSize:11, fontFamily:'var(--font-mono)'}}>
            FOSTER METHOD · STM PROPAGATION
          </span>
        </div>
      </header>

      <div style={styles.body}>
        {/* Left: Input */}
        <aside style={styles.left}>
          <InputPanel
            inputs={inputs}
            onChange={setInputs}
            onRun={runAnalysis}
            loading={loading}
          />
        </aside>

        {/* Centre: 3D scene */}
        <main style={styles.centre}>
          <Scene3D
            result={result}
            inputs={inputs}
            animT={animT}
            playing={playing}
            onAnimT={setAnimT}
            onPlayingChange={setPlaying}
          />
          <PcTimeline
            result={result}
            animT={animT}
            onScrub={setAnimT}
            tStart={inputs.t_start}
            tEnd={inputs.t_end}
          />
        </main>

        {/* Right: Results */}
        <aside style={styles.right}>
          <AnimatePresence mode="wait">
            {(result || loading || error) && (
              <motion.div
                key="results"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                style={{ height: '100%' }}
              >
                <ResultsPanel
                  result={result}
                  loading={loading}
                  error={error}
                  playing={playing}
                  onPlayToggle={() => setPlaying(p => !p)}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {!result && !loading && !error && (
            <div style={styles.placeholder}>
              <div style={styles.placeholderIcon}>⬡</div>
              <p>Configure objects and run analysis</p>
            </div>
          )}
        </aside>
      </div>

      <StatusBar loading={loading} result={result} error={error} />
    </div>
  )
}

const styles = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    flexShrink: 0,
  },
  logo: {
    fontFamily: 'var(--font-mono)',
    fontSize: 22,
    fontWeight: 400,
    color: 'var(--text)',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-dim)',
    letterSpacing: '0.2em',
  },
  headerRight: {
    marginLeft: 'auto',
  },
  body: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '280px 1fr 280px',
    overflow: 'hidden',
  },
  left: {
    borderRight: '1px solid var(--border)',
    overflowY: 'auto',
    background: 'var(--surface)',
  },
  centre: {
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  },
  right: {
    borderLeft: '1px solid var(--border)',
    overflowY: 'auto',
    background: 'var(--surface)',
  },
  placeholder: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    letterSpacing: '0.05em',
    textAlign: 'center',
    padding: 20,
  },
  placeholderIcon: {
    fontSize: 32,
    opacity: 0.3,
  },
}
