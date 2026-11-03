'use client';
import React,{useMemo,useEffect} from 'react';
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const colors:Record<string,string>={Gold:'#c29a50',Red:'#8b3029',Green:'#225b45',Blue:'#254e86',Black:'#262726'};
function polygon(points:[number,number][]) {const p=new THREE.Shape();points.forEach(([x,y],i)=>i?p.lineTo(x,y):p.moveTo(x,y));p.closePath();return p;}
function ellipse(rx:number,ry:number){const s=new THREE.Shape();s.absellipse(0,0,rx,ry,0,Math.PI*2,false,0);return s;}
export function reliefGeometry(width:number,height:number,pattern:string,level:number,scale:number,depth:number){
 const geometries:THREE.BufferGeometry[]=[];
 const columns=Math.max(1,Math.min(8,Math.round(Math.sqrt(width/height)*level/scale)));
 const rows=Math.max(1,Math.min(6,Math.round(Math.sqrt(height/width)*level/scale)));
 const cellW=width/columns,cellH=height/rows,r=Math.min(cellW,cellH)*.37;
 const add=(shape:THREE.Shape,x:number,y:number,a=0)=>{const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:Math.min(depth*.15,r*.025),bevelThickness:depth*.12,curveSegments:8});g.rotateZ(a);g.translate(x,y,0);geometries.push(g);};
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const x=(col+.5)*cellW-width/2,y=(row+.5)*cellH-height/2;
  if(pattern==='Geometric'){const diamond=polygon([[0,r],[r,0],[0,-r],[-r,0]]);const hole=new THREE.Path();hole.moveTo(0,r*.65);hole.lineTo(-r*.65,0);hole.lineTo(0,-r*.65);hole.lineTo(r*.65,0);hole.closePath();diamond.holes.push(hole);add(diamond,x,y);add(ellipse(r*.14,r*.14),x,y);}
  else if(pattern==='Vine'){for(let i=0;i<5;i++){const yy=y-r+i*r*.5;const xx=x+Math.sin(i*1.2)*r*.25;add(ellipse(r*.12,r*.34),xx+(i%2?1:-1)*r*.22,yy,i%2?-.7:.7);}add(polygon([[-r*.04,-r],[r*.04,-r],[r*.04,r],[-r*.04,r]]),x,y);}
  else if(pattern==='Scallop'){for(let i=0;i<5;i++){const a=i*Math.PI/4;add(ellipse(r*.17,r*.47),x+Math.cos(a)*r*.35,y+Math.sin(a)*r*.35,a-Math.PI/2);}}
  else {const petals=pattern==='Lotus'?7:8;for(let i=0;i<petals;i++){const a=pattern==='Lotus'?-Math.PI*.15+i/(petals-1)*Math.PI*1.3:i/petals*Math.PI*2;add(ellipse(r*.19,r*.45),x+Math.cos(a)*r*.47,y+Math.sin(a)*r*.47,a-Math.PI/2);}add(ellipse(r*.19,r*.19),x,y);}
 }
 const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());return merged;
}
/** All details are procedural design concepts. Inlay pieces do not imply approved machining. */
export function OrnamentMesh({config:c,zone,width,height,material}:{config:any;zone:string;width:number;height:number;material:THREE.Material}){
 const carving=c[`${zone}Carving`]||'None',pattern=c[`${zone}Pattern`]||'Floral',paint=c[`${zone}Paint`]||'None',inlay=c[`${zone}Inlay`]||'None';
 const level=({None:0,Light:1,Normal:2,Heavy:3,Intricate:4} as Record<string,number>)[carving]||0;
 const depth=(Number(c.reliefDepth)||6)/1000*(.55+level*.12);
 const geometry=useMemo(()=>level||paint!=='None'?reliefGeometry(width*.9,height*.85,pattern,Math.max(1,level),Number(c.motifScale)||1,level?depth:.001):null,[width,height,pattern,level,c.motifScale,depth,paint]);
 const inlayGeometry=useMemo(()=>inlay==='Motif'||inlay==='Full'?reliefGeometry(width*.85,height*.8,pattern,inlay==='Full'?3:1,Number(c.motifScale)||1,.001):null,[width,height,pattern,inlay,c.motifScale]);
 const accent=useMemo(()=>new THREE.MeshStandardMaterial({color:colors[paint]||colors.Gold,roughness:paint==='Gold'?.38:.45,metalness:paint==='Gold'?.32:0}),[paint]);
 const inlayMat=useMemo(()=>new THREE.MeshStandardMaterial({color:colors[c.inlayColor]||colors.Gold,roughness:c.inlayColor==='Gold'?.36:.4,metalness:c.inlayColor==='Gold'?.3:0}),[c.inlayColor]);
 useEffect(()=>()=>{geometry?.dispose();},[geometry]);useEffect(()=>()=>{inlayGeometry?.dispose();},[inlayGeometry]);useEffect(()=>()=>accent.dispose(),[accent]);useEffect(()=>()=>inlayMat.dispose(),[inlayMat]);
 const border=Math.min(width,height)*.035;
 return <group>{geometry&&<mesh castShadow receiveShadow geometry={geometry} material={paint==='None'?material:accent}/>} {inlayGeometry&&<mesh castShadow geometry={inlayGeometry} material={inlayMat} position={[0,0,level?depth+.001:.001]}/>} {(inlay==='Border'||inlay==='Full')&&[-1,1].map(sign=><group key={sign}><mesh material={inlayMat} position={[0,sign*(height*.46-border/2),.001]}><boxGeometry args={[width*.92,border,.002]}/></mesh><mesh material={inlayMat} position={[sign*(width*.46-border/2),0,.001]}><boxGeometry args={[border,height*.92,.002]}/></mesh></group>)}</group>;
}
export function ZoneOrnament({frameOnly=false,...props}:{frameOnly?:boolean;config:any;zone:string;width:number;height:number;material:THREE.Material}){
 if(!frameOnly)return <OrnamentMesh {...props}/>;
 const border=Math.min(props.width,props.height)*.085;
 return <group>{[-1,1].map(sign=><group key={sign}><group position={[0,sign*(props.height/2-border*.58),0]}><OrnamentMesh {...props} width={props.width*.94} height={border*.8}/></group><group position={[sign*(props.width/2-border*.58),0,0]}><OrnamentMesh {...props} width={border*.8} height={props.height-border*2}/></group></group>)}</group>;
}
export function JaliGeometry({width,height,depth,material,pattern='Grid',density=5}:{width:number;height:number;depth:number;material:THREE.Material;pattern?:string;density?:number}){
 return <mesh castShadow receiveShadow material={material} geometry={useJaliGeometry(width,height,depth,pattern,density)}/>;
}
function useJaliGeometry(width:number,height:number,depth:number,pattern:string,density:number){
 const geometry=useMemo(()=>createJaliGeometry(width,height,depth,pattern,density),[width,height,depth,pattern,density]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);return geometry;
}
export function createJaliGeometry(width:number,height:number,depth:number,pattern:string,density:number){
  const shape=polygon([[-width/2,-height/2],[width/2,-height/2],[width/2,height/2],[-width/2,height/2]]);
  const cols=Math.max(3,Math.min(10,Math.round(density))),rows=Math.max(2,Math.min(14,Math.round(cols*height/width)));
  const border=Math.min(width,height)*.1,innerW=width-border*2,innerH=height-border*2;
  const cw=innerW/cols,ch=innerH/rows;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
   const cx=-innerW/2+(col+.5)*cw,cy=-innerH/2+(row+.5)*ch,rx=cw*.35,ry=ch*.35;const hole=new THREE.Path();
   if(pattern==='Grid'){hole.moveTo(cx-rx,cy-ry);hole.lineTo(cx-rx,cy+ry);hole.lineTo(cx+rx,cy+ry);hole.lineTo(cx+rx,cy-ry);}
   else if(pattern==='Arch'){hole.moveTo(cx-rx,cy-ry);hole.lineTo(cx-rx,cy);hole.bezierCurveTo(cx-rx,cy+ry*1.25,cx+rx,cy+ry*1.25,cx+rx,cy);hole.lineTo(cx+rx,cy-ry);}
   else{const n=pattern==='Diamond'?4:pattern==='Hexagon'?6:pattern==='Star'?12:24;for(let i=0;i<n;i++){const a=-i/n*Math.PI*2+Math.PI/2;const f=pattern==='Star'?(i%2?.5:1):pattern==='Lotus'?.77+.23*Math.cos(a*6):1;const x=cx+Math.cos(a)*rx*f,y=cy+Math.sin(a)*ry*f;i?hole.lineTo(x,y):hole.moveTo(x,y);}}
   hole.closePath();shape.holes.push(hole);
  }
  const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:8});g.translate(0,0,-depth/2);g.userData.holeCount=cols*rows;g.userData.pattern=pattern;return g;
}
export function drawerFaces(width:number,height:number,count:number,layout:string){
 if(!Number.isInteger(count)||count<0||count>8)throw new Error('Invalid drawer count');
 if(count===0)return [];
 const columns=layout==='Stacked'?1:layout==='Grid'?Math.min(2,count):count,rows=Math.ceil(count/columns);
 const fw=(width-.09)/columns,fh=(height-.09)/rows;
 return Array.from({length:count},(_,i)=>({x:-(width-.09)/2+fw*(i%columns+.5),y:.045+fh*(Math.floor(i/columns)+.5),width:fw-.008,height:fh-.008}));
}
