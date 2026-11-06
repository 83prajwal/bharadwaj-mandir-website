import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { activeConfigEntries, defaults, normalizeConfig, validate } from './mandir-studio/lib/config.ts'
import DetailStudio from './mandir-studio/components/DetailStudio.tsx'
import { brandedCanvas } from './mandir-studio/lib/export-branding.ts'
import { createSpecificationPdf, safePdfFilename } from './mandir-studio/lib/specification-pdf.mjs'
import './mandir-designer.css'

const MandirViewer = lazy(() => import('./mandir-studio/components/MandirViewer.tsx'))
const SAVE_KEY = 'bharadwaj-mandir-local-designs-v1'
const DESIGN_API = '/.netlify/functions/designs'
const TABS = ['Structure', 'Marble', 'Components', 'Carving & inlay', 'Your space']
const MATERIALS = ['White', 'Green', 'Pink', 'Beige', 'Black']

async function designApi(body) {
  const response = await fetch(DESIGN_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  let result
  try { result = await response.json() }
  catch { throw new Error('The design service is unavailable. For local share links, start the site with npm run dev:netlify -- --offline.') }
  if (!response.ok) throw new Error(result.error || 'Design storage is temporarily unavailable.')
  return result
}

function storeSavedDesigns(designs) { localStorage.setItem(SAVE_KEY, JSON.stringify(designs.slice(0, 30))) }
function displayDate(value) { const parsed = Date.parse(value || ''); return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString() : 'Date unavailable' }

function readSavedDesigns() {
  try {
    const value = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]')
    return Array.isArray(value) ? value.filter((entry) => entry && entry.config && typeof entry.name === 'string') : []
  } catch {
    return []
  }
}

function SelectField({ label, value, options, onChange }) {
  return <label className="mandir-studio-field">{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
}

function NumberField({ label, value, unit, onChange, min = 0, max = 6000 }) {
  return <label className="mandir-studio-field">{label}<span className="mandir-studio-number"><input type="number" min={min} max={max} step="any" value={value} onChange={(event) => onChange(Number(event.target.value))} /><small>{unit}</small></span></label>
}

export default function MandirDesigner() {
  const navigate = useNavigate()
  const [config, setConfig] = useState(() => {
    try {
      const draft = localStorage.getItem('bm-designer-draft-v1')
      return draft ? normalizeConfig({ ...JSON.parse(draft), designFamily: 'Parametric' }) : { ...defaults, designFamily: 'Parametric' }
    } catch { return { ...defaults, designFamily: 'Parametric' } }
  })
  const [tab, setTab] = useState(0)
  const [unit, setUnit] = useState('mm')
  const [saved, setSaved] = useState(readSavedDesigns)
  const [designName, setDesignName] = useState('My mandir design')
  const [loadedId, setLoadedId] = useState('')
  const [status, setStatus] = useState('')
  const [sharedReadOnly, setSharedReadOnly] = useState(() => Boolean(window.location.hash.match(/^#share=/)))
  const [sharedLoaded, setSharedLoaded] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [shareUrlDesignId, setShareUrlDesignId] = useState('')
  const conflicts = useMemo(() => validate(config), [config])

  useEffect(() => {
    const match = window.location.hash.match(/^#share=([A-Za-z0-9_-]{43})$/)
    if (!match) return
    designApi({ operation: 'read-share', token: match[1] }).then(({ design }) => {
      setConfig({ ...normalizeConfig(design.config), designFamily: 'Parametric' })
      setDesignName(design.name)
      setSharedLoaded(true)
      setStatus('Read-only shared design. Load a copy to edit it.')
    }).catch((error) => setStatus(error.message))
  }, [])

  useEffect(() => {
    try { localStorage.setItem('bm-designer-draft-v1', JSON.stringify(config)) } catch { /* Saving a draft is best effort. */ }
  }, [config])

  function update(key, value) {
    setConfig((current) => {
      const next = { ...current, [key]: value }
      // Wall-mounted mandirs cannot use floor storage. Clear it as part of
      // the installation change so the preview remains renderable.
      if (key === 'installation' && value === 'Wall' && !['None', 'Solid'].includes(next.storage)) {
        next.storage = 'None'
        next.drawerCount = 0
      }
      if (key === 'storage' && value !== 'Drawers') next.drawerCount = 0
      if (key === 'drawerCount') next.storage = Number(value) === 0 ? 'None' : 'Drawers'
      return next
    })
  }

  function replace(next) {
    setConfig({ ...normalizeConfig(next), designFamily: 'Parametric' })
  }

  async function persistDesign(nextConfig, name, forceNew = false) {
    if (validate(nextConfig).length) { setStatus('Resolve the design checks before saving.'); return '' }
    const existing = forceNew ? null : saved.find((item) => item.id === loadedId)
    const cleanName = name.trim() || 'Mandir design'
    try {
      const result = await designApi({ operation: 'save', id: existing?.ownerSecret ? existing.id : undefined, ownerSecret: existing?.ownerSecret, name: cleanName, config: nextConfig })
      const entry = { ...result.design, ownerSecret: result.ownerSecret || existing?.ownerSecret, config: nextConfig }
      const next = [entry, ...saved.filter((item) => item.id !== entry.id && item.id !== existing?.id)]
      storeSavedDesigns(next); setSaved(next); setLoadedId(entry.id)
      setStatus('Design saved securely. This browser holds its private management key.')
      return entry.id
    } catch (error) {
      const id = existing?.id || `local-${crypto.randomUUID()}`
      const timestamp = new Date().toISOString()
      const entry = { ...existing, id, name: cleanName, createdAt: existing?.createdAt || timestamp, updatedAt: timestamp, config: nextConfig, localOnly: true }
      const next = [entry, ...saved.filter((item) => item.id !== id)]
      try { storeSavedDesigns(next); setSaved(next); setLoadedId(id); setStatus(`Server save unavailable; kept this browser copy. ${error.message}`); return id }
      catch { setStatus('This browser could not save the design. Check available local storage.'); return '' }
    }
  }

  async function duplicateDesign(sourceOverride) {
    const source = sourceOverride || saved.find((item) => item.id === loadedId)
    if (sourceOverride?.ownerSecret) {
      try {
        const result = await designApi({ operation: 'duplicate', id: source.id, ownerSecret: source.ownerSecret })
        const entry = { ...result.design, ownerSecret: result.ownerSecret }
        const next = [entry, ...saved]
        storeSavedDesigns(next); setSaved(next); setLoadedId(entry.id); setDesignName(entry.name); setConfig(normalizeConfig(entry.config)); setStatus('A separate saved copy was created.')
        return
      } catch (error) { setStatus(error.message); return }
    }
    const name = `${(sourceOverride?.name || designName).trim() || 'Mandir design'} copy`
    const id = await persistDesign(sourceOverride?.config || config, name, true)
    if (id) setDesignName(name)
  }

  async function loadDesign(id) {
    const entry = saved.find((item) => item.id === id)
    if (!entry) return
    try {
      const remote = entry.ownerSecret ? await designApi({ operation: 'load', id, ownerSecret: entry.ownerSecret }) : null
      replace(remote?.design.config || entry.config)
      setDesignName(remote?.design.name || entry.name); setLoadedId(id)
      setStatus(`Loaded “${entry.name}”.`)
    } catch (error) { setStatus(error.message) }
  }

  async function renameDesign() {
    const entry = saved.find((item) => item.id === loadedId)
    const name = designName.trim()
    if (!entry) return
    if (!name || name.length > 80) { setStatus('Design name must be 1 to 80 characters.'); return }
    try {
      if (entry.ownerSecret) await designApi({ operation: 'rename', id: entry.id, ownerSecret: entry.ownerSecret, name })
      const next = saved.map((item) => item.id === loadedId ? { ...item, name, updatedAt: new Date().toISOString() } : item)
      storeSavedDesigns(next); setSaved(next); setStatus('Design renamed.')
    } catch (error) { setStatus(error.message) }
  }

  async function removeDesign(selectedOverride) {
    const selected = selectedOverride || saved.find((entry) => entry.id === loadedId)
    const deleteId = selected?.id || loadedId
    if (selected?.ownerSecret) {
      try { await designApi({ operation: 'delete', id: selected.id, ownerSecret: selected.ownerSecret }) }
      catch (error) { setStatus(error.message); return }
    }
    const next = saved.filter((entry) => entry.id !== deleteId)
    try { storeSavedDesigns(next); setSaved(next); if (loadedId === deleteId) setLoadedId(''); setStatus('Saved design removed.') }
    catch { setStatus('This browser could not update its saved designs.') }
  }

  async function shareDesign(entryOverride) {
    let entry = entryOverride || saved.find((item) => item.id === loadedId)
    const shareConfig = entryOverride ? entryOverride.config : config
    const shareName = entryOverride?.name || designName
    const replacedLocalId = entry && !entry.ownerSecret ? entry.id : ''
    if (entry?.localOnly) { setStatus('Share links require Netlify storage. Browser-only designs cannot be shared.'); return }
    const shareConflicts = validate(shareConfig)
    if (shareConflicts.length) { setStatus(`Cannot create a share link until these checks are resolved: ${shareConflicts.join(' ')}`); return }
    try {
      const save = await designApi({ operation: 'save', id: entry?.ownerSecret ? entry.id : undefined, ownerSecret: entry?.ownerSecret, name: shareName.trim() || 'Mandir design', config: shareConfig })
      entry = { ...save.design, ownerSecret: save.ownerSecret || entry?.ownerSecret, config: shareConfig }
      const { token } = await designApi({ operation: 'share', id: entry.id, ownerSecret: entry.ownerSecret })
      const next = [entry, ...saved.filter((item) => item.id !== entry.id && item.id !== replacedLocalId)]
      storeSavedDesigns(next); setSaved(next); setLoadedId(entry.id)
      const shareUrl = `${window.location.origin}/mandir-designer#share=${token}`
      setShareUrl(shareUrl); setShareUrlDesignId(entry.id)
      const shared = next.map((item) => item.id === entry.id ? { ...item, hasShare: true } : item)
      storeSavedDesigns(shared); setSaved(shared)
      try { await navigator.clipboard.writeText(shareUrl); setStatus('Read-only share link copied.') }
      catch { setStatus('Read-only share link created. Copy it from the link field below.') }
    } catch (error) { setStatus(`Share link could not be created or copied: ${error.message}`) }
  }

  async function revokeShare(entry) {
    try {
      await designApi({ operation: 'revoke', id: entry.id, ownerSecret: entry.ownerSecret })
      const next = saved.map((item) => item.id === entry.id ? { ...item, hasShare: false } : item)
      storeSavedDesigns(next); setSaved(next); if (shareUrlDesignId === entry.id) { setShareUrl(''); setShareUrlDesignId('') }; setStatus('Share link revoked.')
    } catch (error) { setStatus(error.message) }
  }

  function loadSharedCopy() {
    setSharedReadOnly(false); window.history.replaceState(null, '', window.location.pathname); setLoadedId('')
    setStatus('A local copy is ready to customize. Save it to keep it in My Designs.')
  }
  async function downloadSpecification() {
    try {
      let previewDataUrl = ''
      const canvas = document.querySelector('.mandir-view canvas')
      if (canvas) previewDataUrl = brandedCanvas(canvas).toDataURL('image/jpeg', 0.9)
      const doc = createSpecificationPdf({ name: designName, designId: /^[a-f0-9-]{36}$/i.test(loadedId) ? loadedId : '', entries: activeConfigEntries(config), previewDataUrl, customerRequirements: config.requirements })
      doc.save(safePdfFilename(designName))
      setStatus('Branded quotation specification downloaded.')
    } catch { setStatus('The PDF could not be created. Please try again after the 3D preview has loaded.') }
  }

  async function printSpecification() {
    try {
      let previewDataUrl = ''
      const canvas = document.querySelector('.mandir-view canvas')
      if (canvas) previewDataUrl = brandedCanvas(canvas).toDataURL('image/jpeg', 0.9)
      const doc = createSpecificationPdf({ name: designName, designId: /^[a-f0-9-]{36}$/i.test(loadedId) ? loadedId : '', entries: activeConfigEntries(config), previewDataUrl, customerRequirements: config.requirements })
      const url = URL.createObjectURL(doc.output('blob'))
      const popup = window.open(url, '_blank', 'noopener,noreferrer')
      if (!popup) { URL.revokeObjectURL(url); setStatus('Allow the print tab to open, then use your browser print command.'); return }
      setStatus('Print-ready specification opened.')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch { setStatus('The print-ready specification could not be created. Please try again.') }
  }

  function requestQuotation() {
    navigate('/contact?interest=Project%20enquiry', {
      state: {
        designerQuote: true,
        designerConfig: config,
        designerName: designName,
        designerId: /^[a-f0-9-]{36}$/i.test(loadedId) ? loadedId : '',
        designerShareUrl: shareUrl,
      },
    })
  }

  function renderTab() {
    if (tab === 0) return <>
      <SelectField label="Installation type" value={config.installation} options={['Floor', 'Wall', 'Niche', 'Corner', 'Cabinet', 'Open', 'Storage']} onChange={(value) => update('installation', value)} />
      <SelectField label="Design style" value={config.style} options={['Traditional', 'Heritage', 'Minimal', 'Classical', 'Modern', 'Temple']} onChange={(value) => update('style', value)} />
      <div className="mandir-studio-field">Dimension unit<div className="mandir-studio-units">{['mm', 'in', 'ft'].map((value) => <button key={value} className={unit === value ? 'is-active' : ''} type="button" onClick={() => setUnit(value)}>{value}</button>)}</div></div>
      <div className="mandir-studio-grid">{[['width', 'Overall width'], ['depth', 'Overall depth'], ['height', 'Overall height'], ['baseHeight', 'Base height'], ['roofHeight', 'Roof height'], ['pillarThickness', 'Pillar thickness']].map(([key, label]) => {
        const factor = unit === 'in' ? 25.4 : unit === 'ft' ? 304.8 : 1
        return <NumberField key={key} label={label} unit={unit} value={Number((config[key] / factor).toFixed(3))} onChange={(value) => update(key, value * factor)} />
      })}</div>
      <SelectField label="Pillar count" value={String(config.pillars)} options={['0', '2', '4', '6']} onChange={(value) => update('pillars', Number(value))} />
      <SelectField label="Pillar shape" value={config.pillarShape} options={['Round', 'Square', 'Octagonal', 'Fluted Round']} onChange={(value) => update('pillarShape', value)} />
      <SelectField label="Pillar profile" value={config.pillarProfile} options={['Simple', 'Classical', 'Heavy', 'Fluted']} onChange={(value) => update('pillarProfile', value)} />
      <SelectField label="Roof type" value={config.roof} options={['Flat', 'Shikhar', 'Dome', 'Stepped', 'Cornice', 'Minimal']} onChange={(value) => update('roof', value)} />
      <label className="mandir-studio-check"><input type="checkbox" checked={config.kalash} onChange={(event) => update('kalash', event.target.checked)} /> Decorative kalash within roof height</label>
    </>
    if (tab === 1) return <>
      <p className="designer-viewer-note">Marble tones and finishes are illustrative. Commercial stone availability requires confirmation.</p>
      <div className="mandir-studio-swatches">{MATERIALS.map((material, index) => <button type="button" key={material} className={config.material === material ? 'is-active' : ''} onClick={() => update('material', material)}><span style={{ background: ['#eee9df', '#647c67', '#d7b6ac', '#cdbb9e', '#343536'][index] }} />{material}</button>)}</div>
      <SelectField label="Surface finish" value={config.finish} options={['Polished', 'Honed', 'Matte']} onChange={(value) => update('finish', value)} />
      {Object.entries({ materialPillars: 'Pillars', materialPlatform: 'Platform', materialBack: 'Back panel', materialBase: 'Base', materialRoof: 'Roof', materialDecorative: 'Decorative details' }).map(([key, label]) => <SelectField key={key} label={`${label} material`} value={config[key]} options={['Inherit', ...MATERIALS]} onChange={(value) => update(key, value)} />)}
    </>
    if (tab === 2) return <>
      <SelectField label="Back panel" value={config.backPanel} options={['Plain', 'Bookmatched', 'Jali']} onChange={(value) => update('backPanel', value)} />
      <SelectField label="Side panels" value={config.sides} options={['Open', 'Solid', 'Jali', 'Half']} onChange={(value) => update('sides', value)} />
      <SelectField label="Door type" value={config.doors} options={['None', 'Solid', 'Jali']} onChange={(value) => update('doors', value)} />
      <SelectField label="Platform levels" value={String(config.platformLevels)} options={['1', '2', '3']} onChange={(value) => update('platformLevels', Number(value))} />
      <NumberField label="Platform height" value={config.platformHeight} unit="mm" onChange={(value) => update('platformHeight', value)} />
      <SelectField label="Base construction" value={config.storage} options={['None', 'Solid', 'Drawers', 'Cabinet']} onChange={(value) => update('storage', value)} />
      {config.storage === 'Drawers' && <>
        <SelectField label="Drawer count" value={String(config.drawerCount)} options={['0', '1', '2', '3', '4', '5', '6', '7', '8']} onChange={(value) => update('drawerCount', Number(value))} />
        {config.drawerCount > 0 && <>
          <SelectField label="Drawer layout" value={config.drawerLayout} options={['Horizontal', 'Stacked', 'Grid']} onChange={(value) => update('drawerLayout', value)} />
          <SelectField label="Drawer handle" value={config.drawerHandle} options={['Bar', 'Knob', 'Recessed']} onChange={(value) => update('drawerHandle', value)} />
        </>}
      </>}
      <SelectField label="Lighting" value={config.lighting} options={['None', 'Top', 'Back', 'Platform', 'Multiple']} onChange={(value) => update('lighting', value)} />
      <label className="mandir-studio-field">Lighting brightness <input type="range" min="0" max="3" step="0.1" value={config.brightness} onChange={(event) => update('brightness', Number(event.target.value))} /><small>{config.brightness.toFixed(1)}</small></label>
    </>
    if (tab === 3) return <DetailStudio c={config} update={update} replace={replace} />
    return <>
      <NumberField label="Available ceiling height" value={config.ceiling} unit="mm" onChange={(value) => update('ceiling', value)} />
      <NumberField label="Installation width" value={config.availableWidth} unit="mm" onChange={(value) => update('availableWidth', value)} />
      <NumberField label="Installation depth" value={config.availableDepth} unit="mm" onChange={(value) => update('availableDepth', value)} />
      <label className="mandir-studio-field">Requirements<textarea rows="5" maxLength="4000" value={config.requirements} onChange={(event) => update('requirements', event.target.value)} placeholder="Describe the space, inspiration or design details for your enquiry." /></label>
      <button className="btn btn-primary mandir-studio-quote" type="button" onClick={requestQuotation}>Request a quotation →</button>
      <p className="designer-viewer-note">The existing enquiry page accepts reference images, drawings and PDFs. Pricing and final specifications are confirmed by the team.</p>
    </>
  }

  return (
    <main className="mandir-designer-page mandir-studio-page">
      <section className="mandir-designer-intro"><div className="mandir-designer-container"><p className="designer-kicker">Bharadwaj Mandir · 3D Studio</p><h1>Design your sanctuary.</h1><p className="designer-intro-copy">Explore the parametric design study. Dimensions and details are provisional until reviewed by the team.</p></div></section>
      <section className="mandir-designer-container mandir-studio-workspace" aria-label="Mandir design studio">
        {sharedReadOnly && <div className="mandir-shared-notice" role="status">{sharedLoaded ? <><strong>Read-only shared design: {designName}</strong><p>Review the design, or load a separate local copy to customize it.</p><button type="button" onClick={loadSharedCopy}>Load a copy into the configurator</button></> : <p>{status || 'Loading shared design…'}</p>}</div>}
        {!sharedReadOnly && <div className="mandir-studio-manage">
          <label className="mandir-studio-name">Design name<input value={designName} maxLength={80} onChange={(event) => setDesignName(event.target.value)} /></label>
          <button type="button" onClick={() => persistDesign(config, designName)}>Save design</button>
          <button type="button" onClick={duplicateDesign}>Duplicate</button>
          <button type="button" onClick={() => shareDesign()}>Create share link</button>
          <button type="button" className="mandir-studio-quote-action" onClick={requestQuotation}>Request a Quotation</button>
          <button type="button" onClick={downloadSpecification}>Download PDF</button>
          <button type="button" onClick={printSpecification}>Print specification</button>
          {loadedId && <button type="button" onClick={renameDesign}>Rename selected</button>}
          {loadedId && <button type="button" onClick={removeDesign}>Delete selected</button>}
          {status && <span className="mandir-studio-status" role="status">{status}</span>}
          {shareUrl && <label className="mandir-studio-share-url">Read-only share link<input aria-label="Read-only share link" value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(shareUrl); setStatus('Share link copied.') } catch { setStatus('Select and copy the share link from the field.') } }}>Copy link</button></label>}
          <div className="mandir-design-list" aria-label="My Designs">
            <h2>My Designs <span>{saved.length}</span></h2>
            {saved.length === 0 && <p className="designer-viewer-note">Saved designs appear here. They remain in this browser unless saved to Netlify storage.</p>}
            {saved.map((entry) => <article className="mandir-design-card" key={entry.id}>
              <div><strong>{entry.name}</strong><small>Created {displayDate(entry.createdAt || entry.updatedAt)} · Updated {displayDate(entry.updatedAt)}</small></div>
              <div className="mandir-design-card-actions">
                <button type="button" onClick={() => loadDesign(entry.id)}>Open</button>
                <button type="button" onClick={() => { setLoadedId(entry.id); setDesignName(entry.name) }}>Select</button>
                <button type="button" onClick={() => duplicateDesign(entry)}>Duplicate</button>
                {entry.ownerSecret && <button type="button" onClick={() => shareDesign(entry)}>Share</button>}
                {entry.ownerSecret && entry.hasShare && <button type="button" onClick={() => revokeShare(entry)}>Revoke link</button>}
                <button type="button" onClick={() => removeDesign(entry)}>Delete</button>
              </div>
              {entry.localOnly && <small>Browser-only copy · save again when Netlify storage is available</small>}
            </article>)}
          </div>
        </div>}
        <div className="mandir-studio-layout">
          {!sharedReadOnly && <aside className="mandir-studio-controls">
            <div className="mandir-studio-tabs" role="tablist" aria-label="Design options">{TABS.map((label, index) => <button key={label} id={`studio-tab-${index}`} role="tab" aria-selected={tab === index} aria-controls="studio-tab-panel" className={tab === index ? 'is-active' : ''} type="button" onClick={() => setTab(index)}>{label}</button>)}</div>
            <div id="studio-tab-panel" role="tabpanel" aria-labelledby={`studio-tab-${tab}`} className="mandir-studio-fields">{renderTab()}</div>
          </aside>}
          <div className="mandir-studio-preview-column">
            <div className="mandir-studio-preview-heading"><span>Live 3D preview</span><span>{sharedReadOnly ? 'Read-only share' : conflicts.length ? 'Dimensional review required' : 'Provisional concept'}</span></div>
            {(!sharedReadOnly || sharedLoaded) && <Suspense fallback={<div className="mandir-studio-viewer-fallback" role="status">Preparing the 3D studio…</div>}><MandirViewer config={config} /></Suspense>}
            {conflicts.length > 0 && !sharedReadOnly && <div className="mandir-studio-warnings" role="status"><strong>Preview paused — resolve these design checks:</strong><ul>{conflicts.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
            {(!sharedReadOnly || sharedLoaded) && <dl className="mandir-studio-summary">{activeConfigEntries(config).filter(([key]) => !key.startsWith('reference') && key !== 'requirements').map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, ' $1')}</dt><dd>{String(value)}</dd></div>)}</dl>}
          </div>
        </div>
        <p className="designer-viewer-note mandir-studio-disclaimer">Visual design study only. Dimensions are not fabrication or engineering approval. Indicative pricing is not available; price is confirmed on request.</p>
      </section>
    </main>
  )
}
