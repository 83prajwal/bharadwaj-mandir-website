import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

export const MAX_DESIGN_BODY_BYTES = 40_000
const ZONES = ['back', 'pillars', 'roof', 'base', 'platform', 'sides', 'doors']
const SURFACES = ['Back', 'Pillars', 'Arch', 'Roof', 'Base', 'Altar']
const ALLOWED_KEYS = new Set([
  ...ZONES.flatMap((zone) => [`${zone}Carving`, `${zone}Pattern`, `${zone}Inlay`, `${zone}Paint`]),
  ...SURFACES.flatMap((zone) => [`reference${zone}Treatment`, `reference${zone}Pattern`]),
  'referenceSurfaceVersion', 'referencePillarDesign', 'referenceJaliDesign', 'referenceCutDepth', 'referenceSurfaceDetail',
  'referenceBaseRatio', 'referenceRoofRatio', 'referenceDetail', 'referenceArch', 'referenceSides', 'referenceDrawerCount', 'referenceRoof',
  'drawerCount', 'drawerLayout', 'drawerHandle', 'pillarProfile', 'jaliPattern', 'jaliDensity', 'inlayColor', 'motifScale', 'reliefDepth',
  'width', 'depth', 'height', 'installation', 'style', 'material', 'materialPillars', 'materialPlatform', 'materialBack',
  'materialBase', 'materialRoof', 'materialDecorative', 'kalash', 'finish', 'pillars', 'pillarShape', 'pillarThickness', 'roof',
  'roofHeight', 'baseHeight', 'storage', 'platformLevels', 'platformHeight', 'backPanel', 'sides', 'doors', 'lighting', 'brightness',
  'dimensions', 'ceiling', 'availableWidth', 'availableDepth', 'requirements', 'designFamily',
])
const ENUMS = {
  designFamily: ['Parametric'], installation: ['Floor', 'Wall', 'Niche', 'Corner', 'Cabinet', 'Open', 'Storage'],
  style: ['Traditional', 'Heritage', 'Minimal', 'Classical', 'Modern', 'Temple'], material: ['White', 'Green', 'Pink', 'Beige', 'Black'],
  finish: ['Polished', 'Honed', 'Matte'], pillarShape: ['Round', 'Square', 'Octagonal', 'Fluted Round'],
  roof: ['Flat', 'Shikhar', 'Dome', 'Stepped', 'Cornice', 'Minimal'], storage: ['None', 'Solid', 'Drawers', 'Cabinet'],
  backPanel: ['Plain', 'Bookmatched', 'Jali', 'Floral', 'Geometric'], sides: ['Open', 'Solid', 'Jali', 'Half'],
  doors: ['None', 'Solid', 'Jali'], lighting: ['None', 'Top', 'Back', 'Platform', 'Multiple'],
  drawerLayout: ['Horizontal', 'Stacked', 'Grid'], drawerHandle: ['Bar', 'Knob', 'Recessed'], pillarProfile: ['Simple', 'Classical', 'Heavy', 'Fluted'],
  jaliPattern: ['Grid', 'Diamond', 'Hexagon', 'Lotus', 'Arch', 'Star'], inlayColor: ['Gold', 'Green', 'Black', 'Red', 'Blue'],
  referencePillarDesign: ['Turned', 'Fluted', 'Octagonal'], referenceJaliDesign: ['Floral', 'Diamond'],
  referenceSurfaceDetail: ['Simple', 'Detailed'], referenceDetail: ['Light', 'Heavy'], referenceArch: ['Scalloped', 'Pointed'],
  referenceSides: ['Floral Jali', 'Solid Relief', 'Open'], referenceRoof: ['Ribbed Dome', 'Tapered Shikhar'],
}
const NUMERIC_RANGES = {
  referenceSurfaceVersion: [1, 2], referenceCutDepth: [1, 12], referenceBaseRatio: [.08, .25], referenceRoofRatio: [.18, .38], referenceDrawerCount: [0, 2],
  drawerCount: [0, 8], jaliDensity: [3, 10], motifScale: [.5, 2], reliefDepth: [2, 20], width: [400, 6000], depth: [250, 3000],
  height: [600, 6000], pillars: [0, 6], pillarThickness: [.01, 1000], roofHeight: [120, 6000], baseHeight: [0, 6000],
  platformLevels: [1, 3], platformHeight: [0, 6000], brightness: [0, 3], ceiling: [.01, 10000], availableWidth: [.01, 10000], availableDepth: [.01, 10000],
}

function fail(message) { throw Object.assign(new Error(message), { status: 400 }) }
export function validateStoredDesign(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Send a complete design configuration.')
  const keys = Object.keys(input)
  if (keys.length !== ALLOWED_KEYS.size || keys.some((key) => !ALLOWED_KEYS.has(key))) fail('The design configuration is incomplete or contains unsupported fields.')
  for (const key of Object.keys(ENUMS)) if (!ENUMS[key].includes(input[key])) fail(`Unsupported design value: ${key}.`)
  for (const zone of ZONES) {
    if (!['None', 'Light', 'Normal', 'Heavy', 'Intricate'].includes(input[`${zone}Carving`])) fail(`Unsupported ${zone} carving.`)
    if (!['Floral', 'Lotus', 'Vine', 'Geometric', 'Scallop'].includes(input[`${zone}Pattern`])) fail(`Unsupported ${zone} pattern.`)
    if (!['None', 'Border', 'Motif', 'Full'].includes(input[`${zone}Inlay`])) fail(`Unsupported ${zone} inlay.`)
    if (!['None', 'Gold', 'Red', 'Green', 'Blue'].includes(input[`${zone}Paint`])) fail(`Unsupported ${zone} paint.`)
  }
  for (const surface of SURFACES) {
    if (!['Plain', 'Carved', 'Inlay'].includes(input[`reference${surface}Treatment`])) fail(`Unsupported reference ${surface} treatment.`)
    if (!['Floral', 'Lotus'].includes(input[`reference${surface}Pattern`])) fail(`Unsupported reference ${surface} pattern.`)
  }
  for (const key of ['materialPillars', 'materialPlatform', 'materialBack', 'materialBase', 'materialRoof', 'materialDecorative']) {
    if (!['Inherit', 'White', 'Green', 'Pink', 'Beige', 'Black'].includes(input[key])) fail(`Unsupported material assignment: ${key}.`)
  }
  for (const key of ['kalash', 'dimensions']) if (typeof input[key] !== 'boolean') fail(`${key} must be a boolean.`)
  for (const [key, [min, max]] of Object.entries(NUMERIC_RANGES)) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < min || input[key] > max) fail(`${key} is outside the supported range.`)
  }
  for (const key of ['referenceSurfaceVersion', 'referenceDrawerCount', 'drawerCount', 'jaliDensity', 'pillars', 'platformLevels']) {
    if (!Number.isInteger(input[key])) fail(`${key} must be a whole number.`)
  }
  for (const key of ['width', 'depth', 'height', 'roofHeight', 'baseHeight', 'pillarThickness', 'platformHeight', 'brightness', 'ceiling', 'availableWidth', 'availableDepth']) {
    if (input[key] === undefined) fail(`Missing design field: ${key}.`)
  }
  if (typeof input.requirements !== 'string' || input.requirements.length > 4000) fail('Design requirements must be text of up to 4,000 characters.')
  if (![0, 2, 4, 6].includes(input.pillars)) fail('Unsupported pillar count.')
  if (input.pillars !== 0 && (input.pillarThickness * 1.4 > input.width * .2 || input.pillarThickness * 1.4 > input.depth * .28)) fail('Pillar capitals exceed the supported envelope.')
  if (input.pillars !== 0 && input.pillars * input.pillarThickness > input.width * .65) fail('The pillars exceed the supported width envelope.')
  if (input.height - input.roofHeight - input.baseHeight - 70 < 250) fail('The design leaves insufficient shrine height.')
  if (input.platformHeight + 150 > input.height - input.roofHeight - input.baseHeight - 70) fail('The platform leaves insufficient shrine height.')
  if (input.height > input.ceiling || input.width > input.availableWidth || input.depth > input.availableDepth) fail('The design exceeds the supplied installation space.')
  if (input.pillars > 0 && input.pillars * input.pillarThickness > input.width * .65) fail('The pillars leave insufficient clear width.')
  if (input.baseHeight > 0 && input.baseHeight < 80) fail('A raised base must be at least 80 mm.')
  if (input.baseHeight === 0 && input.storage !== 'None') fail('Zero-height base requires storage to be disabled.')
  if (input.storage !== 'Drawers' && input.drawerCount !== 0) fail('Drawer count must be zero when drawers are disabled.')
  if (['Drawers', 'Cabinet'].includes(input.storage) && input.baseHeight < 250) fail('Storage base is below the supported minimum.')
  if (input.installation === 'Cabinet' && input.baseHeight < 250) fail('Cabinet installation requires at least 250 mm base height.')
  if (input.installation === 'Wall' && !['None', 'Solid'].includes(input.storage)) fail('Wall installation is incompatible with floor storage.')
  const drawerColumns = input.drawerLayout === 'Stacked' ? 1 : input.drawerLayout === 'Grid' ? Math.min(2, input.drawerCount) : input.drawerCount
  const drawerRows = Math.ceil(input.drawerCount / Math.max(1, drawerColumns))
  if (input.drawerCount > 0 && ((input.width - 90) / drawerColumns < 160 || (input.baseHeight - 90) / drawerRows < 70)) fail('Drawer layout is below supported face dimensions.')
  if (input.pillars > 0 && [input.pillarsCarving, input.pillarsInlay, input.pillarsPaint].some((value) => value !== 'None') && .51 * input.pillarThickness + 1.2 * input.reliefDepth + 2 > .14 * input.depth) fail('Pillar ornament exceeds available depth.')
  return structuredClone(input)
}

const hash = (value) => createHash('sha256').update(value).digest('hex')
const secret = () => randomBytes(32).toString('base64url')
function isSecretMatch(value, storedHash) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value) || typeof storedHash !== 'string') return false
  const actual = Buffer.from(hash(value), 'hex')
  const expected = Buffer.from(storedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
function publicDesign(record) {
  const config = { ...record.config, requirements: '' }
  return { name: record.name, createdAt: record.createdAt, updatedAt: record.updatedAt, config }
}
const designKey = (id) => `design:${id}`
const shareKey = (tokenHash) => `share:${tokenHash}`

export function createDesignHandler({ store, now = () => new Date(), customerAccess = null }) {
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } })
  const requests = new Map()
  const getDesign = async (id) => {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return null
    return (await store.get(designKey(id), { type: 'json' })) || null
  }
  const authorize = (record, ownerSecret) => record && isSecretMatch(ownerSecret, record.ownerHash)
  const metadataFor = (id, customer) => customer && id ? customerAccess.repository.findDesign(id, customer.id) : null
  const saveMetadata = (record, customer, previous = null) => customerAccess.repository.saveDesign({
    id: record.id,
    customer_id: customer.id,
    legacy_design_id: previous?.legacy_design_id || null,
    design_name: record.name,
    design_configuration: record.config,
    storage_reference: `netlify-blobs://${customerAccess.storeName || 'bharadwaj-mandir-designs'}/design:${record.id}`,
    share_token_hash: record.shareHash || null,
    share_expires_at: record.shareExpiresAt || null,
    created_at: previous?.created_at || record.createdAt,
    updated_at: record.updatedAt,
  })
  const linkVerifiedLegacy = async (record, customer) => {
    const linked = { ...record, customerProfileId: customer.id }
    const metadata = await saveMetadata(linked, customer, { legacy_design_id: record.id, created_at: record.createdAt })
    await store.set(designKey(record.id), JSON.stringify(linked))
    return { record: linked, metadata }
  }
  return async function handler(request, context = {}) {
    if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Use GET or POST.' })
    const origin = request.headers.get('origin')
    if (origin) { try { if (new URL(origin).origin !== new URL(request.url).origin) return json(403, { error: 'This request could not be accepted.' }) } catch { return json(403, { error: 'This request could not be accepted.' }) } }
    let body = {}
    if (request.method === 'POST') {
      if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json(415, { error: 'Send a JSON request.' })
      const contentLength = Number(request.headers.get('content-length') || 0)
      if (contentLength > MAX_DESIGN_BODY_BYTES) return json(413, { error: 'The design request is too large.' })
      const reader = request.body?.getReader()
      const chunks = []; let received = 0
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          received += value.byteLength
          if (received > MAX_DESIGN_BODY_BYTES) { await reader.cancel(); return json(413, { error: 'The design request is too large.' }) }
          chunks.push(Buffer.from(value))
        }
      }
      const raw = Buffer.concat(chunks).toString('utf8')
      try { body = JSON.parse(raw) } catch { return json(400, { error: 'The design request could not be read.' }) }
    }
    try {
      const ip = context.ip || request.headers.get('x-nf-client-connection-ip') || 'unknown'
      const window = Math.floor(now().getTime() / 60_000)
      const rate = requests.get(ip)
      if (rate?.window === window && rate.count >= 40) return json(429, { error: 'Please wait before making more design changes.' })
      requests.set(ip, { window, count: rate?.window === window ? rate.count + 1 : 1 })
      if (requests.size > 1000) for (const [key, value] of requests) if (value.window < window - 1) requests.delete(key)
      const query = new URL(request.url).searchParams
      const operation = request.method === 'POST' ? body.operation : query.get('operation')
      const customer = customerAccess && operation !== 'read-share' ? await customerAccess.getCustomer(request) : null
      if (customerAccess && operation === 'save' && !customer && !body.ownerSecret && !body.id) return json(401, { error: 'Please log in to save designs to your account.' })
      if (operation === 'list') {
        if (!customer) return json(401, { error: 'Please log in to view your saved designs.' })
        const rows = await customerAccess.repository.listDesigns(customer.id)
        const designs = rows.map((row) => ({
          id: row.id, name: row.design_name, createdAt: row.created_at, updatedAt: row.updated_at,
          hasShare: Boolean(row.share_token_hash), customerOwned: true, config: row.design_configuration,
        }))
        return json(200, { designs })
      }
      if (operation === 'read-share') {
        const token = request.method === 'POST' ? body.token : query.get('token')
        if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return json(404, { error: 'This share link is invalid or has been revoked.' })
        const link = await store.get(shareKey(hash(token)), { type: 'json' })
        const record = link && await getDesign(link.designId)
        if (!record || record.shareHash !== hash(token) || Date.parse(record.shareExpiresAt || '') <= now().getTime()) return json(404, { error: 'This share link is invalid, expired or has been revoked.' })
        return json(200, { design: publicDesign(record) })
      }
      const id = request.method === 'POST' ? body.id : query.get('id')
      const ownerSecret = request.method === 'POST' ? body.ownerSecret : query.get('ownerSecret')
      if (request.method === 'POST' && operation === 'load') {
        let record = await getDesign(id)
        let owned = await metadataFor(id, customer)
        if (record && customer && !owned && authorize(record, ownerSecret)) {
          const linked = await linkVerifiedLegacy(record, customer)
          record = linked.record
          owned = linked.metadata
        } else if (record && customer && !owned && record.customerProfileId === customer.id) {
          owned = await saveMetadata(record, customer, { legacy_design_id: record.id, created_at: record.createdAt })
        }
        if (!authorize(record, ownerSecret) && !owned) return json(404, { error: 'Saved design not found.' })
        const source = record || (owned && { id, name: owned.design_name, createdAt: owned.created_at, updatedAt: owned.updated_at, config: owned.design_configuration, shareHash: owned.share_token_hash })
        return json(200, { design: { id, name: source.name, createdAt: source.createdAt, updatedAt: source.updatedAt, hasShare: Boolean(source.shareHash), customerOwned: Boolean(owned), config: source.config } })
      }
      if (request.method === 'GET') return json(405, { error: 'Use POST for design operations.' })
      if (operation === 'save' || operation === 'rename') {
        const targetId = id || (customer ? body.clientDesignId : null)
        if (!id && body.clientDesignId && !/^[0-9a-f-]{36}$/i.test(body.clientDesignId)) return json(400, { error: 'The design request could not be read.' })
        const isUpdate = Boolean(id)
        const record = targetId && await getDesign(targetId)
        const existingMetadata = targetId ? await metadataFor(targetId, customer) : null
        if (targetId && customer && !existingMetadata && customerAccess && operation === 'save' && !id && record && record.customerProfileId !== customer.id) return json(404, { error: 'Saved design not found.' })
        if (targetId && customer && !existingMetadata && !id && customerAccess?.repository.findDesignById) {
          const otherOwner = await customerAccess.repository.findDesignById(targetId)
          if (otherOwner && otherOwner.customer_id !== customer.id) return json(404, { error: 'Saved design not found.' })
        }
        const customerAuthorized = Boolean(existingMetadata || (record?.customerProfileId && record.customerProfileId === customer?.id))
        const verifiedLegacyOwner = Boolean(customer && record && authorize(record, ownerSecret))
        if (isUpdate && !authorize(record, ownerSecret) && !customerAuthorized) return json(404, { error: 'Saved design not found.' })
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        if (!name || name.length > 80) return json(400, { error: 'Design name must be 1 to 80 characters.' })
        const prior = record || (existingMetadata && { id, name: existingMetadata.design_name, createdAt: existingMetadata.created_at, updatedAt: existingMetadata.updated_at, config: existingMetadata.design_configuration, ownerHash: null, shareHash: existingMetadata.share_token_hash, shareExpiresAt: existingMetadata.share_expires_at })
        const config = operation === 'rename' ? prior.config : validateStoredDesign(body.config)
        const timestamp = now().toISOString()
        const customerAuthorizedForWrite = customerAuthorized || verifiedLegacyOwner
        const customerId = customer && (!id || customerAuthorizedForWrite) ? (targetId || randomUUID()) : null
        const saved = { id: customerId || id || randomUUID(), name, config, createdAt: prior?.createdAt || timestamp, updatedAt: timestamp, ownerHash: prior?.ownerHash || hash(secret()), shareHash: prior?.shareHash || null, ...(prior?.shareExpiresAt !== undefined ? { shareExpiresAt: prior.shareExpiresAt } : {}), ...(customer && (!id || customerAuthorizedForWrite) ? { customerProfileId: customer.id } : (prior?.customerProfileId ? { customerProfileId: prior.customerProfileId } : {})) }
        const restoringBlob = Boolean(customerAuthorized && !record && existingMetadata)
        const issuedSecret = prior && !restoringBlob ? null : secret()
        if (issuedSecret) saved.ownerHash = hash(issuedSecret)
        if (customer && (customerAuthorizedForWrite || !id)) await saveMetadata(saved, customer, existingMetadata || (verifiedLegacyOwner ? { legacy_design_id: id, created_at: record.createdAt } : null))
        await store.set(designKey(saved.id), JSON.stringify(saved))
        return json(200, { design: { id: saved.id, name: saved.name, createdAt: saved.createdAt, updatedAt: saved.updatedAt, hasShare: Boolean(saved.shareHash), ...(customer && (customerAuthorizedForWrite || !id) ? { customerOwned: true } : {}), config: saved.config }, ...(issuedSecret ? { ownerSecret: issuedSecret } : {}) })
      }
      let record = await getDesign(id)
      let owned = await metadataFor(id, customer)
      if (record && customer && !owned && ['duplicate', 'delete', 'share', 'revoke'].includes(operation) && authorize(record, ownerSecret)) {
        const linked = await linkVerifiedLegacy(record, customer)
        record = linked.record
        owned = linked.metadata
      } else if (record && customer && !owned && record.customerProfileId === customer.id) {
        owned = await saveMetadata(record, customer, { legacy_design_id: record.id, created_at: record.createdAt })
      }
      if (!authorize(record, ownerSecret) && !owned) return json(404, { error: 'Saved design not found.' })
      const source = record || (owned && { id, name: owned.design_name, createdAt: owned.created_at, updatedAt: owned.updated_at, config: owned.design_configuration, ownerHash: null, shareHash: owned.share_token_hash, shareExpiresAt: owned.share_expires_at })
      if (operation === 'duplicate') {
        const requestedId = body.clientDesignId
        if (customer && requestedId && !/^[0-9a-f-]{36}$/i.test(requestedId)) return json(400, { error: 'The design request could not be read.' })
        if (customer && requestedId) {
          const duplicateMetadata = await customerAccess.repository.findDesign(requestedId, customer.id)
          if (duplicateMetadata) {
            let duplicateRecord = await getDesign(requestedId)
            let ownerToken
            if (!duplicateRecord) {
              ownerToken = secret()
              duplicateRecord = {
                id: requestedId,
                name: duplicateMetadata.design_name,
                config: duplicateMetadata.design_configuration,
                createdAt: duplicateMetadata.created_at,
                updatedAt: duplicateMetadata.updated_at,
                ownerHash: hash(ownerToken),
                shareHash: duplicateMetadata.share_token_hash,
                shareExpiresAt: duplicateMetadata.share_expires_at,
                customerProfileId: customer.id,
              }
              await store.set(designKey(requestedId), JSON.stringify(duplicateRecord))
            }
            return json(200, { design: { id: requestedId, name: duplicateRecord.name, createdAt: duplicateRecord.createdAt, updatedAt: duplicateRecord.updatedAt, hasShare: Boolean(duplicateRecord.shareHash), customerOwned: true, config: duplicateRecord.config }, ...(ownerToken ? { ownerSecret: ownerToken } : {}) })
          }
          const duplicateRecord = await getDesign(requestedId)
          if (duplicateRecord && duplicateRecord.customerProfileId !== customer.id) return json(404, { error: 'Saved design not found.' })
          const otherOwner = customerAccess.repository.findDesignById && await customerAccess.repository.findDesignById(requestedId)
          if (otherOwner && otherOwner.customer_id !== customer.id) return json(404, { error: 'Saved design not found.' })
        }
        const timestamp = now().toISOString(); const ownerToken = secret()
        const copy = { ...source, id: (customer && body.clientDesignId) || randomUUID(), name: `${source.name} copy`, createdAt: timestamp, updatedAt: timestamp, ownerHash: hash(ownerToken), shareHash: null, ...(customer ? { shareExpiresAt: null, customerProfileId: customer.id } : {}) }
        if (customer) await saveMetadata(copy, customer)
        await store.set(designKey(copy.id), JSON.stringify(copy))
        return json(200, { design: { id: copy.id, name: copy.name, createdAt: timestamp, updatedAt: timestamp, hasShare: false, ...(customer ? { customerOwned: true } : {}), config: copy.config }, ownerSecret: ownerToken })
      }
      if (operation === 'delete') {
        if (source.shareHash) await store.delete(shareKey(source.shareHash))
        await store.delete(designKey(id))
        if (owned) await customerAccess.repository.deleteDesign(id, customer.id)
        return json(200, { deleted: true })
      }
      if (operation === 'share') {
        if (source.shareHash) await store.delete(shareKey(source.shareHash))
        const token = secret(); const tokenHash = hash(token)
        const expiresAt = new Date(now().getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
        const updated = { ...source, shareHash: tokenHash, shareExpiresAt: expiresAt, updatedAt: now().toISOString() }
        await store.set(designKey(id), JSON.stringify(updated))
        await store.set(shareKey(tokenHash), JSON.stringify({ designId: id, expiresAt }))
        if (owned) await saveMetadata(updated, customer, owned)
        return json(200, { token, expiresAt })
      }
      if (operation === 'revoke') {
        if (source.shareHash) await store.delete(shareKey(source.shareHash))
        const updated = { ...source, shareHash: null, shareExpiresAt: null, updatedAt: now().toISOString() }
        await store.set(designKey(id), JSON.stringify(updated))
        if (owned) await saveMetadata(updated, customer, owned)
        return json(200, { revoked: true })
      }
      return json(400, { error: 'Unknown design operation.' })
    } catch (error) {
      return json(Number.isInteger(error?.status) ? error.status : 500, { error: Number.isInteger(error?.status) ? error.message : 'Design storage is temporarily unavailable.' })
    }
  }
}
