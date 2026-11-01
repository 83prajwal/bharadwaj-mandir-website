import {
  appendNewLeads,
  buildLeadReport,
  createReportWindow,
  createLeadOperationsCoordinator,
  fetchNetlifySubmissions,
  LEAD_OPERATIONS_COORDINATOR_TIMEOUT_MS,
  flagPossibleDuplicates,
  netlifyApiSubmission,
  normalizeLead,
  readLeadRegister,
  readReportControl,
  retryTransient,
  sendReportEmail,
  sheetTimeZone,
  writeReportControl,
} from './lib/lead-management.mjs'

export const config = { schedule: '0 * * * *' }

function withinWindow(submissions, start, end) {
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  return submissions.filter((submission) => {
    const time = Date.parse(submission.created_at || '')
    return Number.isFinite(time) && time >= startMs && time < endMs
  })
}

export function createLeadOperations({ coordinatorFactory = createLeadOperationsCoordinator, fetchImpl = fetch, logger = console } = {}) {
  return async function leadOperations() {
    try {
      const now = new Date()
      const coordinator = coordinatorFactory({ requestTimeoutMs: LEAD_OPERATIONS_COORDINATOR_TIMEOUT_MS })
      const [verified, spam] = await Promise.all([
        retryTransient(() => fetchNetlifySubmissions({ state: 'verified', fetchImpl })),
        retryTransient(() => fetchNetlifySubmissions({ state: 'spam', fetchImpl })),
      ])
      const duplicateIds = flagPossibleDuplicates(withinWindow(verified, new Date(now.getTime() - 48 * 3600000).toISOString(), now.toISOString()))
      const rows = verified.map((submission) => normalizeLead(netlifyApiSubmission(submission), {
        now,
        possibleDuplicate: duplicateIds.has(submission.id),
      }))
      // Appends are deduplicated under the Apps Script ScriptLock. If the write
      // response is uncertain, stop here and let the next scheduled scan reconcile IDs.
      await appendNewLeads(rows, coordinator)

      const control = await retryTransient(() => readReportControl(coordinator))
      const window = createReportWindow(now, control)
      if (window?.initializeDue) {
        await writeReportControl({ next_report_due_utc: window.initializeDue }, coordinator)
        logger.log('Lead register reconciled; first 48-hour report is scheduled.')
        return
      }
      if (!window) {
        logger.log('Lead register reconciled; next 48-hour report is not due.')
        return
      }

      if (!control.get('pending_report_end_utc')) {
        await writeReportControl({ pending_report_end_utc: window.end }, coordinator)
      }
      let text = control.get('pending_report_body') || ''
      if (!text) {
        const leads = await retryTransient(() => readLeadRegister(coordinator))
        const reportTime = new Date(window.end)
        text = buildLeadReport({ leads, verified, spam, windowStart: window.start, windowEnd: window.end, now: reportTime })
        await writeReportControl({ pending_report_body: text }, coordinator)
      }
      const pendingAgeMs = now.getTime() - Date.parse(window.end)
      if (pendingAgeMs > 23 * 3600000) {
        throw new Error('A pending report is older than the email provider idempotency window; review Report Control before retrying.')
      }
      await retryTransient(() => sendReportEmail({ text: `${text}\n\nDisplay timezone: ${sheetTimeZone()}.`, end: window.end, fetchImpl }))
      const nextDue = new Date(Date.parse(window.end) + 48 * 3600000).toISOString()
      await writeReportControl({
        last_report_end_utc: window.end,
        next_report_due_utc: nextDue,
        pending_report_end_utc: '',
        pending_report_body: '',
      }, coordinator)
      logger.log(`Lead report delivered for window ending ${window.end}.`)
    } catch (error) {
      logger.error(`Lead operations failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      throw new Error('Lead operations failed. Review function logs and the Netlify form register before manual recovery.')
    }
  }
}

export default createLeadOperations()
