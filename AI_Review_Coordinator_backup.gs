/**
 * Bharadwaj Mandir AI Review coordinator.
 * Deploy as a Web App executing as the spreadsheet owner. Machine requests are
 * HMAC authenticated; human recovery is available only from the spreadsheet UI
 * and checks the signed-in Google account against a Script Properties allowlist.
 */
const AI_HEADERS = [
  'Netlify Submission ID', 'Processing Status', 'Scoring Method', 'Rubric Version',
  'Project Interest Level', 'Project Interest Evidence Fields', 'Message Specificity Level', 'Message Specificity Evidence Fields',
  'Dimensions Level', 'Dimensions Evidence Fields', 'Timeline Level', 'Timeline Evidence Fields',
  'Budget Level', 'Budget Evidence Fields', 'Delivery Preference Level', 'Delivery Preference Evidence Fields',
  'Readiness Score', 'Suggested Priority', 'Evidence-Based Rationale', 'Suggested Next Action',
  'Provider', 'Model', 'Processed At UTC', 'Human Review Status', 'Reviewed By', 'Reviewed At UTC', 'Safe Error Category',
]
const AUDIT_HEADERS = ['Submission ID', 'Authorized reviewer identity', 'Approval timestamp', 'Previous status', 'Recovery decision']
const REPLAY_HEADERS = ['Request Nonce', 'Signed Timestamp UTC', 'Accepted At UTC']
const AUDIT_TAB = 'AI Review Audit'
const REPLAY_TAB = 'AI Review Replay'
const LEGACY_AUDIT_TAB = 'AI Review Recovery Audit'
const LEGACY_REPLAY_TAB = 'AI Review Coordinator Replay'
const AUDIT_PROTECTION_DESCRIPTION = 'Bharadwaj Mandir AI Review Audit protection v1'
const REPLAY_PROTECTION_DESCRIPTION = 'Bharadwaj Mandir AI Review Replay protection v1'
const SAFE_ERRORS = ['INVALID_INPUT', 'SCORING_FAILED', 'STORAGE_FAILED', 'COORDINATOR_UNAVAILABLE', 'UNEXPECTED_INTERNAL_FAILURE']
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
const REPLAY_RETENTION_GRACE_MS = 60 * 1000
const REPLAY_RETENTION_MS = MAX_CLOCK_SKEW_MS * 2 + REPLAY_RETENTION_GRACE_MS
const CRITERIA = [
  { id: 'projectInterest', label: 'Project interest and relevance', weight: 25, fields: ['interest', 'buyerType'] },
  { id: 'specificity', label: 'Enquiry specificity', weight: 25, fields: ['message'] },
  { id: 'dimensions', label: 'Dimensions or space information', weight: 15, fields: ['dimensions'] },
  { id: 'timeline', label: 'Desired timeline', weight: 15, fields: ['timeline'] },
  { id: 'budget', label: 'Budget information', weight: 10, fields: ['budget'] },
  { id: 'delivery', label: 'Delivery or installation preference', weight: 10, fields: ['deliveryNeeds'] },
]

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)
}

function constantTimeEqual_(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false
  let mismatch = 0
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return mismatch === 0
}

function signature_(secret, timestamp, nonce, serializedPayload) {
  const bytes = Utilities.computeHmacSha256Signature(timestamp + '.' + nonce + '.' + serializedPayload, secret)
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '')
}

function strictUtcMillis_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null
}

function verifyRequest_(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope.payload) || !envelope.payload || typeof envelope.payload !== 'object') return false
  const timestamp = strictUtcMillis_(String(envelope.timestamp || ''))
  if (timestamp === null || !/^[a-f0-9]{48}$/.test(String(envelope.nonce || ''))) return false
  if (Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS) return false
  const secret = PropertiesService.getScriptProperties().getProperty('AI_REVIEW_COORDINATOR_SECRET')
  if (!secret || secret.length < 32) return false
  const serialized = JSON.stringify(envelope.payload)
  const expected = signature_(secret, String(envelope.timestamp), envelope.nonce, serialized)
  return constantTimeEqual_(expected, String(envelope.signature || ''))
}

function withCoordinatorLock_(callback) {
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try { return callback() } finally { lock.releaseLock() }
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('AI_REVIEW_SPREADSHEET_ID')
  if (!id) throw new Error('CONFIG')
  return SpreadsheetApp.openById(id)
}

function schemaSheets_() {
  const ss = spreadsheet_()
  const review = ss.getSheetByName('AI Review')
  const audit = ss.getSheetByName(AUDIT_TAB)
  const replay = ss.getSheetByName(REPLAY_TAB)
  if (!review || !audit || !replay) throw new Error('SCHEMA')
  if (JSON.stringify(review.getRange(1, 1, 1, AI_HEADERS.length).getValues()[0]) !== JSON.stringify(AI_HEADERS)) throw new Error('SCHEMA')
  if (JSON.stringify(audit.getRange(1, 1, 1, AUDIT_HEADERS.length).getValues()[0]) !== JSON.stringify(AUDIT_HEADERS)) throw new Error('SCHEMA')
  if (JSON.stringify(replay.getRange(1, 1, 1, REPLAY_HEADERS.length).getValues()[0]) !== JSON.stringify(REPLAY_HEADERS)) throw new Error('SCHEMA')
  const security = securityConfig_()
  assertExecutionIdentity_(security)
  verifyProtectedSheet_(audit, security, AUDIT_PROTECTION_DESCRIPTION)
  verifyProtectedSheet_(replay, security, REPLAY_PROTECTION_DESCRIPTION)
  return { review: review, audit: audit, replay: replay }
}

function securityConfig_() {
  const id = PropertiesService.getScriptProperties().getProperty('AI_REVIEW_SPREADSHEET_ID')
  if (!id) throw new Error('SPREADSHEET_OWNER_UNAVAILABLE')
  const owner = DriveApp.getFileById(id).getOwner()
  const ownerEmail = owner && String(owner.getEmail() || '').trim().toLowerCase()
  if (!ownerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) throw new Error('SPREADSHEET_OWNER_UNAVAILABLE')
  const rawAdmins = PropertiesService.getScriptProperties().getProperty('AI_REVIEW_ADMIN_EMAILS')
  if (typeof rawAdmins !== 'string' || !rawAdmins.trim()) throw new Error('ADMIN_ALLOWLIST_INVALID')
  const entries = rawAdmins.split(',').map(function (email) { return email.trim().toLowerCase() })
  if (entries.some(function (email) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) })
    || new Set(entries).size !== entries.length || !entries.includes(ownerEmail)) throw new Error('ADMIN_ALLOWLIST_INVALID')
  return { ownerEmail: ownerEmail, adminEmails: entries, allowedEmails: new Set([ownerEmail].concat(entries)) }
}

function assertExecutionIdentity_(security) {
  const effectiveEmail = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase()
  if (!effectiveEmail || !security.allowedEmails.has(effectiveEmail)) throw new Error('EXECUTION_IDENTITY_UNAUTHORIZED')
}

function validateTabHeaders_(sheet, headers, description) {
  if (JSON.stringify(sheet.getRange(1, 1, 1, headers.length).getValues()[0]) !== JSON.stringify(headers)) {
    throw new Error(description + '_SCHEMA_MISMATCH')
  }
}

function locateTabForSetup_(ss, canonicalName, legacyName, headers, errorPrefix) {
  const canonical = ss.getSheetByName(canonicalName)
  const legacy = ss.getSheetByName(legacyName)
  if (canonical && legacy) throw new Error(errorPrefix + '_TAB_CONFLICT')
  const sheet = canonical || legacy
  if (sheet) validateTabHeaders_(sheet, headers, errorPrefix)
  return { sheet: sheet, legacy: Boolean(legacy) }
}

function verifyOtherProtections_(sheet, security, managedDescription) {
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)
    .concat(sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE))
  protections.forEach(function (protection) {
    if (protection.getProtectionType() === SpreadsheetApp.ProtectionType.SHEET
      && protection.getDescription() === managedDescription) return
    if (protection.isWarningOnly() || protection.canDomainEdit()) throw new Error('EXISTING_PROTECTION_UNSAFE')
    const editorEmails = protection.getEditors().map(function (user) { return String(user.getEmail() || '').trim().toLowerCase() })
    if (editorEmails.some(function (email) { return !security.allowedEmails.has(email) })) throw new Error('EXISTING_PROTECTION_UNSAFE')
    if (protection.getProtectionType() === SpreadsheetApp.ProtectionType.SHEET
      && protection.getUnprotectedRanges().length) throw new Error('EXISTING_PROTECTION_UNSAFE')
  })
}

function ensureProtectedSheet_(sheet, security, description) {
  const sheetProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)
  const managed = sheetProtections.filter(function (protection) { return protection.getDescription() === description })
  if (managed.length > 1) throw new Error('DUPLICATE_MANAGED_PROTECTION')
  const protection = managed[0] || sheet.protect()
  if (!managed.length) protection.setDescription(description)
  verifyOtherProtections_(sheet, security, description)
  protection.setWarningOnly(false)
  protection.setUnprotectedRanges([])
  const remove = protection.getEditors().filter(function (user) {
    const email = String(user.getEmail() || '').trim().toLowerCase()
    return email && !security.allowedEmails.has(email) && email !== security.ownerEmail
  })
  if (remove.length) protection.removeEditors(remove)
  const add = security.adminEmails.filter(function (email) {
    return !protection.getEditors().some(function (user) { return String(user.getEmail() || '').trim().toLowerCase() === email })
  })
  if (add.length) protection.addEditors(add)
  if (protection.isWarningOnly() || protection.canDomainEdit() || protection.getUnprotectedRanges().length) throw new Error('PROTECTION_VERIFICATION_FAILED')
  const effectiveEditors = protection.getEditors().map(function (user) { return String(user.getEmail() || '').trim().toLowerCase() })
  if (effectiveEditors.some(function (email) { return !security.allowedEmails.has(email) })
    || security.adminEmails.some(function (email) { return !effectiveEditors.includes(email) })) throw new Error('PROTECTION_VERIFICATION_FAILED')
  verifyOtherProtections_(sheet, security, description)
  return protection
}

function verifyProtectedSheet_(sheet, security, description) {
  const managed = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)
    .filter(function (protection) { return protection.getDescription() === description })
  if (managed.length !== 1) throw new Error('PROTECTION_MISSING_OR_DUPLICATED')
  const protection = managed[0]
  if (protection.isWarningOnly() || protection.canDomainEdit() || protection.getUnprotectedRanges().length) throw new Error('PROTECTION_VERIFICATION_FAILED')
  const editors = protection.getEditors().map(function (user) { return String(user.getEmail() || '').trim().toLowerCase() })
  if (editors.some(function (email) { return !security.allowedEmails.has(email) })
    || security.adminEmails.some(function (email) { return !editors.includes(email) })) throw new Error('PROTECTION_VERIFICATION_FAILED')
  verifyOtherProtections_(sheet, security, description)
}

/** Run manually once from the bound script editor after setting Script Properties. */
function setupAiReviewCoordinator() {
  return withCoordinatorLock_(function () {
    const ss = spreadsheet_()
    const review = ss.getSheetByName('AI Review')
    if (!review) throw new Error('AI_REVIEW_SCHEMA_MISMATCH')
    validateTabHeaders_(review, AI_HEADERS, 'AI_REVIEW')
    const security = securityConfig_()
    assertExecutionIdentity_(security)

    // Validate both current/legacy tabs before any rename, creation, or write.
    const auditLocation = locateTabForSetup_(ss, AUDIT_TAB, LEGACY_AUDIT_TAB, AUDIT_HEADERS, 'AUDIT')
    const replayLocation = locateTabForSetup_(ss, REPLAY_TAB, LEGACY_REPLAY_TAB, REPLAY_HEADERS, 'REPLAY')
    let audit = auditLocation.sheet
    let replay = replayLocation.sheet
    if (auditLocation.legacy) audit.setName(AUDIT_TAB)
    if (replayLocation.legacy) replay.setName(REPLAY_TAB)
    if (!audit) audit = ss.insertSheet(AUDIT_TAB)
    if (!replay) replay = ss.insertSheet(REPLAY_TAB)
    if (!auditLocation.sheet) {
      audit.getRange(1, 1, 1, AUDIT_HEADERS.length).setValues([AUDIT_HEADERS])
      audit.setFrozenRows(1)
    }
    if (!replayLocation.sheet) {
      replay.getRange(1, 1, 1, REPLAY_HEADERS.length).setValues([REPLAY_HEADERS])
      replay.setFrozenRows(1)
    }
    ensureProtectedSheet_(audit, security, AUDIT_PROTECTION_DESCRIPTION)
    ensureProtectedSheet_(replay, security, REPLAY_PROTECTION_DESCRIPTION)
    return 'AI Review audit and replay protections are ready.'
  })
}

function findRecord_(sheet, submissionId) {
  const last = sheet.getLastRow()
  if (last < 2) return null
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues()
  const matches = []
  ids.forEach(function (row, index) { if (String(row[0]) === submissionId) matches.push(index + 2) })
  if (matches.length > 1) throw new Error('DUPLICATE_ID')
  if (!matches.length) return null
  const rowNumber = matches[0]
  return { rowNumber: rowNumber, values: sheet.getRange(rowNumber, 1, 1, AI_HEADERS.length).getValues()[0] }
}

function validSubmissionId_(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value)
}

function validProcessingRow_(row, id) {
  if (!Array.isArray(row) || row.length !== 27 || !validSubmissionId_(id)
    || row[0] !== id || row[1] !== 'Processing' || row[2] !== 'Rule-based' || row[3] !== 'readiness-v1'
    || !strictUtcMillis_(row[22]) || row[23] !== 'Unreviewed') return false
  for (let index = 4; index <= 21; index += 1) if (row[index] !== '') return false
  return row[24] === '' && row[25] === '' && row[26] === ''
}

/**
 * Called only while holding ScriptLock. Retain for 11 minutes from acceptance.
 * A signed request can remain valid for at most 10 minutes after acceptance
 * when its timestamp is at the future-skew boundary; the extra minute is grace.
 * Accepted-at order is append order, allowing expired rows to be deleted as a
 * prefix. Any read/cleanup/append error throws so callers fail closed.
 */
function registerRequestNonce_(sheet, nonce, signedTimestamp, nowMs) {
  const last = sheet.getLastRow()
  if (last >= 2) {
    const rows = sheet.getRange(2, 1, last - 1, REPLAY_HEADERS.length).getValues()
    let previousAcceptedMs = -Infinity
    let expiredPrefix = 0
    let expiryStarted = false
    for (let index = 0; index < rows.length; index += 1) {
      const [storedNonce, signedTimestamp, acceptedAt] = rows[index]
      if (storedNonce === '' && signedTimestamp === '' && acceptedAt === '') throw new Error('REPLAY_STORAGE_INVALID')
      const acceptedMs = strictUtcMillis_(String(acceptedAt))
      const signedMs = strictUtcMillis_(String(signedTimestamp))
      if (typeof storedNonce !== 'string' || !/^[a-f0-9]{48}$/.test(storedNonce) || acceptedMs === null || signedMs === null) throw new Error('REPLAY_STORAGE_INVALID')
      if (Math.abs(acceptedMs - signedMs) > MAX_CLOCK_SKEW_MS) throw new Error('REPLAY_STORAGE_INVALID')
      if (acceptedMs < previousAcceptedMs) throw new Error('REPLAY_STORAGE_INVALID')
      previousAcceptedMs = acceptedMs
      const expired = nowMs - acceptedMs > REPLAY_RETENTION_MS
      if (expired && !expiryStarted) { expiredPrefix += 1; continue }
      if (!expired) expiryStarted = true
      else throw new Error('REPLAY_STORAGE_INVALID')
      if (storedNonce === nonce) return false
    }
    if (expiredPrefix) sheet.deleteRows(2, expiredPrefix)
  }
  sheet.appendRow([nonce, signedTimestamp, new Date(nowMs).toISOString()])
  return true
}

function latestRecoveryDecision_(audit, submissionId) {
  const last = audit.getLastRow()
  if (last < 2) return null
  const values = audit.getRange(2, 1, last - 1, AUDIT_HEADERS.length).getValues()
  for (let i = values.length - 1; i >= 0; i -= 1) if (String(values[i][0]) === submissionId) return values[i]
  return null
}

function claim_(payload, sheets) {
  const id = payload.submissionId
  if (!validProcessingRow_(payload.processingRow, id)) return { claimed: false, currentStatus: 'Invalid' }
  const existing = findRecord_(sheets.review, id)
  if (!existing) {
    sheets.review.appendRow(payload.processingRow)
    return { claimed: true, currentStatus: 'Processing' }
  }
  if (existing.values[1] !== 'Needs Manual Review') return { claimed: false, currentStatus: String(existing.values[1] || 'Unknown') }
  const approval = latestRecoveryDecision_(sheets.audit, id)
  if (!approval || approval[4] !== 'RETRY_APPROVED') return { claimed: false, currentStatus: 'Needs Manual Review' }
  sheets.audit.appendRow([id, approval[1], new Date().toISOString(), 'Needs Manual Review', 'RETRY_CLAIMED'])
  sheets.review.getRange(existing.rowNumber, 2).setValue('Processing')
  sheets.review.getRange(existing.rowNumber, 27).setValue('')
  return { claimed: true, currentStatus: 'Processing', recovery: true }
}

function criterionFromRow_(row, index) {
  const definition = CRITERIA[index]
  const level = row[4 + index * 2]
  if (!['none', 'partial', 'clear'].includes(level)) throw new Error('INVALID_RESULT')
  let evidence
  try { evidence = JSON.parse(row[5 + index * 2]) } catch (_) { throw new Error('INVALID_RESULT') }
  if (!Array.isArray(evidence) || evidence.some(function (field) { return !definition.fields.includes(field) })
    || new Set(evidence).size !== evidence.length) throw new Error('INVALID_RESULT')
  return { definition: definition, level: level, evidence: evidence, points: Math.round(definition.weight * ({ none: 0, partial: 1, clear: 2 })[level] / 2) }
}

function validateCompletion_(row, id) {
  if (!Array.isArray(row) || row.length !== 27 || row[0] !== id || row[1] !== 'Completed'
    || row[2] !== 'Rule-based' || row[3] !== 'readiness-v1' || row[20] !== '' || row[21] !== ''
    || strictUtcMillis_(row[22]) === null || row[23] !== 'Unreviewed'
    || row[24] !== '' || row[25] !== '' || row[26] !== '') return false
  try {
    const criteria = CRITERIA.map(function (_, index) { return criterionFromRow_(row, index) })
    const score = criteria.reduce(function (sum, criterion) { return sum + criterion.points }, 0)
    const priority = score >= 70 ? 'High' : score >= 40 ? 'Standard' : 'Low'
    const statuses = { none: 'not provided', partial: 'partially provided', clear: 'clearly provided' }
    const rationale = criteria.map(function (criterion) { return criterion.definition.label + ': ' + statuses[criterion.level] + '.' }).join(' ')
    const actions = ['Confirm the project interest with the customer.', 'Ask for any additional project details needed to review the enquiry.', 'Ask for the available dimensions or space details, if relevant.', 'Ask whether the customer has a preferred timeline.', 'Ask whether the customer would like to share a budget, if useful.', 'Confirm the delivery or installation preference.']
    const followUps = criteria.map(function (criterion, index) { return criterion.level !== 'clear' ? actions[index] : '' }).filter(Boolean)
    const action = followUps.length ? followUps.join(' ') : 'Review the enquiry and confirm any project-specific details with the customer.'
    return Number(row[16]) === score && row[17] === priority && row[18] === rationale && row[19] === action
  } catch (_) { return false }
}

function transition_(payload, sheets) {
  if (!validSubmissionId_(payload.submissionId) || payload.expectedStatus !== 'Processing' || !payload.transition) return { updated: false, currentStatus: 'Invalid' }
  const found = findRecord_(sheets.review, payload.submissionId)
  if (!found) return { updated: false, currentStatus: 'Missing' }
  if (found.values[1] !== 'Processing') return { updated: false, currentStatus: String(found.values[1]) }
  const transition = payload.transition
  if (transition.status === 'Completed') {
    if (!validateCompletion_(transition.row, payload.submissionId)) return { updated: false, currentStatus: 'Processing' }
    // Only machine-owned columns B:W and AA are written. Human review columns X:Z survive.
    sheets.review.getRange(found.rowNumber, 2, 1, 22).setValues([transition.row.slice(1, 23)])
    sheets.review.getRange(found.rowNumber, 27).setValue('')
    return { updated: true, currentStatus: 'Completed' }
  }
  if (transition.status === 'Needs Manual Review' && SAFE_ERRORS.includes(transition.safeErrorCategory)) {
    sheets.review.getRange(found.rowNumber, 2).setValue('Needs Manual Review')
    sheets.review.getRange(found.rowNumber, 27).setValue(transition.safeErrorCategory)
    return { updated: true, currentStatus: 'Needs Manual Review' }
  }
  return { updated: false, currentStatus: 'Processing' }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents
    if (!raw || raw.length > 40000) return json_({ ok: false, error: 'INVALID_REQUEST' })
    const envelope = JSON.parse(raw)
    if (!verifyRequest_(envelope)) return json_({ ok: false, error: 'UNAUTHORIZED' })
    const payload = envelope.payload
    if (Object.keys(payload).some(function (key) { return !['operation', 'submissionId', 'processingRow', 'expectedStatus', 'transition'].includes(key) })) return json_({ ok: false, error: 'INVALID_REQUEST' })
    const operationResult = withCoordinatorLock_(function () {
      const sheets = schemaSheets_()
      if (!registerRequestNonce_(sheets.replay, envelope.nonce, envelope.timestamp, Date.now())) return { replayed: true }
      if (payload.operation === 'claim') return claim_(payload, sheets)
      if (payload.operation === 'transition') return transition_(payload, sheets)
      return { accepted: false }
    })
    if (operationResult && operationResult.replayed) return json_({ ok: false, error: 'REPLAYED_REQUEST' })
    return json_({ ok: true, result: operationResult })
  } catch (_) {
    return json_({ ok: false, error: 'COORDINATOR_FAILURE' })
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('AI Review Recovery')
    .addItem('Approve retry for Needs Manual Review record', 'approveAiReviewRetry')
    .addToUi()
}

function approveAiReviewRetry() {
  const ui = SpreadsheetApp.getUi()
  const identity = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase()
  let security
  try { security = securityConfig_() } catch (_) {
    ui.alert('Recovery authorization is not configured. Contact the spreadsheet owner.')
    return
  }
  if (!identity || !security.allowedEmails.has(identity)) {
    ui.alert('Recovery is available only to an authorized administrator signed in to Google.')
    return
  }
  const prompt = ui.prompt('Approve qualification retry', 'Enter the existing Netlify Submission ID. This records an approval; it does not create or delete the AI Review row.', ui.ButtonSet.OK_CANCEL)
  if (prompt.getSelectedButton() !== ui.Button.OK) return
  const id = prompt.getResponseText().trim()
  if (!validSubmissionId_(id)) { ui.alert('The submission ID is invalid.'); return }
  try {
    withCoordinatorLock_(function () {
      const sheets = schemaSheets_()
      const found = findRecord_(sheets.review, id)
      if (!found || found.values[1] !== 'Needs Manual Review') throw new Error('STATE')
      const latest = latestRecoveryDecision_(sheets.audit, id)
      if (latest && latest[4] === 'RETRY_APPROVED') throw new Error('REPLAY')
      sheets.audit.appendRow([id, identity, new Date().toISOString(), 'Needs Manual Review', 'RETRY_APPROVED'])
    })
    ui.alert('Retry approved and recorded. The next explicitly invoked qualification processor may claim this same record.')
  } catch (_) {
    ui.alert('Approval was not recorded. Verify the record state and AI Review schema, then contact the spreadsheet owner if needed.')
  }
}
function testCoordinatorAccess() {
  const properties = PropertiesService.getScriptProperties();

  Logger.log(
    'Spreadsheet ID configured: ' +
    Boolean(properties.getProperty('AI_REVIEW_SPREADSHEET_ID'))
  );

  Logger.log(
    'Coordinator secret configured: ' +
    Boolean(properties.getProperty('AI_REVIEW_COORDINATOR_SECRET'))
  );

  Logger.log(
    'Admin emails configured: ' +
    Boolean(properties.getProperty('AI_REVIEW_ADMIN_EMAILS'))
  );

  const id = properties.getProperty('AI_REVIEW_SPREADSHEET_ID');
  const spreadsheet = SpreadsheetApp.openById(id);

  Logger.log('Spreadsheet access: SUCCESS');
  Logger.log('Spreadsheet name: ' + spreadsheet.getName());
}
function testBasicExecution() {
  Logger.log('Basic Apps Script execution successful');
}
