export const ornamentZones=['back','pillars','roof','base','platform','sides','doors'] as const;
export const carvingLevels=['None','Light','Normal','Heavy','Intricate'];
export const ornamentPatterns=['Floral','Lotus','Vine','Geometric','Scallop'];
export const inlayModes=['None','Border','Motif','Full'];
export const paintColors=['None','Gold','Red','Green','Blue'];
export const jaliPatterns=['Grid','Diamond','Hexagon','Lotus','Arch','Star'];
const ornamentDefaults:Record<string,string>=Object.fromEntries(ornamentZones.flatMap(zone=>[[zone+'Carving','None'],[zone+'Pattern','Floral'],[zone+'Inlay','None'],[zone+'Paint','None']]));
export const surfaceZones=['Back','Pillars','Arch','Roof','Base','Altar'] as const;
const surfaceDefaults:Record<string,string>=Object.fromEntries(surfaceZones.flatMap(z=>[['reference'+z+'Treatment','Carved'],['reference'+z+'Pattern',z==='Back'?'Lotus':'Floral']]));
export const defaults = {...ornamentDefaults,...surfaceDefaults,referenceSurfaceVersion:2,referencePillarDesign:'Fluted',referenceJaliDesign:'Floral',referenceCutDepth:6,referenceSurfaceDetail:'Detailed',designFamily:'Parametric',referenceBaseRatio:.14,referenceRoofRatio:.26,referenceDetail:'Heavy',referenceArch:'Scalloped',referenceSides:'Floral Jali',referenceDrawerCount:0,referenceRoof:'Ribbed Dome',drawerCount:2,drawerLayout:'Horizontal',drawerHandle:'Bar',pillarProfile:'Classical',jaliPattern:'Diamond',jaliDensity:5,inlayColor:'Green',motifScale:1,reliefDepth:8,width:1200,depth:600,height:2100,installation:'Floor',style:'Heritage',material:'White',materialPillars:'Inherit',materialPlatform:'Inherit',materialBack:'Inherit',materialBase:'Inherit',materialRoof:'Inherit',materialDecorative:'Inherit',kalash:false,finish:'Honed',pillars:2,pillarShape:'Round',pillarThickness:100,roof:'Shikhar',roofHeight:400,baseHeight:420,storage:'Drawers',platformLevels:2,platformHeight:100,backPanel:'Plain',sides:'Open',doors:'None',lighting:'Top',brightness:1.5,dimensions:false,ceiling:2600,availableWidth:1500,availableDepth:800,requirements:''};
export type Config = typeof defaults & Record<string,any>;
export function normalizeConfig(raw:Partial<Config>):Config {
 const migrated={...raw};
 if(raw.referenceSurfaceVersion===undefined)migrated.referenceSurfaceVersion=1;
 if(['Floral','Geometric'].includes(raw.backPanel||'')){migrated.backPanel='Plain';if(raw.backCarving===undefined)migrated.backCarving='Normal';if(raw.backPattern===undefined)migrated.backPattern=raw.backPanel;}
 if(raw.storage==='Single Drawer'||raw.storage==='Double Drawer'){migrated.drawerCount=raw.storage==='Single Drawer'?1:2;migrated.storage='Drawers';}
 if(raw.drawerCount===undefined&&['None','Solid','Cabinet'].includes(raw.storage||''))migrated.drawerCount=0;
 return {...defaults,...migrated} as Config;
}
export function drawerGrid(c:Config){const n=c.storage==='Drawers'?c.drawerCount:0;const columns=c.drawerLayout==='Stacked'?1:c.drawerLayout==='Grid'?Math.min(2,n):n;return {count:n,columns:Math.max(1,columns),rows:Math.max(1,Math.ceil(n/Math.max(1,columns)))};}

/** Visualization envelope checks only; these do not approve structural manufacture. */
export function geometryErrors(c: Config) {
 const errors: string[]=[];
 if(c.designFamily==='Reference 33'){
  if(!['Turned','Fluted','Octagonal'].includes(c.referencePillarDesign))errors.push('Unsupported pillar design.');
  if(!['Floral','Diamond'].includes(c.referenceJaliDesign))errors.push('Unsupported jali design.');
  if(![1,2].includes(c.referenceSurfaceVersion))errors.push('Unsupported surface version.');
  if(!Number.isFinite(c.referenceCutDepth)||c.referenceCutDepth<1||c.referenceCutDepth>12)errors.push('Carving depth must be 1–12 mm.');
  if(!['Simple','Detailed'].includes(c.referenceSurfaceDetail))errors.push('Unsupported surface detail.');
  for(const z of surfaceZones){if(!['Plain','Carved','Inlay'].includes(c['reference'+z+'Treatment']))errors.push('Unsupported '+z+' treatment.');if(!['Floral','Lotus'].includes(c['reference'+z+'Pattern']))errors.push('Unsupported '+z+' pattern.');}

  for(const [key,min,max] of [['width',350,3000],['depth',250,2000],['height',500,4000],['referenceBaseRatio',.08,.25],['referenceRoofRatio',.18,.38]] as [string,number,number][]){if(!Number.isFinite(c[key])||c[key]<min||c[key]>max)errors.push(`${key} must be between ${min} and ${max}. Your value is preserved.`);}
  for(const [key,options] of Object.entries({referenceDetail:['Light','Heavy'],referenceArch:['Scalloped','Pointed'],referenceSides:['Floral Jali','Solid Relief','Open'],referenceRoof:['Ribbed Dome','Tapered Shikhar'],material:['White','Green','Pink','Beige','Black'],finish:['Honed','Polished','Matte']}))if(!options.includes(c[key]))errors.push(`Unsupported ${key}.`);
  if(!Number.isInteger(c.referenceDrawerCount)||c.referenceDrawerCount<0||c.referenceDrawerCount>2)errors.push('Reference drawer count must be 0, 1 or 2.');
  if(c.referenceDrawerCount>0&&c.width*.72/c.referenceDrawerCount<150)errors.push('Each drawer needs at least 150 mm provisional face width. Your dimensions are preserved.');
  if(c.referenceDrawerCount>0&&c.height*c.referenceBaseRatio<100)errors.push('Reference drawer base must be at least 100 mm. Increase base proportion or overall height.');
  return errors;
 }
 if(c.designFamily!==undefined&&c.designFamily!=='Parametric')errors.push('Unsupported design family.');
 const positive=['width','depth','height','roofHeight','pillarThickness'] as const;
 const nonnegative=['baseHeight','platformHeight','brightness'] as const;
 for(const key of positive) if(!Number.isFinite(c[key])||c[key]<=0) errors.push(`${key} must be a finite positive number. Your value is preserved.`);
 for(const key of nonnegative) if(!Number.isFinite(c[key])||c[key]<0) errors.push(`${key} must be a finite nonnegative number. Your value is preserved.`);
 if(errors.length)return errors;
 if(c.width<400||c.width>6000||c.depth<250||c.depth>3000||c.height<600||c.height>6000) errors.push('Dimensions outside supported visualization range. Your values are preserved.');
 if(![0,2,4,6].includes(c.pillars))errors.push('Unsupported pillar count; select 0, 2, 4 or 6.');
 if(![1,2,3].includes(c.platformLevels))errors.push('Platform levels must be 1, 2 or 3.');
 if(c.roofHeight<120)errors.push('Roof requires at least 120 mm for the supported cornice and roof geometry.');
 if(c.height-c.roofHeight-c.baseHeight-70<250)errors.push('The base and roof leave less than 250 mm of clear shrine height.');
 if(c.pillars>0&&(c.pillarThickness*1.4>c.width*.2||c.pillarThickness*1.4>c.depth*.28))errors.push('Pillar capitals exceed the overall width or depth envelope. Reduce pillar thickness.');
 if(c.pillars*c.pillarThickness>c.width*.65)errors.push('Pillars leave insufficient clear shrine width.');
 if(c.platformHeight+150>c.height-c.roofHeight-c.baseHeight-70)errors.push('Platform leaves insufficient clear shrine height.');
 if(c.baseHeight>0&&c.baseHeight<80)errors.push('A raised base requires at least 80 mm; use zero with no storage to omit it.');
 if(c.baseHeight===0&&c.storage!=='None')errors.push('Zero-height base is supported only with no storage.');
 if(c.installation==='Cabinet'&&c.baseHeight<250)errors.push('Cabinet installation requires at least 250 mm base height.');
 if(['Drawers','Cabinet'].includes(c.storage)&&c.baseHeight<250)errors.push('Storage base needs at least 250 mm in this provisional system.');
 if(c.brightness>3)errors.push('Lighting intensity must be between 0 and 3.');
 const choices:Record<string,string[]>={installation:['Floor','Wall','Niche','Corner','Cabinet','Open','Storage'],style:['Traditional','Heritage','Minimal','Classical','Modern','Temple'],material:['White','Green','Pink','Beige','Black'],finish:['Polished','Honed','Matte'],pillarShape:['Round','Square','Octagonal','Fluted Round'],roof:['Flat','Shikhar','Dome','Stepped','Cornice','Minimal'],storage:['None','Solid','Drawers','Cabinet'],backPanel:['Plain','Bookmatched','Jali','Floral','Geometric'],sides:['Open','Solid','Jali','Half'],doors:['None','Solid','Jali'],lighting:['None','Top','Back','Platform','Multiple']};
 for(const key of ['materialPillars','materialPlatform','materialBack','materialBase','materialRoof','materialDecorative'])if(!['Inherit','White','Green','Pink','Beige','Black'].includes((c as any)[key]??'Inherit'))errors.push(`Unsupported ${key}.`);
 if(c.kalash!==undefined&&typeof c.kalash!=='boolean')errors.push('Kalash must be enabled or disabled.');
 for(const [key, values] of Object.entries(choices))if(!values.includes((c as any)[key]))errors.push(`Unsupported ${key}; no substitute geometry has been rendered.`);
 for(const zone of ornamentZones){for(const [suffix,choices] of [['Carving',carvingLevels],['Pattern',ornamentPatterns],['Inlay',inlayModes],['Paint',paintColors]] as [string,string[]][]){if(!choices.includes(c[zone+suffix]??'None'))errors.push(`Unsupported ${zone} ${suffix}.`);}}
 if(!Number.isInteger(c.drawerCount)||c.drawerCount<0||c.drawerCount>8)errors.push('Drawer count must be a whole number from 0 to 8.');
 if(c.storage!=='Drawers'&&c.drawerCount!==0)errors.push('Set drawer count to zero when drawers are disabled.');
 if(!['Horizontal','Stacked','Grid'].includes(c.drawerLayout))errors.push('Unsupported drawer layout.');
 if(!['Bar','Knob','Recessed'].includes(c.drawerHandle))errors.push('Unsupported drawer handle.');
 if(!['Simple','Classical','Heavy','Fluted'].includes(c.pillarProfile))errors.push('Unsupported pillar profile.');
 if(!jaliPatterns.includes(c.jaliPattern))errors.push('Unsupported jali pattern.');
 if(!Number.isInteger(c.jaliDensity)||c.jaliDensity<3||c.jaliDensity>10)errors.push('Jali density must be 3–10.');
 if(!['Gold','Green','Black','Red','Blue'].includes(c.inlayColor))errors.push('Unsupported inlay colour.');
 if(!Number.isFinite(c.motifScale)||c.motifScale<.5||c.motifScale>2)errors.push('Motif scale must be 0.5–2.');
 if(!Number.isFinite(c.reliefDepth)||c.reliefDepth<2||c.reliefDepth>20)errors.push('Relief depth must be 2–20 mm.');
 if(c.pillars>0&&[c.pillarsCarving,c.pillarsInlay,c.pillarsPaint].some(v=>v&&v!=='None')&&.51*c.pillarThickness+1.2*c.reliefDepth+2>.14*c.depth)errors.push('Pillar ornament exceeds available depth envelope. Reduce relief depth or increase installation depth.');
 const grid=drawerGrid(c);if(grid.count>0&&((c.width-90)/grid.columns<160||(c.baseHeight-90)/grid.rows<70))errors.push('Drawer layout leaves less than provisional 160 mm face width or 70 mm face height. Change count or layout.');
 return errors;
}
export function validate(c:Config){
 const errors=geometryErrors(c);
 for(const key of ['ceiling','availableWidth','availableDepth'] as const)if(!Number.isFinite(c[key])||c[key]<=0)errors.push(`${key} must be a finite positive number.`);
 if(c.height>c.ceiling)errors.push('Overall height exceeds available ceiling height.');
 if(c.width>c.availableWidth||c.depth>c.availableDepth)errors.push('Mandir exceeds available installation space.');
 if(c.designFamily!=='Reference 33'&&c.installation==='Wall'&&!['None','Solid'].includes(c.storage))errors.push('Wall-mounted installation is incompatible with floor storage.');
 return errors;
}
export const sections=[['home','Home'],['about','About'],['collection','Collection'],['design','Design your mandir'],['custom','Custom mandirs'],['materials','Materials'],['craftsmanship','Craftsmanship'],['gallery','Project gallery'],['contact','Contact'],['quotation','Request quotation'],['faq','FAQ'],['privacy','Privacy policy'],['terms','Terms & conditions'],['admin','Admin dashboard'],['summary','Configuration summary'],['saved','Saved designs'],['references','Reference collection']] as const;

export function activeConfigEntries(c:Config){return Object.entries(c).filter(([k])=>{
 if(c.designFamily!=='Reference 33')return !k.startsWith('reference');
 if(!k.startsWith('reference'))return ['designFamily','width','depth','height','material','finish','ceiling','availableWidth','availableDepth','requirements'].includes(k);
 if(k==='referenceJaliDesign')return c.referenceSides==='Floral Jali';
 const zone=surfaceZones.find(z=>k==='reference'+z+'Treatment'||k==='reference'+z+'Pattern');
 if(zone){if(c.referenceSurfaceVersion!==2)return false;if(k.endsWith('Pattern'))return c['reference'+zone+'Treatment']==='Carved';}
 if(['referenceCutDepth','referenceSurfaceDetail'].includes(k))return c.referenceSurfaceVersion===2&&surfaceZones.some(z=>c['reference'+z+'Treatment']==='Carved');
 if(k==='referencePillarDesign')return c.referenceSurfaceVersion===2;
 return true;
 });}
