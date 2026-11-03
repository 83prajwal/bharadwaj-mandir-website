import { jsPDF } from 'jspdf'

const MAROON = [83, 18, 32]
const GOLD = [181, 135, 57]
const INK = [54, 47, 42]
const MUTED = [112, 101, 91]
const PAGE_TITLE = 'DESIGN SPECIFICATION — FOR QUOTATION PURPOSES'
const DISCLAIMER = 'This document describes a visual design concept. Final dimensions, materials, structural feasibility, manufacturing details and pricing are subject to review and confirmation by Bharadwaj Mandir.'

const labelFor = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
const valueFor = (value) => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '—')

export function createSpecificationPdf({ name, designId = '', entries, previewDataUrl = '', customerRequirements = '' }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 18
  const contentWidth = pageWidth - margin * 2
  const bottom = pageHeight - 23
  let y = 0

  const setColor = (method, color) => doc[method](...color)
  const header = (firstPage = false) => {
    doc.setFillColor(250, 247, 241)
    doc.rect(0, 0, pageWidth, 34, 'F')
    setColor('setTextColor', MAROON)
    doc.setFont('times', 'bold'); doc.setFontSize(15)
    doc.text('BHARADWAJ MANDIR', margin, 15)
    setColor('setDrawColor', GOLD); doc.setLineWidth(.5); doc.line(margin, 20, pageWidth - margin, 20)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(firstPage ? 9 : 8)
    doc.text(PAGE_TITLE, margin, 28)
    y = firstPage ? 41 : 42
  }

  const footer = () => {
    setColor('setDrawColor', GOLD); doc.setLineWidth(.25); doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16)
    setColor('setTextColor', MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text('PROVISIONAL DESIGN · SUBJECT TO REVIEW', margin, pageHeight - 10)
    doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, pageWidth - margin, pageHeight - 10, { align: 'right' })
  }

  const newPage = () => { footer(); doc.addPage(); header() }
  const ensure = (height) => { if (y + height > bottom) newPage() }
  const section = (title) => {
    ensure(12)
    y += 3; setColor('setTextColor', MAROON); doc.setFont('times', 'bold'); doc.setFontSize(13)
    doc.text(title, margin, y); y += 2
    setColor('setDrawColor', GOLD); doc.setLineWidth(.35); doc.line(margin, y, pageWidth - margin, y); y += 5
  }

  const row = (label, value) => {
    const labelWidth = 52
    const valueWidth = contentWidth - labelWidth - 3
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
    const leftLines = doc.splitTextToSize(label, labelWidth)
    doc.setFont('helvetica', 'normal')
    const rightLines = doc.splitTextToSize(valueFor(value), valueWidth)
    const lineCount = Math.max(leftLines.length, rightLines.length)
    let offset = 0
    while (offset < lineCount) {
      if (bottom - y < 8) newPage()
      const availableLines = Math.max(1, Math.floor((bottom - y - 2) / 4.1))
      const count = Math.min(availableLines, lineCount - offset)
      const currentLeft = offset === 0 ? leftLines.slice(offset, offset + count) : ['(continued)']
      const currentRight = rightLines.slice(offset, offset + count)
      const height = Math.max(6, count * 4.1 + 2)
      setColor('setTextColor', MUTED); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
      doc.text(currentLeft, margin, y)
      setColor('setTextColor', INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
      doc.text(currentRight, margin + labelWidth + 3, y)
      y += height
      setColor('setDrawColor', [232, 224, 213]); doc.setLineWidth(.15); doc.line(margin, y - 1, pageWidth - margin, y - 1)
      offset += count
      if (offset < lineCount) newPage()
    }
  }

  header(true)
  setColor('setTextColor', MAROON); doc.setFont('times', 'normal'); doc.setFontSize(25)
  const safeName = String(name || 'Mandir design').slice(0, 100)
  const nameLines = doc.splitTextToSize(safeName, contentWidth)
  doc.text(nameLines, margin, y + 3); y += nameLines.length * 10 + 5
  if (designId) { setColor('setTextColor', MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(`Design ID: ${String(designId).slice(0, 80)}`, margin, y); y += 6 }

  if (previewDataUrl) {
    const maxHeight = 75
    const imageHeight = Math.min(maxHeight, maxHeight * (contentWidth / 174))
    ensure(imageHeight + 8)
    try { doc.addImage(previewDataUrl, 'JPEG', margin, y, contentWidth, imageHeight, undefined, 'FAST'); y += imageHeight + 5 } catch { /* The written specification remains complete without a preview image. */ }
  }

  const groups = [
    ['Dimensions and installation', ['width', 'depth', 'height', 'installation', 'availableWidth', 'availableDepth', 'ceiling']],
    ['Design and structure', ['style', 'pillars', 'pillarShape', 'pillarProfile', 'pillarThickness', 'roof', 'roofHeight', 'kalash']],
    ['Base, storage and platform', ['baseHeight', 'storage', 'drawerCount', 'drawerLayout', 'drawerHandle', 'platformLevels', 'platformHeight', 'backPanel', 'sides', 'doors']],
    ['Marble and component materials', ['material', 'finish', 'materialPillars', 'materialPlatform', 'materialBack', 'materialBase', 'materialRoof', 'materialDecorative']],
    ['Carving, inlay, paint and jali', ['backCarving', 'backPattern', 'backInlay', 'backPaint', 'pillarsCarving', 'pillarsPattern', 'pillarsInlay', 'pillarsPaint', 'roofCarving', 'roofPattern', 'roofInlay', 'roofPaint', 'baseCarving', 'basePattern', 'baseInlay', 'basePaint', 'platformCarving', 'platformPattern', 'platformInlay', 'platformPaint', 'sidesCarving', 'sidesPattern', 'sidesInlay', 'sidesPaint', 'doorsCarving', 'doorsPattern', 'doorsInlay', 'doorsPaint', 'jaliPattern', 'jaliDensity', 'inlayColor', 'reliefDepth', 'motifScale']],
    ['Lighting', ['lighting', 'brightness']],
  ]
  const entryMap = new Map(entries || [])
  for (const [heading, keys] of groups) {
    const rows = keys.filter((key) => entryMap.has(key))
    if (!rows.length) continue
    section(heading)
    for (const key of rows) {
      const dimensionKeys = ['width', 'depth', 'height', 'baseHeight', 'roofHeight', 'pillarThickness', 'platformHeight', 'ceiling', 'availableWidth', 'availableDepth']
      const value = dimensionKeys.includes(key) ? `${valueFor(entryMap.get(key))} mm` : entryMap.get(key)
      row(labelFor(key), value)
    }
  }

  if (customerRequirements.trim()) {
    section('Additional requirements')
    row('Customer requirements', customerRequirements.trim().slice(0, 4000))
  }
  section('Quotation review')
  const disclaimerLines = doc.splitTextToSize(DISCLAIMER, contentWidth)
  const disclaimerHeight = disclaimerLines.length * 4.2 + 7
  ensure(disclaimerHeight)
  doc.setFillColor(250, 247, 241); doc.rect(margin, y, contentWidth, disclaimerHeight, 'F')
  setColor('setDrawColor', GOLD); doc.setLineWidth(.5); doc.rect(margin, y, contentWidth, disclaimerHeight)
  setColor('setTextColor', INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  doc.text(disclaimerLines, margin + 4, y + 6); y += disclaimerHeight + 3
  footer()
  const totalPages = doc.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    setColor('setTextColor', MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' })
  }
  return doc
}

export function safePdfFilename(name) {
  const stem = String(name || 'mandir-design').normalize('NFKD').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60)
  return `${stem || 'mandir-design'}-quotation-specification.pdf`
}
