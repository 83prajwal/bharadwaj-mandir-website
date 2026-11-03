import { Suspense } from 'react'
import { Bounds, OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'

const MODEL_URL = '/models/bharadwaj_mandir_prototype.glb'

function PrototypeModel() {
  const { scene } = useGLTF(MODEL_URL)
  return <group rotation={[-Math.PI / 2, 0, 0]}><primitive object={scene.clone(true)} /></group>
}

export default function OriginalPrototype() {
  return (
    <div className="designer-original-prototype">
      <p className="designer-viewer-note">The supplied GLB prototype is preserved here unchanged, with its Z-up orientation corrected for display.</p>
      <div className="designer-original-canvas">
        <Canvas camera={{ position: [8, 7, 9], fov: 38 }} dpr={[1, 1.5]} frameloop="demand" gl={{ antialias: true, powerPreference: 'high-performance' }}>
          <hemisphereLight args={['#fffaf1', '#785d48', 1.5]} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[5, 8, 6]} intensity={2.2} color="#fff4dc" />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.2}><PrototypeModel /></Bounds>
          </Suspense>
          <OrbitControls makeDefault enableDamping dampingFactor={0.08} enablePan enableZoom />
        </Canvas>
      </div>
    </div>
  )
}
