import { useRef, useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Line, Html } from '@react-three/drei'
import * as THREE from 'three'

// ─── Earth ────────────────────────────────────────────────────────────────────
function Earth() {
  return (
    <mesh>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial
        color="#0a1a3a"
        emissive="#0a1a3a"
        roughness={0.8}
        metalness={0.1}
        wireframe={false}
      />
    </mesh>
  )
}

// Grid ring around Earth equator
function EquatorGrid() {
  const points = useMemo(() => {
    const pts = []
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a) * 1.01, 0, Math.sin(a) * 1.01))
    }
    return pts
  }, [])
  return <Line points={points} color="#1a2540" lineWidth={0.5} />
}

// ─── Orbit trajectory (ellipse) ────────────────────────────────────────────────
function OrbitTrail({ sma, ecc, inc, raan, argp, color, opacity = 0.3 }) {
  const points = useMemo(() => {
    const pts = []
    const n = 256
    for (let i = 0; i <= n; i++) {
      const nu = (i / n) * Math.PI * 2
      // Radius in orbital plane
      const r = (sma * (1 - ecc * ecc)) / (1 + ecc * Math.cos(nu))
      const x_orb = r * Math.cos(nu)
      const y_orb = r * Math.sin(nu)

      // Rotate: argp, inc, raan (simplified 3-1-3 Euler)
      const cO = Math.cos(raan), sO = Math.sin(raan)
      const ci = Math.cos(inc),  si = Math.sin(inc)
      const co = Math.cos(argp), so = Math.sin(argp)

      const x = (cO * co - sO * so * ci) * x_orb + (-cO * so - sO * co * ci) * y_orb
      const y = (sO * co + cO * so * ci) * x_orb + (-sO * so + cO * co * ci) * y_orb
      const z = (so * si) * x_orb + (co * si) * y_orb

      pts.push(new THREE.Vector3(x, y, z))
    }
    return pts
  }, [sma, ecc, inc, raan, argp])

  return <Line points={points} color={color} lineWidth={0.8} transparent opacity={opacity} />
}

// ─── Covariance Ellipsoid ──────────────────────────────────────────────────────
function CovEllipsoid({ position, axes, directions, color, opacity }) {
  const meshRef = useRef()

  useEffect(() => {
    if (!meshRef.current) return
    // Apply eigendecomposition to scale+orient the unit sphere
    const mat = new THREE.Matrix4()
    // columns = eigenvectors (directions), diagonal = semi-axes
    const col0 = new THREE.Vector3(...directions[0]).multiplyScalar(axes[0])
    const col1 = new THREE.Vector3(...directions[1]).multiplyScalar(axes[1])
    const col2 = new THREE.Vector3(...directions[2]).multiplyScalar(axes[2])
    mat.makeBasis(col0, col1, col2)
    meshRef.current.setRotationFromMatrix(mat)
    meshRef.current.scale.set(1, 1, 1)
  }, [axes, directions])

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[1, 24, 24]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        wireframe={false}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

function CovEllipsoidWire({ position, axes, directions, color }) {
  const meshRef = useRef()
  useEffect(() => {
    if (!meshRef.current) return
    const mat = new THREE.Matrix4()
    const col0 = new THREE.Vector3(...directions[0]).multiplyScalar(axes[0])
    const col1 = new THREE.Vector3(...directions[1]).multiplyScalar(axes[1])
    const col2 = new THREE.Vector3(...directions[2]).multiplyScalar(axes[2])
    mat.makeBasis(col0, col1, col2)
    meshRef.current.setRotationFromMatrix(mat)
  }, [axes, directions])

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshStandardMaterial color={color} wireframe transparent opacity={0.4} />
    </mesh>
  )
}

// ─── Miss vector line ──────────────────────────────────────────────────────────
function MissVector({ pos1, pos2 }) {
  return (
    <Line
      points={[pos1, pos2]}
      color="#ffffff"
      lineWidth={1.5}
      transparent
      opacity={0.6}
      dashed
      dashSize={0.02}
      gapSize={0.01}
    />
  )
}

// ─── Satellite sphere ──────────────────────────────────────────────────────────
function Satellite({ position, color, label, radius }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[radius, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      {/* Glow */}
      <mesh>
        <sphereGeometry args={[radius * 2.5, 8, 8]} />
        <meshStandardMaterial color={color} transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <Html distanceFactor={8} position={[0, radius * 3, 0]}>
        <div style={{
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: 9,
          color: color,
          background: '#04060ccc',
          padding: '2px 6px',
          borderLeft: `2px solid ${color}`,
          whiteSpace: 'nowrap',
        }}>
          {label}
        </div>
      </Html>
    </group>
  )
}

// ─── Animated scene content ────────────────────────────────────────────────────
function SceneContent({ result, inputs, animT, playing, onAnimT, onPlayingChange }) {
  const EARTH_R = 6371000  // m
  const SCALE   = 1 / (EARTH_R * 1.5)  // scene units per metre

  // Interpolate satellite positions from result trajectory at animT
  const { pos1, pos2, ellipsoid1, ellipsoid2 } = useMemo(() => {
    if (!result || animT === null) return { pos1: null, pos2: null, ellipsoid1: null, ellipsoid2: null }

    const { trajectory } = result
    const times = trajectory.t

    // Find bracket
    let idx = 0
    for (let i = 0; i < times.length - 1; i++) {
      if (times[i] <= animT && animT <= times[i + 1]) { idx = i; break }
    }
    idx = Math.max(0, Math.min(idx, times.length - 2))
    const alpha = times[idx + 1] === times[idx] ? 0
      : (animT - times[idx]) / (times[idx + 1] - times[idx])

    const lerp = (a, b) => a + (b - a) * alpha

    const r1 = trajectory.r1[idx].map((v, i) => lerp(v, trajectory.r1[idx + 1][i]))
    const r2 = trajectory.r2[idx].map((v, i) => lerp(v, trajectory.r2[idx + 1][i]))

    // Scale to scene coords
    const toScene = r => [r[0] * SCALE, r[2] * SCALE, -r[1] * SCALE]  // y-up, z-toward viewer

    // Covariance ellipsoids from result (at TCA — simplified, could interpolate too)
    const { semi_axes_1, directions_1, semi_axes_2, directions_2 } = result.ellipsoids

    // Ellipsoid visual scaling:
    // semi_axes in metres (e.g. 1km sigma). SCALE converts m→scene units.
    // Earth radius = 1 scene unit. Orbit at 900km = ~0.76 scene units.
    // 1km sigma * SCALE = 0.000105 scene units — invisible without exaggeration.
    // Target: ellipsoid ~2% of orbit radius for visibility. Factor ~145 for 1km sigma.
    // Cap so ellipsoids never exceed 4% of orbit radius (no planet-sized blobs).
    const orbitR_scene = inputs.obj1.a * SCALE
    const maxR = orbitR_scene * 0.04
    const maxSemi = Math.max(...semi_axes_1, ...semi_axes_2, 1)
    const ESCALE = Math.min(SCALE * 145, maxR / (maxSemi * SCALE))

    return {
      pos1: toScene(r1),
      pos2: toScene(r2),
      ellipsoid1: {
        axes: semi_axes_1.map(a => a * ESCALE),
        dirs: directions_1,
      },
      ellipsoid2: {
        axes: semi_axes_2.map(a => a * ESCALE),
        dirs: directions_2,
      },
    }
  }, [result, animT, SCALE, inputs])

  // Orbital params in scene scale
  const orb1 = useMemo(() => ({
    sma:  inputs.obj1.a * SCALE,
    ecc:  inputs.obj1.e,
    inc:  inputs.obj1.inc  * Math.PI / 180,
    raan: inputs.obj1.raan * Math.PI / 180,
    argp: inputs.obj1.argp * Math.PI / 180,
  }), [inputs.obj1, SCALE])

  const orb2 = useMemo(() => ({
    sma:  inputs.obj2.a * SCALE,
    ecc:  inputs.obj2.e,
    inc:  inputs.obj2.inc  * Math.PI / 180,
    raan: inputs.obj2.raan * Math.PI / 180,
    argp: inputs.obj2.argp * Math.PI / 180,
  }), [inputs.obj2, SCALE])

  const satRadius1 = inputs.obj1.radius * SCALE * 200
  const satRadius2 = inputs.obj2.radius * SCALE * 200

  // Animation loop
  const tRef  = useRef(animT)
  const playRef = useRef(playing)
  useEffect(() => { tRef.current  = animT },  [animT])
  useEffect(() => { playRef.current = playing }, [playing])

  useFrame((_, delta) => {
    if (!playRef.current || result === null) return
    const tRange = inputs.t_end - inputs.t_start
    const speed  = tRange / 8  // full sweep in 8 seconds
    let next = tRef.current + delta * speed
    if (next > inputs.t_end) {
      next = inputs.t_start
    }
    onAnimT(next)
  })

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} color="#ffffff" />
      <pointLight position={[-3, 2, -3]} intensity={0.3} color="#0044ff" />

      {/* Stars */}
      <Stars radius={30} depth={10} count={2000} factor={2} fade speed={0} />

      {/* Earth */}
      <Earth />
      <EquatorGrid />

      {/* Orbit trails */}
      <OrbitTrail {...orb1} color="#00aaff" opacity={0.25} />
      <OrbitTrail {...orb2} color="#ff6600" opacity={0.25} />

      {/* Animated satellites + ellipsoids */}
      {pos1 && (
        <>
          <Satellite
            position={pos1}
            color="#00aaff"
            label={`OBJ-1  r=${inputs.obj1.radius}m`}
            radius={satRadius1}
          />
          {ellipsoid1 && (
            <>
              <CovEllipsoid
                position={pos1}
                axes={ellipsoid1.axes}
                directions={ellipsoid1.dirs}
                color="#00aaff"
                opacity={0.06}
              />
              <CovEllipsoidWire
                position={pos1}
                axes={ellipsoid1.axes}
                directions={ellipsoid1.dirs}
                color="#00aaff"
              />
            </>
          )}
        </>
      )}

      {pos2 && (
        <>
          <Satellite
            position={pos2}
            color="#ff6600"
            label={`OBJ-2  r=${inputs.obj2.radius}m`}
            radius={satRadius2}
          />
          {ellipsoid2 && (
            <>
              <CovEllipsoid
                position={pos2}
                axes={ellipsoid2.axes}
                directions={ellipsoid2.dirs}
                color="#ff6600"
                opacity={0.06}
              />
              <CovEllipsoidWire
                position={pos2}
                axes={ellipsoid2.axes}
                directions={ellipsoid2.dirs}
                color="#ff6600"
              />
            </>
          )}
        </>
      )}

      {/* Miss vector at TCA */}
      {pos1 && pos2 && Math.abs(animT - (result?.t_TCA_offset ?? 0)) < 30 && (
        <MissVector pos1={pos1} pos2={pos2} />
      )}
    </>
  )
}

// ─── Exported component ────────────────────────────────────────────────────────
export default function Scene3D({ result, inputs, animT, playing, onAnimT, onPlayingChange }) {
  return (
    <div style={{ flex: 1, position: 'relative', background: '#04060c' }}>
      {/* TCA indicator */}
      {result && animT !== null && (
        <div style={styles.tcaTag}>
          <span style={{ color: 'var(--text-dim)' }}>T </span>
          <span style={{ color: 'var(--text-mono)' }}>
            {animT >= 0 ? '+' : ''}{animT.toFixed(0)}s
          </span>
          {Math.abs(animT - (result.t_TCA_offset ?? 0)) < 15 && (
            <span style={{ color: 'var(--accent)', marginLeft: 8 }}>◉ TCA</span>
          )}
        </div>
      )}

      <Canvas
        camera={{ position: [3, 2, 4], fov: 45, near: 0.001, far: 200 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#04060c' }}
      >
        <SceneContent
          result={result}
          inputs={inputs}
          animT={animT}
          playing={playing}
          onAnimT={onAnimT}
          onPlayingChange={onPlayingChange}
        />
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          zoomSpeed={0.5}
          rotateSpeed={0.5}
          minDistance={1.2}
          maxDistance={20}
        />
      </Canvas>

      {/* No result hint */}
      {!result && (
        <div style={styles.hint}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            DRAG TO ORBIT · SCROLL TO ZOOM
          </span>
        </div>
      )}
    </div>
  )
}

const styles = {
  tcaTag: {
    position: 'absolute',
    top: 12,
    left: 16,
    zIndex: 10,
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    background: '#04060ccc',
    padding: '4px 10px',
    border: '1px solid var(--border)',
    borderRadius: 2,
    pointerEvents: 'none',
  },
  hint: {
    position: 'absolute',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
  },
}
