# Lead management setup

## Product enquiry assistant

The optional website chat assistant is separate from the lead register. It uses an allow-list built from the published product descriptions/features, FAQ answers, and international-delivery policy. Null product specifications, prices, availability, and unrelated design references are excluded. The AI service selects relevant source statements; the function returns those statements verbatim, so generated model prose cannot add unsupported product claims. For unanswered questions, the visitor is offered the existing `/contact` enquiry form. Submitting that form continues to use the existing Netlify Forms `enquiry` workflow and hourly Google Sheets synchronization. Provider choice does not alter the knowledge source, privacy behavior, or lead handling.

The browser calls `/.netlify/functions/ai-assistant`. The function checks same-origin requests, JSON content type, payload size and message limits, applies an in-memory per-instance limit of 10 requests per client per 10 minutes, and returns generic errors. Rate limiting is best-effort because Netlify function instances do not share memory; add a shared rate-limit service or a challenge provider before relying on it for high-volume public traffic. No user message is logged or added to the lead system by this function.

### Configuration

The assistant sends server-side JSON-mode chat-completion requests. It attempts configured providers in this order: Groq, Mistral, then optional NVIDIA NIM. A provider is attempted at most once per visitor request. Network errors, timeouts, HTTP 408/425/429, and HTTP 5xx responses continue to the next configured provider. Permanent HTTP errors such as invalid credentials or invalid model/configuration fail fast; they are logged without request contents or credentials and are not retried against that provider. Permanent 4xx errors place that provider in a best-effort 60-second per-function-instance cooldown, after which it can be tried again. Each provider call has a 10-second timeout. Thus, with all three configured, the maximum sequential provider wait is 30 seconds.

Set these values in Netlify's server-side environment settings for the deploy contexts where the assistant should run. Keys stay in function runtime configuration and are never sent to the browser:

- `GROQ_API_KEY`: required to use the primary provider. `GROQ_MODEL` is optional and defaults to `openai/gpt-oss-20b`.
- `MISTRAL_API_KEY`: required to use Mistral fallback. `MISTRAL_MODEL` is optional and defaults to `mistral-small-latest`.
- `NVIDIA_NIM_ENABLED=true`: opt in to NVIDIA NIM as the third provider. It also requires `NVIDIA_NIM_API_KEY` and `NVIDIA_NIM_MODEL`. `NVIDIA_NIM_BASE_URL` is optional and defaults to `https://integrate.api.nvidia.com/v1`.

If no provider is configured, the website and chat widget remain available, but chat requests receive a safe unavailable response and the existing enquiry form remains available. Provider accounts, API keys, quotas, and any billing are managed by the site owner; this code does not create accounts, activate paid plans, or make provider requests during build/tests.

The function sends the recent conversation turns to the selected provider's chat-completions API. Provider-side privacy and retention are governed by that provider's applicable terms; visitors are told not to submit sensitive information. The chat itself does not create a lead. To capture an enquiry, visitors must continue through the existing form and provide the form's required contact details and privacy acknowledgement.

For UI-only work, `npm run dev` starts Vite but does not serve Netlify Functions. Use `npm run dev:netlify` (requires the Netlify CLI installed) to run the site with its function routes; configure provider keys in the local Netlify environment for actual assistant responses. A Vite-only preview shows a clear function-unavailable message and enquiry-form link instead of a JSON parsing error. Do not use live customer data for tests. `npm test` uses mocked requests and does not call AI providers, Netlify Forms, Google Sheets or Resend. After changing Netlify environment values, publish a deploy before expecting them in a deployed function.

## Architecture and data flow

1. Visitors submit the existing `enquiry` form to Netlify Forms. The site, form validation, success behavior, and existing Netlify notification remain unchanged.
2. Apps Script polls the existing Netlify Forms form hourly, maps verified enquiries to the existing 35-column Lead Register, and checks spam submissions for report counts.
3. Apps Script uses `SpreadsheetApp` directly. It deduplicates under ScriptLock by Netlify Submission ID and never overwrites an existing lead. Report Control retains the 48-hour due time and pending-report state.
4. The hourly Apps Script run sends a report when due. It stores the pending window and report body first, then uses the existing Resend idempotency key so a retry for the same report window does not send a second email.

Function errors are logged without submission contents, contact information, or credentials. An uncertain write is not retried in the same invocation; the next scheduled reconciliation can safely deduplicate a persisted submission ID.

## Lead Register schema

The existing `Lead Register` keeps its 35 columns in this order:

1. Lead ID
2. Submission timestamp
3. Customer name
4. Email
5. Phone
6. Country
7. Product name or SKU
8. Enquiry message
9. Lead source
10. UTM source
11. UTM medium
12. UTM campaign
13. UTM term
14. UTM content
15. Lead status
16. Assigned owner
17. Backup owner
18. Last contacted date
19. Next action
20. Follow-up due date
21. Quote status
22. Outcome
23. Internal notes
24. Last updated timestamp
25. Netlify Submission ID
26. City
27. Product interest
28. First human response timestamp
29. Project dimensions
30. Budget
31. Desired timeline
32. Delivery needs
33. Possible duplicate review
34. Enquiry processing consent
35. Marketing consent

Lead status, quote status, and outcome retain their existing dropdown values. Submission ID remains the synchronization deduplication key. The setup utility is for provisioning a new workbook; do not run it against the existing production workbook as part of this cleanup.

## Apps Script Lead Operations

The local standalone Lead Management source is [`scripts/apps-script/Code.gs`](scripts/apps-script/Code.gs). It uses `SpreadsheetApp` directly and does not require a Web App coordinator, service-account key, or AI Review/qualification code. It validates the existing 35-column Lead Register and Report Control headers and does not clear or rewrite existing records.

`runLeadOperationsHourly()` fetches verified and spam form submissions, appends only verified records, then checks Report Control for a due report. `syncEnquiriesToSheet()` is available for controlled manual recovery. Run `setupHourlyLeadOperationsTrigger()` once to install an hourly time-driven trigger; it is idempotent and does not remove other triggers. Report timing remains governed by the existing `next_report_due_utc` value and pending-report fields.

The existing Report Control keys remain `last_report_end_utc`, `next_report_due_utc`, `pending_report_end_utc`, and `pending_report_body`. An uncertain email attempt keeps the pending window and reuses the same Resend idempotency key on a later run.

Required Apps Script Script Properties:

- `LEAD_SPREADSHEET_ID`: the existing workbook ID.
- `NETLIFY_ACCESS_TOKEN`: token allowed to read the existing form submissions.
- `NETLIFY_FORM_ID`: ID of the existing `enquiry` form.
- `RESEND_API_KEY`, `REPORT_FROM_EMAIL`, `REPORT_TO_EMAIL`: send scheduled reports through the existing Resend workflow.
- `REPORT_TIMEZONE`: optional, defaults to `Asia/Kolkata`.
- `NETLIFY_SYNC_MAX_PAGES`: optional, defaults to 100.
- `LEAD_OWNER_NAME` and `LEAD_BACKUP_OWNER_NAME`: optional initial owner defaults.

Do not run `setupLeadRegister()` from the old backup: its 23-column schema does not match this workbook. This standalone source is local only; it has not been deployed or run against production.

## Netlify and email configuration

Keep these server-only Netlify variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NETLIFY_ACCESS_TOKEN` | Yes | Reads submissions for the existing form |
| `NETLIFY_FORM_ID` | Yes | Selects the existing `enquiry` form |
| `AI_REVIEW_COORDINATOR_URL` | Transition only | Required by the currently deployed Netlify Lead Operations function until that function is retired after Apps Script validation |
| `AI_REVIEW_COORDINATOR_SECRET` | Transition only | HMAC key for the currently deployed Netlify function during migration |
| `NETLIFY_SYNC_MAX_PAGES` | No | Maximum pages per form scan; defaults to 100 |
| `RESEND_API_KEY` | Required when a report is due | Sends the 48-hour report |
| `REPORT_FROM_EMAIL` | Required when a report is due | Verified Resend sender |
| `REPORT_TO_EMAIL` | Required when a report is due | Report recipient |
| `REPORT_TIMEZONE` | No | Report display timezone; defaults to `Asia/Kolkata` |
| `LEAD_OWNER_NAME` / `LEAD_BACKUP_OWNER_NAME` | No | Initial assigned-owner defaults |
| `LEAD_OWNER_OPTIONS` / `LEAD_BACKUP_OWNER_OPTIONS` | No | Optional owner dropdown lists for one-time sheet setup |

The standalone Apps Script workflow does not use Netlify Google service-account variables. Keep the coordinator URL and secret until the existing Netlify scheduled function is retired; remove them only after cutover is complete.

For a new workbook only, the existing setup utility may be run in a secure environment with its required Google credentials. It creates or validates the Lead Register and Report Control tabs, headers, and lead dropdowns. It is not needed for the already verified production workbook.

The existing Netlify form notification is configured in Netlify and remains independent of Sheets synchronization and report email.

## Reporting and recovery

- The hourly Apps Script trigger reads verified and spam submissions. Verified records are copied to Lead Register; spam is counted, not copied.
- The first successful run records the first report due time 48 hours later. Subsequent reports cover the preceding 48 hours using `REPORT_TIMEZONE` for display and exact UTC bounds internally.
- Report Control stores the pending window and report body before delivery. Resend idempotency keys protect repeated email attempts. If a pending report is older than 23 hours, automatic sending stops to avoid retrying outside the provider idempotency window; review the control state and email provider before manual recovery.
- The report includes register leads, verified/spam counts, possible duplicates, countries, product interests, sources/UTMs, response-time metrics when staff have recorded them, current pipeline, follow-ups, and won/lost totals. Analytics metrics remain explicitly unavailable until connected.
- Similar enquiries are retained and flagged rather than discarded. Submission ID is the deterministic deduplication key. Do not run multiple manual sync copies concurrently.
- A Netlify form or notification success does not guarantee a completed Sheets write. The next hourly reconciliation can repair missing rows safely.

## Build, tests, and deployment

Run the local checks:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run test:lead
npm.cmd run test:assistant
node --check netlify/functions/lead-operations.mjs
node --check netlify/functions/lib/lead-management.mjs
```

Netlify Functions are outside `dist`; publish through the repository build with `functions = "netlify/functions"` so the hourly Lead Operations function is included. Do not use a static-only upload for this workflow.

Before cutover, test the Apps Script workflow against a test workbook with synthetic submissions and a mocked or test Resend account. Keep the current Netlify Lead Operations deployed until sync, deduplication, Report Control, and report idempotency are verified. Then coordinate retiring its schedule with installing the Apps Script trigger so two report senders do not run independently. No production settings or deployments are changed by this local work.
