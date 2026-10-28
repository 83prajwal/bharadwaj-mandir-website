import {
  appendNewLeads,
  buildLeadReport,
  createReportWindow,
  fetchNetlifySubmissions,
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

export default async function leadOperations() {
  try {
    const now = new Date()
    const [verified, spam] = await Promise.all([
      retryTransient(() => fetchNetlifySubmissions({ state: 'verified' })),
      retryTransient(() => fetchNetlifySubmissions({ state: 'spam' })),
    ])
    const oldRows = await retryTransient(() => readLeadRegister())
    const duplicateIds = flagPossibleDuplicates(withinWindow(verified, new Date(now.getTime() - 48 * 3600000).toISOString(), now.toISOString()))
    const rows = verified.map((submission) => normalizeLead(netlifyApiSubmission(submission), {
      now,
      possibleDuplicate: duplicateIds.has(submission.id),
    }))
    // If an append response is lost after Google writes it, the next scheduled
    // reconciliation re-reads IDs before appending. Do not retry with a stale ID snapshot.
    await appendNewLeads(rows, oldRows)

    const control = await retryTransient(() => readReportControl())
    const window = createReportWindow(now, control)
    if (window?.initializeDue) {
      await retryTransient(() => writeReportControl({ next_report_due_utc: window.initializeDue }))
      console.log('Lead register reconciled; first 48-hour report is scheduled.')
      return
    }
    if (!window) {
      console.log('Lead register reconciled; next 48-hour report is not due.')
      return
    }

    if (!control.get('pending_report_end_utc')) {
      await retryTransient(() => writeReportControl({ pending_report_end_utc: window.end }))
    }
    let text = control.get('pending_report_body') || ''
    if (!text) {
      const leads = await retryTransient(() => readLeadRegister())
      const reportTime = new Date(window.end)
      text = buildLeadReport({ leads, verified, spam, windowStart: window.start, windowEnd: window.end, now: reportTime })
      await retryTransient(() => writeReportControl({ pending_report_body: text }))
    }
    const pendingAgeMs = now.getTime() - Date.parse(window.end)
    if (pendingAgeMs > 23 * 3600000) {
      throw new Error('A pending report is older than the email provider idempotency window; review Report Control before retrying.')
    }
    await retryTransient(() => sendReportEmail({ text: `${text}\n\nDisplay timezone: ${sheetTimeZone()}.`, end: window.end }))
    const nextDue = new Date(Date.parse(window.end) + 48 * 3600000).toISOString()
    await retryTransient(() => writeReportControl({
      last_report_end_utc: window.end,
      next_report_due_utc: nextDue,
      pending_report_end_utc: '',
      pending_report_body: '',
    }))
    console.log(`Lead report delivered for window ending ${window.end}.`)
  } catch (error) {
    console.error(`Lead operations failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    throw new Error('Lead operations failed. Review function logs and the Netlify form register before manual recovery.')
  }
}
