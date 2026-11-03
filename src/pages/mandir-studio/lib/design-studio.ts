import {normalizeConfig,ornamentZones,type Config} from './config';
export const designStudies=['Quiet marble','Heritage floral','Lotus sanctuary','Green pietra dura','Royal painted','Geometric jali'] as const;
export function applyStudy(current:Config,study:string):Config{
 const c=normalizeConfig(current);for(const z of ornamentZones){c[z+'Carving']='None';c[z+'Inlay']='None';c[z+'Paint']='None';}
 c.backPanel='Plain';c.pillarProfile='Simple';
 if(study==='Heritage floral'){c.backCarving='Intricate';c.backPattern='Floral';c.pillarsCarving='Heavy';c.pillarsPattern='Vine';c.roofCarving='Normal';c.roofPattern='Scallop';c.pillarProfile='Heavy';}
 if(study==='Lotus sanctuary'){c.backCarving='Heavy';c.backPattern='Lotus';c.backInlay='Motif';c.inlayColor='Gold';c.platformCarving='Normal';c.platformPattern='Lotus';c.pillarProfile='Classical';}
 if(study==='Green pietra dura'){c.backInlay='Full';c.backPattern='Vine';c.inlayColor='Green';c.pillarsInlay='Border';c.baseInlay='Border';c.roofInlay='Border';c.pillarProfile='Simple';}
 if(study==='Royal painted'){c.backCarving='Heavy';c.backPattern='Floral';c.backPaint='Gold';c.pillarsCarving='Normal';c.pillarsPaint='Gold';c.roofCarving='Heavy';c.roofPaint='Gold';c.baseCarving='Normal';c.basePaint='Red';}
 if(study==='Geometric jali'){c.backPanel='Jali';c.jaliPattern='Star';c.jaliDensity=5;c.pillarsCarving='Light';c.pillarsPattern='Geometric';c.roofCarving='Normal';c.roofPattern='Geometric';}
 return c;
}
/** Finite procedural recombination, never AI/fabrication approval. Dimensions and storage stay unchanged. */
export function createVariation(current:Config,seed:number):Config{
 let n=seed>>>0;const rand=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296};const pick=(a:string[])=>a[Math.floor(rand()*a.length)];const c=normalizeConfig(current);
 for(const z of ornamentZones){c[z+'Carving']=pick(['None','Light','Normal','Heavy','Intricate']);c[z+'Pattern']=pick(['Floral','Lotus','Vine','Geometric','Scallop']);c[z+'Inlay']=pick(['None','Border','Motif','Full']);c[z+'Paint']=rand()>.78?pick(['Gold','Red','Green','Blue']):'None';}
 c.inlayColor=pick(['Gold','Green','Black','Red','Blue']);c.jaliPattern=pick(['Grid','Diamond','Hexagon','Lotus','Arch','Star']);c.pillarProfile=pick(['Simple','Classical','Heavy','Fluted']);return c;
}
