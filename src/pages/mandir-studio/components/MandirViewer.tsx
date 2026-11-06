'use client';

import React, { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Html, Line, Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { OrnamentMesh, JaliGeometry, ZoneOrnament, drawerFaces } from './OrnamentGeometry';
import {downloadBrandedImage} from '../lib/export-branding';
import { validate } from '../lib/config';

type Props = { config: any; compact?: boolean };
type MaterialProps = { material: THREE.Material };
const mm = (v: any, fallback: number) => (v === undefined ? fallback : Number(v)) / 1000;
const tint: Record<string, string> = { White: '#d8d5ce', Green: '#46695b', Pink: '#d5aaa0', Beige: '#d1c1a4', Black: '#282b2b' };

function marbleTexture(color: string, bookmatch = false) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 512);
  let seed = 31;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  // Fixed-seed subtle mineral variation and fine veins; illustrative, not a supplied slab.
  const image = ctx.createImageData(512, 512);
  const base = color.match(/[\da-f]{2}/gi)?.slice(0, 3).map((channel) => parseInt(channel, 16)) || [222, 219, 211];
  for (let i = 0; i < image.data.length; i += 4) {
    const variation = (random() - .5) * 7;
    image.data[i] = Math.max(0, Math.min(255, base[0] + variation));
    image.data[i + 1] = Math.max(0, Math.min(255, base[1] + variation));
    image.data[i + 2] = Math.max(0, Math.min(255, base[2] + variation));
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  for (let i = 0; i < 42; i++) {
    const y = random() * 760 - 120; const slope = random() * 210 + 25;
    ctx.beginPath(); ctx.moveTo(-50, y);
    ctx.bezierCurveTo(125, y + slope * .2 + random() * 85, 290, y + slope - random() * 60, 562, y + slope);
    ctx.strokeStyle = i % 7 === 0 ? 'rgba(155,130,91,.2)' : `rgba(81,88,83,${.075 + random() * .105})`;
    ctx.lineWidth = i % 7 === 0 ? 1 + random() * 1.7 : .45 + random() * 1.7; ctx.stroke();
  }
  if (bookmatch) { ctx.save(); ctx.translate(512, 0); ctx.scale(-1, 1); ctx.drawImage(canvas, 0, 0, 256, 512, 0, 0, 256, 512); ctx.restore(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
  return texture;
}

function Block({ size, at, material, rotation }: { size: [number, number, number]; at: [number, number, number]; rotation?: [number, number, number] } & MaterialProps) {
  return <mesh castShadow receiveShadow position={at} rotation={rotation} material={material}><boxGeometry args={size} /></mesh>;
}
function Jali({width,height,depth,material,config}:{width:number;height:number;depth:number;config:any}&MaterialProps){return <JaliGeometry width={width} height={height} depth={depth} material={material} pattern={config.jaliPattern||'Grid'} density={config.jaliDensity||5}/>;}
function PillarAssembly({ x, z, bottom, height, thickness, shape, style, material, decorativeMaterial, config }: { config:any; decorativeMaterial: THREE.Material; x: number; z: number; bottom: number; height: number; thickness: number; shape: string; style: string } & MaterialProps) {
  const decorated = config.pillarProfile ? ['Classical','Heavy'].includes(config.pillarProfile) : ['Heritage','Traditional','Classical','Temple'].includes(style);
  return <group position={[x, bottom, z]}>
    <Block size={[thickness * 1.35, .055, thickness * 1.35]} at={[0, .0275, 0]} material={material} />
    {shape === 'Square' ? <Block size={[thickness, height - .11, thickness]} at={[0, height / 2, 0]} material={material} /> : <mesh castShadow receiveShadow material={material} position={[0, height / 2, 0]}><cylinderGeometry args={[thickness * .44, thickness * .5, Math.max(.01, height - .11), shape === 'Octagonal' ? 8 : 40]} /></mesh>}
    {(shape === 'Fluted Round'||config.pillarProfile==='Fluted') && Array.from({ length: 14 }, (_, i) => { const a = i / 14 * Math.PI * 2; return <mesh key={i} material={material} position={[Math.cos(a) * thickness * .47, height / 2, Math.sin(a) * thickness * .47]} castShadow><cylinderGeometry args={[thickness * .055, thickness * .055, height - .16, 8]} /></mesh>; })}
    <Block size={[thickness * 1.4, .055, thickness * 1.4]} at={[0, height - .0275, 0]} material={material} />
    {config.pillarProfile==='Heavy' && [.16,.22,height-.16,height-.22].map(y=><Block key={y} size={[thickness*1.3,.035,thickness*1.3]} at={[0,y,0]} material={material}/>)}
    <group position={[0,height/2,thickness*.51]}><OrnamentMesh config={config} zone="pillars" width={thickness*.75} height={height*.68} material={decorativeMaterial}/></group>
    {decorated && [.1, height - .1].map(y => <mesh key={y} material={decorativeMaterial} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[thickness * .53, thickness * .09, 8, 32]} /></mesh>)}
  </group>;
}
function RoofAssembly({ w, d, y, h: totalH, roof, style, material, kalash, decorativeMaterial, config }: { config:any; w: number; d: number; y: number; h: number; roof: string; style: string; kalash: boolean; decorativeMaterial: THREE.Material } & MaterialProps) {
  const h = kalash ? totalH * .8 : totalH;
  const finialH = totalH - h;
  const flat = ['Flat', 'Cornice'].includes(roof);
  return <group position={[0, y, 0]}>
    <Block size={[w, roof === 'Minimal' ? Math.min(h, .035) : Math.min(h, .07), d-.056]} at={[0, (roof === 'Minimal' ? Math.min(h, .035) : Math.min(h, .07)) / 2, 0]} material={material} />
    {flat && <Block size={[w * .97, Math.max(.01, h - .07), d * .97]} at={[0, .07 + Math.max(.01, h - .07) / 2, 0]} material={material} />}
    {(roof === 'Cornice' || style === 'Classical') && [0, 1, 2].map(i => <Block key={i} size={[w * (1 - i * .025), Math.min(.025,h*.15), d * (1 - i * .025)]} at={[0, h * .28 + i * h * .2, 0]} material={material} />)}
    {(roof === 'Shikhar' || roof === 'Stepped') && Array.from({ length: roof === 'Shikhar' ? 8 : 4 }, (_, i) => { const n = roof === 'Shikhar' ? 8 : 4; const scale = 1 - i / n * .78; const sh = (h - .07) / n; return <Block key={i} size={[w * scale * .86, sh, d * scale * .86]} at={[0, .07 + (i + .5) * sh, 0]} material={material} />; })}
    {roof === 'Dome' && <mesh castShadow receiveShadow material={material} position={[0, .06, 0]} scale={[w * .44, Math.max(.02, h - .06), d * .44]}><sphereGeometry args={[1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>}
    <group position={[0,.035,d/2-.028]}><OrnamentMesh config={config} zone="roof" width={w*.92} height={.06} material={decorativeMaterial}/></group>
    {kalash && <mesh castShadow receiveShadow material={decorativeMaterial} position={[0,h,0]}><latheGeometry args={[[new THREE.Vector2(0,0),new THREE.Vector2(Math.min(w,d)*.055,0),new THREE.Vector2(Math.min(w,d)*.07,finialH*.32),new THREE.Vector2(Math.min(w,d)*.035,finialH*.65),new THREE.Vector2(Math.min(w,d)*.045,finialH*.72),new THREE.Vector2(0,finialH)],32]} /></mesh>}
  </group>;
}
function StorageAssembly({w,d,h,storage,material,config}:{w:number;d:number;h:number;storage:string;config:any}&MaterialProps){
 const n=storage==='Drawers'?Number(config.drawerCount||0):storage==='Single Drawer'?1:storage==='Double Drawer'?2:0;
 const faces=drawerFaces(w,h,n,config.drawerLayout||'Horizontal');
 return <group><Block size={[w,.05,d]} at={[0,.025,0]} material={material}/>{storage!=='None'&&<Block size={[w*.96,h-.055,d*.9]} at={[0,h/2,-d*.025]} material={material}/>}
 {faces.map((face,i)=>{const fw=face.width+.008,fh=face.height+.008;return <group key={i} position={[face.x,face.y,d/2-.048]}><Block size={[fw-.008,fh-.008,.018]} at={[0,0,0]} material={material}/><group position={[0,0,.01]}><OrnamentMesh config={config} zone="base" width={fw*.86} height={fh*.82} material={material}/></group>{config.drawerHandle==='Knob'?<mesh position={[0,fh*.3,.025]}><sphereGeometry args={[.012,12,8]}/><meshStandardMaterial color="#ac925d" metalness={.55} roughness={.4}/></mesh>:config.drawerHandle==='Recessed'?<mesh position={[0,fh*.3,.010]}><boxGeometry args={[Math.min(.09,fw*.3),.012,.002]}/><meshStandardMaterial color="#665846" roughness={.8}/></mesh>:<mesh position={[0,fh*.3,.025]}><boxGeometry args={[Math.min(.09,fw*.35),.009,.014]}/><meshStandardMaterial color="#ac925d" metalness={.55} roughness={.4}/></mesh>}</group>;})}
 {storage==='Cabinet'&&[-1,1].map(sign=><group key={sign} position={[sign*w*.24,h*.52,d*.425]}><Block size={[w*.47,h*.84,.02]} at={[0,0,0]} material={material}/><Block size={[.014,.11,.025]} at={[-sign*w*.025,0,.014]} material={material}/></group>)}
 {!n&&storage!=='None'&&<group position={[0,h/2,d*.425+.001]}><OrnamentMesh config={config} zone="base" width={w*.9} height={h*.8} material={material}/></group>}
 {storage==='None'&&[-1,1].map(sign=><Block key={sign} size={[.055,h,d*.92]} at={[sign*(w/2-.05),h/2,0]} material={material}/>)}
 </group>;
}
function DoorAssembly({w,d,base,shrineHeight,type,open,material,config}:{config:any;w:number;d:number;base:number;shrineHeight:number;type:string;open:boolean}&MaterialProps){
  const left=useRef<THREE.Group>(null), right=useRef<THREE.Group>(null);
  useFrame((_,delta)=>{const target=open?Math.PI*.42:0;for(const [ref,sign] of [[left,-1],[right,1]] as const){if(ref.current)ref.current.rotation.y=THREE.MathUtils.damp(ref.current.rotation.y,sign*target,7,delta);}});
  return <group>{[-1,1].map(s=><group key={s} ref={s<0?left:right} position={[s*w*.47,base+.065+shrineHeight*.46,d/2-.045]}><group position={[-s*w*.235,0,0]}>{type==='Jali'?<Jali config={config} width={w*.46} height={shrineHeight*.9} depth={.025} material={material}/>:<Block size={[w*.46,shrineHeight*.9,.025]} at={[0,0,0]} material={material}/>}<group position={[0,0,.013]}><ZoneOrnament frameOnly={type==='Jali'} config={config} zone="doors" width={w*.46} height={shrineHeight*.9} material={material}/></group><mesh position={[-s*w*.17,0,.026]}><boxGeometry args={[.012,.09,.025]}/><meshStandardMaterial color="#b69a65" metalness={.6} roughness={.4}/></mesh></group></group>)}</group>;
}
function CameraPosition({ view, size }: { view: { name: string; tick: number }; size: number }) {
  const { camera, controls, invalidate } = useThree();
  useEffect(() => {
    const directions: Record<string, [number, number, number]> = { Front: [0, .55, 2.4], Side: [2.4, .55, 0], Top: [0, 3, .001], Isometric: [1.7, 1.2, 2.2], Reset: [1.7, 1.2, 2.2] };
    const p = directions[view.name] || directions.Reset;
    camera.position.set(p[0] * size, p[1] * size, p[2] * size); camera.lookAt(0, size * .44, 0);
    const ctl = controls as any; if (ctl) { ctl.target.set(0, size * .44, 0); ctl.update(); }
    invalidate();
  }, [view, size, camera, controls, invalidate]);
  return null;
}
function MandirAssembly({ config: c, doorsOpen }: { config: any; doorsOpen: boolean }) {
  const w = mm(c.width, 1400), d = mm(c.depth, 650), h = mm(c.height, 2100);
  const base = mm(c.baseHeight, 450), rh = mm(c.roofHeight, 350);
  const top = h - rh; const shrineHeight = Math.max(.01, top - base - .07); const t = mm(c.pillarThickness, 100);
  const wall = c.installation === 'Wall'; const style = c.style || 'Traditional';
  const mats = useMemo(() => {
    const roughness = c.finish === 'Polished' ? .3 : c.finish === 'Matte' ? .7 : .47;
    const make = (key?: string, bookmatch = false) => {
      const selection = key && c[key] && c[key] !== 'Inherit' ? c[key] : c.material;
      const map = marbleTexture(tint[selection] || tint.White, bookmatch);
      return new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.0008,roughness,metalness:0,envMapIntensity:.72});
    };
    return {body:make(), pillars:make('materialPillars'), platform:make('materialPlatform'), back:make('materialBack'), bookmatched:make('materialBack',true), base:make('materialBase'), roof:make('materialRoof'), decorative:make('materialDecorative')};
  },[c.material,c.finish,c.materialPillars,c.materialPlatform,c.materialBack,c.materialBase,c.materialRoof,c.materialDecorative]);
  useEffect(()=>()=>{Object.values(mats).forEach(m=>{m.map?.dispose();m.dispose();});},[mats]);
  const material = mats.body;
  const count = Math.max(0, Math.min(12, Number(c.pillars) || 0));
  const ppos = Array.from({ length: count }, (_, i) => { const frontCount = Math.ceil(count / 2); const row = count <= 2 ? 0 : i < frontCount ? 0 : 1; const n = count <= 2 ? count : row === 0 ? frontCount : count - frontCount; const ix = row === 0 ? i : i - frontCount; return { x: n <= 1 ? 0 : -w * .4 + ix / (n - 1) * w * .8, z: row === 0 ? d * .36 : -d * .36 }; });
  const levels = Math.max(1, Math.min(3, Number(c.platformLevels) || 1));
  const ph = mm(c.platformHeight, 100);
  const glow = c.lighting && c.lighting !== 'None'; const intensity = Number(c.brightness) * .65;
  return <group>
    {!wall && base > 0 ? <StorageAssembly config={c} w={w} d={d} h={base} storage={c.storage || 'Solid'} material={mats.base} /> : null}
    <Block size={[w, .065, d]} at={[0, base + .0325, 0]} material={material} />
    {ppos.map((p, i) => <PillarAssembly config={c} key={i} {...p} bottom={base + .065} height={shrineHeight} thickness={t} shape={c.pillarShape || 'Round'} style={style} material={mats.pillars} decorativeMaterial={mats.decorative} />)}
    {c.backPanel === 'Jali' ? <group position={[0, base + shrineHeight / 2 + .065, -d / 2 + .025]}><Jali config={c} width={w * .91} height={shrineHeight} depth={.025} material={mats.back} /></group> : <Block size={[w * .94, shrineHeight, .035]} at={[0, base + shrineHeight / 2 + .065, -d / 2 + .025]} material={c.backPanel === 'Bookmatched' ? mats.bookmatched : mats.back} />}
    <group position={[0,base+shrineHeight/2+.065,-d/2+(c.backPanel==='Jali'?.0385:.043)]}><ZoneOrnament frameOnly={c.backPanel==='Jali'} config={c} zone="back" width={c.backPanel==='Jali'?w*.91:w*.88} height={c.backPanel==='Jali'?shrineHeight:shrineHeight*.9} material={mats.decorative}/></group>
    {(c.sides !== 'Open' && c.sides) && [-1, 1].map(s => <group key={s} position={[s * (w / 2 - .03), base + .065 + shrineHeight * (c.sides === 'Half' ? .25 : .5), 0]} rotation={[0, Math.PI / 2, 0]}>{c.sides === 'Jali' ? <Jali config={c} width={d * .92} height={shrineHeight} depth={.025} material={material} /> : <Block size={[d * .92, shrineHeight * (c.sides === 'Half' ? .5 : 1), .035]} at={[0, 0, 0]} material={material} />}</group>)}
    {c.sides!=='Open'&&[-1,1].map(sign=><group key={sign} position={[sign*(w/2-.0435),base+.065+shrineHeight*(c.sides==='Half'?.25:.5),0]} rotation={[0,-sign*Math.PI/2,0]}><ZoneOrnament frameOnly={c.sides==='Jali'} config={c} zone="sides" width={c.sides==='Jali'?d*.92:d*.84} height={shrineHeight*(c.sides==='Half'?.42:c.sides==='Jali'?1:.85)} material={mats.decorative}/></group>)}
    {ph>0&&<group position={[0,base+.065+ph/levels/2,d*.315-.028]}><OrnamentMesh config={c} zone="platform" width={w*.68} height={ph/levels*.8} material={mats.decorative}/></group>}
    {ph > 0 && Array.from({ length: levels }, (_, i) => <Block key={i} size={[w * (.74 - i * .11), ph / levels, d * (.72 - i * .13)-.056]} at={[0, base + .065 + ph / levels * (i + .5), -d * .045]} material={mats.platform} />)}
    {c.doors && c.doors !== 'None' && <DoorAssembly config={c} w={w} d={d} base={base} shrineHeight={shrineHeight} type={c.doors} open={doorsOpen} material={material} />}
    <RoofAssembly config={c} w={w} d={d} y={top} h={rh} roof={c.roof || 'Shikhar'} style={style} material={mats.roof} kalash={!!c.kalash} decorativeMaterial={mats.decorative} />
    {c.installation === 'Niche' && <group>{[-1, 1].map(s => <Block key={s} size={[.035, top, d]} at={[s * (w / 2 - .0175), top / 2, 0]} material={material} />)}</group>}
    {c.installation === 'Corner' && <Block size={[.035, shrineHeight, d * .94]} at={[-w / 2 + .0175, base + .065 + shrineHeight / 2, 0]} material={material} />}
    {glow && <group>{['Top', 'Multiple'].includes(c.lighting) && <pointLight position={[0, top - .08, d * .2]} intensity={intensity * 2} color="#ffdcaa" distance={h * 1.3} decay={2} />}{['Back', 'Multiple'].includes(c.lighting) && <pointLight position={[0, base + shrineHeight * .6, -d * .22]} intensity={intensity} color="#ffe0b5" distance={w * 1.3} />}{['Platform', 'Multiple'].includes(c.lighting) && <pointLight position={[0, base + ph + .1, d * .2]} intensity={intensity * .8} color="#ffdcaa" distance={w} />}</group>}
    {c.dimensions && <DimensionAnnotations w={w} d={d} h={h} />}
  </group>;
}
function DimensionAnnotations({ w, d, h }: { w: number; d: number; h: number }) {
  return <group><Line points={[[-w / 2, .01, d / 2 + .16], [w / 2, .01, d / 2 + .16]]} color="#937642" lineWidth={1} /><Html position={[0, .01, d / 2 + .16]} center><span className="mandir-dim">{Math.round(w * 1000)} mm</span></Html><Line points={[[w / 2 + .17, 0, 0], [w / 2 + .17, h, 0]]} color="#937642" lineWidth={1} /><Html position={[w / 2 + .17, h / 2, 0]} center><span className="mandir-dim">{Math.round(h * 1000)} mm</span></Html><Line points={[[-w / 2 - .15, .01, -d / 2], [-w / 2 - .15, .01, d / 2]]} color="#937642" lineWidth={1} /><Html position={[-w / 2 - .15, .01, 0]} center><span className="mandir-dim">{Math.round(d * 1000)} mm</span></Html></group>;
}
class ViewerBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? <Fallback /> : this.props.children; } }
function Fallback() { return <div style={{ padding: 40, textAlign: 'center', margin: 'auto' }}><strong>3D preview unavailable on this device</strong><p>Your design controls and saved specifications remain available. Enable WebGL or use a supported browser for the interactive preview.</p></div>; }
export default function MandirViewer({ config, compact = false }: Props) {
  const [ready, setReady] = useState(false); const [webgl, setWebgl] = useState(true); const [view, setView] = useState({ name: 'Isometric', tick: 0 });
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [background, setBackground] = useState('Ivory'); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); setWebgl(!!gl); if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { setWebgl(false); } setReady(true); }, []);
  const conflicts = validate(config);
  const size = conflicts.length ? 2.1 : Math.max(mm(config.width, 1400), mm(config.height, 2100), mm(config.depth, 650));
  const bg = background === 'Dark' ? '#343431' : background === 'White' ? '#ffffff' : '#eee8dd';
  const changeView = (name: string) => setView(v => ({ name, tick: v.tick + 1 }));
  const screenshot = (format:'png'|'jpeg'='png') => { const canvas=ref.current?.querySelector('canvas'); if(canvas)downloadBrandedImage(canvas,format); };
  return <div ref={ref} className="mandir-view" style={{ background: bg, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: compact ? 400 : 570, height: compact ? '100%' : 'min(78vh, 860px)', width: '100%', overflow: 'hidden' }}>
    <style>{`.mandir-dim{background:#fffdf6e8;color:#625334;padding:4px 7px;font:10px sans-serif;white-space:nowrap;border:1px solid #d8c8ae}.mandir-tools button,.mandir-tools select{background:#fffdf8e8;border:1px solid #d8c8ae;color:#49443b;padding:7px 10px;font:11px sans-serif;cursor:pointer}.mandir-tools button:hover{background:#d8c8ae}.mandir-tools button:focus-visible{outline:2px solid #806538}.mandir-view:fullscreen{height:100vh!important}`}</style>
    <div style={{ flex: 1, minHeight: 330 }}>
      {conflicts.length ? <div role="status" style={{padding:40,margin:'auto',maxWidth:540,color:'#534b3e'}}><strong>Preview paused — dimensional conflict</strong><p>Your entered values are preserved. Resolve these conflicts to render your design:</p><ul>{conflicts.map((issue,i)=><li key={i} style={{marginBottom:10}}>{issue}</li>)}</ul></div> : ready && webgl ? <ViewerBoundary><Canvas shadows dpr={[1, 1.7]} camera={{ position: [size * 1.7, size * 1.2, size * 2.2], fov: 32, near: .01, far: 200 }} gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping }}>
        <color attach="background" args={[bg]} />
        <ambientLight intensity={.3} />
        <hemisphereLight args={['#fffaf2', '#9b8d77', .72]} />
        <directionalLight castShadow position={[3.5, 6, 4]} intensity={1.7} shadow-mapSize={[1024, 1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={7} shadow-camera-bottom={-6} shadow-bias={-.00025} shadow-radius={4} />
        <directionalLight position={[-4, 3, 2]} intensity={.58} color="#fffaf1" />
        <directionalLight position={[0, 4, -5]} intensity={.68} color="#fff4df" />
        <Suspense fallback={null}><Environment resolution={64}><Lightformer intensity={.9} position={[0, 5, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[6, 6, 1]} /><Lightformer intensity={1.25} position={[-4, 2, 2]} rotation={[0, Math.PI / 2, 0]} scale={[3, 5, 1]} /><Lightformer intensity={.55} position={[3, 3, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[3, 3, 1]} /></Environment><MandirAssembly config={config} doorsOpen={doorsOpen} /><ContactShadows position={[0, -.012, 0]} opacity={.38} scale={size * 3.4} blur={2.8} far={size * 1.6} resolution={512} /></Suspense>
        <OrbitControls makeDefault target={[0, size * .44, 0]} minDistance={size * .6} maxDistance={size * 7} maxPolarAngle={Math.PI * .51} enablePan /><CameraPosition view={view} size={size} />
      </Canvas></ViewerBoundary> : ready ? <Fallback /> : <div style={{ padding: 60, textAlign: 'center' }}>Preparing marble studio…</div>}
    </div>
    {!compact && <div className="mandir-tools" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '12px 16px', justifyContent: 'center', position: 'relative', zIndex: 3 }}>
      {['Front', 'Side', 'Top', 'Isometric', 'Reset'].map(v => <button type="button" key={v} onClick={() => changeView(v)}>{v}</button>)}
      {config.doors !== 'None' && <button type="button" aria-pressed={doorsOpen} disabled={conflicts.length > 0} onClick={()=>setDoorsOpen(v=>!v)}>{doorsOpen?'Close doors':'Open doors'}</button>}
      <button type="button" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void ref.current?.requestFullscreen(); }}>Fullscreen</button>
      <button type="button" onClick={()=>screenshot('png')} disabled={!webgl || conflicts.length > 0}>PNG</button><button type="button" onClick={()=>screenshot('jpeg')} disabled={!webgl || conflicts.length > 0}>JPEG</button>
      <select aria-label="Preview background" value={background} onChange={e => setBackground(e.target.value)}><option>Ivory</option><option>White</option><option>Dark</option></select>
    </div>}
    <div style={{ textAlign: 'center', fontSize: 10, color: background === 'Dark' ? '#ddd' : '#766e61', padding: '0 18px 14px', lineHeight: 1.6 }}>Drag to rotate · Scroll or pinch to zoom · Right-drag to pan<br />Illustrative marble veining. Dimensions and construction require design review.{doorsOpen && config.doors !== 'None' && <><br />Dimensions describe the closed design. Door swing and hinge engineering require additional clearance review.</>}</div>
  </div>;
}
