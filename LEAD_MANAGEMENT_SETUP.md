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

1. The visitor submits the existing `enquiry` form to Netlify Forms. Netlify remains the intake system of record and continues to send the already configured customer/sales notifications. The React form and its success behavior are unchanged by this integration.
2. An hourly Netlify Scheduled Function reads verified submissions for the configured form from the authenticated Netlify Forms API. It also reads the spam state for reporting. The function is server-side and has no public HTTP route.
3. Each accepted submission is validated and copied to the private Google Sheet. The Netlify submission ID is the stable lead key; the function reads existing IDs before append. Similar submissions with the same normalized email, product interest and message in the recent 48 hours are retained and flagged for human review rather than discarded.
4. The hourly process retries temporary API errors and re-reads Netlify on its next run. If Google Sheets is unavailable, the accepted Netlify form and existing email notification remain intact; the next reconciliation can recover missing rows. Function logs contain failure category/status, not form data or credentials.
5. A report is prepared from actual Netlify and Sheet records every 48 hours after the first scheduled run establishes the initial due time. An hourly scheduler checks the due time held in the private `Report Control` tab. Resend idempotency keys and a persisted pending report body reduce duplicate delivery on retries.

This uses Netlify's authenticated Forms API polling instead of relying solely on a best-effort outgoing webhook. It also avoids adding work to the user's form POST, so Sheet outages cannot make the customer-facing Netlify form/email path fail. A successful Netlify notification is not proof of a successful Sheet sync; monitor scheduled-function logs and the register.

Netlify runs Scheduled Functions only on published deploys. The schedule is hourly UTC; the report gate provides the 48-hour cadence. [Netlify Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/) · [Netlify Forms submissions API](https://docs.netlify.com/manage/forms/submissions/) · [Netlify functions environment variables](https://docs.netlify.com/build/functions/environment-variables/).

## Lead register schema

The setup script creates these tabs:

- **Lead Register**: one row per unique Netlify submission, status dropdown, quote-status dropdown, outcome dropdown, date columns, consent values and integration metadata.
- **Report Control**: private scheduler state. Do not edit the control key names or pending report values.

Columns, in order:

1. Lead ID (`BM-` plus Netlify submission ID)
2. Submission timestamp
3. Customer name
4. Email
5. Phone
6. Country
7. Product name or SKU (maps known product IDs; otherwise keeps the submitted ID/interest)
8. Enquiry message
9. Lead source (UTM source, otherwise landing page/page URL, otherwise `Unattributed`)
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
24. Last updated timestamp (set at intake; update manually when staff edit a row)
25. Netlify Submission ID (technical deduplication key)
26. City
27. Product interest
28. First human response timestamp
29. Project dimensions
30. Budget
31. Desired timeline
32. Delivery needs
33. Possible duplicate review
34. Enquiry processing consent (`Yes`/`No` from the actual checkbox value)
35. Marketing consent (`Yes`/`No`; unchecked is recorded as `No`)

Statuses: `New`, `Contacted`, `Qualified`, `Needs Details`, `Quote in Progress`, `Quoted`, `Won`, `Lost`, `Nurture`. Quote status and outcome also have dropdowns. Assign actual names only after the business supplies them. Optional server variables `LEAD_OWNER_NAME`, `LEAD_BACKUP_OWNER_NAME`, `LEAD_OWNER_OPTIONS`, and `LEAD_BACKUP_OWNER_OPTIONS` set defaults/dropdown options; blank values are intentionally left blank. Rerun the setup command after changing owner option variables.

The sheet does not receive uploaded file contents or private file links. Restrict the spreadsheet to authorized business users and the service account only. Protect the Report Control tab/ranges from routine edits while retaining the service account's ability to update them.

## Google Sheets setup

1. An authorized business Google account creates the spreadsheet and retains ownership. Copy the spreadsheet ID from the URL (`/spreadsheets/d/<ID>/edit`).
2. Create/select a Google Cloud project and enable the Google Sheets API.
3. Create a dedicated service account for this integration. Share only this spreadsheet with its service-account email as **Editor**. Do not grant access to a Drive folder or unrelated spreadsheets.
4. Provide the private key and service-account email to the server configuration below. Do not commit the JSON key or place it in any `VITE_` variable.
5. Run the setup script once. It creates the Lead Register and Report Control tabs if needed, installs the header row, freezes the header and applies dropdown/date validation. Existing lead rows and Report Control values are preserved; the lead header row is rewritten to the documented schema.

## Netlify and email configuration

Set these under the Netlify site's **Environment variables** with function/runtime availability in the production context. Use encrypted/sensitive values for credentials. Never paste secrets into chat or frontend variables.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Yes | Dedicated Google service-account identity |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Yes | Google service-account RSA private key; secure Netlify value, escaped `\\n` accepted |
| `GOOGLE_SPREADSHEET_ID` | Yes | Target spreadsheet identifier |
| `GOOGLE_SHEET_TAB` | No | Defaults to `Lead Register` |
| `GOOGLE_CONTROL_TAB` | No | Defaults to `Report Control` |
| `NETLIFY_ACCESS_TOKEN` | Yes | Netlify API token authorized to read this site's form submissions; use a dedicated account/token with the least site access available |
| `NETLIFY_FORM_ID` | Yes | ID for the `enquiry` form. Get it from the site's Forms API/UI after it is active. The code filters by this ID, not other forms. |
| `NETLIFY_SYNC_MAX_PAGES` | No | Maximum pages to scan per state; defaults to 100 pages of 100 records. Increase for a larger history and check scheduled function runtime. |
| `RESEND_API_KEY` | Yes for reports | Server-only Resend API key |
| `REPORT_FROM_EMAIL` | Yes for reports | Sender address verified by Resend |
| `REPORT_TO_EMAIL` | Yes for reports | Approved reporting recipient |
| `REPORT_TIMEZONE` | No | IANA timezone used for report display; defaults to `Asia/Kolkata`. Window boundaries are exact UTC instants. |
| `LEAD_OWNER_NAME` / `LEAD_BACKUP_OWNER_NAME` | No | Actual owner defaults; leave blank until supplied |
| `LEAD_OWNER_OPTIONS` / `LEAD_BACKUP_OWNER_OPTIONS` | No | Comma-separated actual names for dropdown setup; leave blank until supplied |

Find the form ID in Netlify's authorized API response from `GET /api/v1/sites/{site_id}/forms` by matching `name` equal to `enquiry`. Do not put the Netlify token in a browser request. The existing Netlify submission email notification is configured in the Netlify UI and is not changed by these functions.

## One-time sheet setup

The current local `.env.example` has placeholders only. Do not place Google keys in `.env.example`. For local setup, use Node 20.6+ and a secrets file stored outside the repository with restrictive file permissions, then run:

```powershell
node --env-file="C:\secure\bharadwaj-lead-secrets.env" scripts/setup-lead-register.mjs
```

The secure file should contain only the Google service-account email, private key and spreadsheet ID, plus optional tab/owner-choice variables. Do not put it in the project folder. Alternatively run the setup script in an approved secure environment with those variables already injected. The setup script does not read a Netlify API token or Resend key.

## Reporting and recovery

- The scheduler runs hourly in UTC and reconciles verified and spam submissions from the `enquiry` form. Verified records are copied; spam records are counted, not copied to the customer lead register.
- The first successful scheduler invocation records a first report due time 48 hours later. Reports then use the preceding 48 hours, displayed in `REPORT_TIMEZONE`; the exact UTC bounds are included in each report.
- The report includes unique register leads, verified submissions, spam, possible duplicates, countries, qualified leads, product interests, recorded source/UTMs, response-time median/P90 where first-response timestamps exist, current pipeline, follow-ups, and won/lost totals. Sessions/conversion metrics explicitly say unavailable until analytics is connected.
- Staff must enter `First human response timestamp` to contribute to response-time percentiles. These metrics are unavailable when no rows have that timestamp.
- Transient network/API failures retry up to three times with backoff. A later hourly reconciliation retries the durable Netlify source. A Google append whose response is lost is checked against submission IDs on the next run.
- The report body and pending window are stored in the private control tab before sending. Resend idempotency keys protect retries. If a pending report is older than 23 hours, automatic sending stops to avoid a retry beyond the provider's 24-hour idempotency window; inspect function logs and the email provider before resolving the pending control row.
- If submissions exceed the configured page limit, the function fails visibly and does not silently claim a complete sync/report. Increase the limit and deploy. Reconciliation scans verified/spam form submissions from the API; very large histories may require splitting/archive procedures to stay inside Netlify's scheduled-function time limit.
- Duplicate detection by submission ID is deterministic. Similar customer submissions are retained and flagged, not discarded. Google Sheets does not enforce a unique constraint, so do not run concurrent manual copies of the sync process.
- The existing Netlify form/email path is independent. A Sheet or report error does not send a failure response to the customer or retract the accepted Netlify submission.

## Build, tests, deploy and production verification

Run locally:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run test:lead
node --check netlify/functions/lead-operations.mjs
node --check netlify/functions/lib/lead-management.mjs
```

Netlify Functions are outside `dist`; a static-folder upload alone does **not** deploy the scheduled function. Deploy the repository through the connected Netlify build (command `npm run build`, publish directory `dist`, functions directory `netlify/functions`) or use an authenticated Netlify CLI build/deploy such as `netlify deploy --build --prod`. Do not use drag-and-drop `dist` as the deployment method for this integration.

After deploy, confirm `lead-operations` is listed as a scheduled function. Run the documented/available function test in the Netlify UI if supported, or wait for its hourly schedule, then check function logs for a reconciliation result. Submit a real enquiry and verify separately that (1) Netlify Forms still records it, (2) the existing notification email still arrives, and (3) one matching row appears in the configured Sheet. Re-run/allow the next hourly sync to confirm no second row is added. Check spam using a controlled test only if appropriate; don't repeatedly submit artificial data that may trip spam filtering.

The local tests use fixtures and mocks; no live Google, Netlify API, Resend, production form, notification inbox or scheduled email was available to verify from this workspace. Production verification remains pending until the business configures credentials and runs those checks.
