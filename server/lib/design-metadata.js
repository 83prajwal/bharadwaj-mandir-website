const DESIGN_METADATA_FIELDS = [
  'designFamily',
  'style',
  'material',
  'finish',
  'materialPillars',
  'materialPlatform',
  'materialBack',
  'materialBase',
  'materialRoof',
  'materialDecorative',
  'inlayColor',
  'reliefDepth',
  'motifScale',
  'jaliPattern',
  'jaliDensity',
  'backPanel',
  'sides',
  'doors',
  'installation',
  'roof',
  'roofHeight',
  'kalash',
  'pillars',
  'pillarShape',
  'pillarProfile',
  'pillarThickness',
  'storage',
  'drawerCount',
  'drawerLayout',
  'drawerHandle',
  'platformLevels',
  'width',
  'depth',
  'height',
  'baseHeight',
  'platformHeight',
  'ceiling',
  'availableWidth',
  'availableDepth',
  'referenceSurfaceVersion',
  'referencePillarDesign',
  'referenceJaliDesign',
  'referenceCutDepth',
  'referenceSurfaceDetail',
  'referenceBaseRatio',
  'referenceRoofRatio',
  'referenceDetail',
  'referenceArch',
  'referenceSides',
  'referenceDrawerCount',
  'referenceRoof',
]

const ORNAMENT_ZONES = ['back', 'pillars', 'roof', 'base', 'platform', 'sides', 'doors']
const ORNAMENT_PROPERTIES = ORNAMENT_ZONES.flatMap((zone) => [
  `${zone}Carving`,
  `${zone}Pattern`,
  `${zone}Inlay`,
  `${zone}Paint`,
])

const REFERENCE_SURFACES = ['Back', 'Pillars', 'Arch', 'Roof', 'Base', 'Altar']
const REFERENCE_SURFACE_PROPERTIES = REFERENCE_SURFACES.flatMap((surface) => [
  `reference${surface}Treatment`,
  `reference${surface}Pattern`,
])

const METADATA_FIELDS = [
  ...DESIGN_METADATA_FIELDS,
  ...ORNAMENT_PROPERTIES,
  ...REFERENCE_SURFACE_PROPERTIES,
]

/** Project only existing Mandir Designer configuration fields into searchable metadata. */
export function projectDesignMetadata(configuration) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return {}

  return Object.fromEntries(
    METADATA_FIELDS
      .filter((field) => Object.hasOwn(configuration, field) && configuration[field] !== undefined)
      .map((field) => [field, configuration[field]]),
  )
}
