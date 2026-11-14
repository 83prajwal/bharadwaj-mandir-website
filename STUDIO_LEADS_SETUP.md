# 3D Studio login and lead sheet setup

The 3D Studio at `/mandir-designer` needs an account. Sign-ups and quotation requests are saved to the existing private Google Sheet.

## How it works

1. A logged-out visitor sees the sign-up and login page. The 3D code is not downloaded until they log in.
2. The browser sends sign-ups to the Studio Lead API. The Netlify deployment uses `netlify/functions/studio-lead.mjs` and its existing Google Sheets integration. The Vercel deployment uses `/api/studio-lead`, verifies Netlify Identity, writes the customer profile to Supabase, then sends a signed server-to-server request to the existing Apps Script Web App to append one row.
3. "Request a Quotation" calls the same function. It reads the name, phone and email from the logged-in account, adds a row, then opens the existing enquiry form.
4. Passwords pass through the function to Netlify Identity. They are not logged or stored by this site, and they never reach the sheet.
5. The browser never contacts Google. Netlify keeps its existing service-account configuration for rollback. Vercel does not use Google Service Account credentials for Studio Lead writes; Apps Script accesses the spreadsheet as its owner.

## 1. Turn on Netlify Identity

1. In the Netlify dashboard, open the site, then **Project configuration > Identity**, and enable Identity.
2. Set **Registration preferences** to **Open**.
3. Keep **Autoconfirm** off, so each new user must confirm their email. This stops people signing up with someone else's address.
4. Under **Emails**, check the confirmation and recovery templates. The links in them return to the site root, where the app finishes the step and opens the Studio.

## 2. Create the Google Sheet

1. Create a new Google Sheet, or use the existing lead spreadsheet.
2. Add a tab named exactly `Studio Leads`.
3. Put these headings in row 1, one per column from A to I:

   `Date`, `Name`, `Phone`, `Email`, `Design interest`, `Design details`, `Consent`, `Status`, `Notes`

4. Copy the sheet ID from its URL: `https://docs.google.com/spreadsheets/d/<THIS-PART>/edit`.

## 3. Existing Netlify service-account setup (rollback only)

If `GOOGLE_SERVICE_ACCOUNT_EMAIL` is already set in Netlify, skip this service-account setup. It is retained only for the Netlify rollback path.

1. Open <https://console.cloud.google.com/> and create or select a project.
2. Open **APIs & Services > Library**, search for **Google Sheets API**, and click **Enable**.
3. Open **IAM & Admin > Service Accounts**, click **Create service account**, name it `bharadwaj-studio-leads`, and finish. It needs no project roles.
4. Open the new account, then **Keys > Add key > Create new key > JSON**. A file downloads.
5. Keep that file private. Never commit it or send it over chat. Delete it after step 4 below.
6. In the Google Sheet, click **Share**, add the service account email (ending in `.iam.gserviceaccount.com`) as **Editor**, and turn off **Notify people**.
7. Still in **Share**, confirm that **General access** says **Restricted**.

## 4. Add the Netlify environment variables

In Netlify, open **Project configuration > Environment variables** and add the values below. Scope them to **Functions**, and do not add a `VITE_` prefix, because that would publish them in the browser code.

| Variable | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON file |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` from the JSON file, including the BEGIN and END lines. Keep the `\n` characters as they are. |
| `GOOGLE_SPREADSHEET_ID` | The sheet ID from step 2 |
| `GOOGLE_STUDIO_LEADS_TAB` | Optional. Defaults to `Studio Leads`. |

These values remain necessary for the existing Netlify implementation and rollback. They are not required by the Vercel Studio Lead Apps Script appender.

## 5. Configure Vercel to use the existing Apps Script Web App

The Vercel API calls the existing Web App using a signed request. Keep the Web App configured to execute as its owner; public access is protected by the HMAC signature and timestamp/nonce checks in `doPost(e)`. Update the existing Web App deployment to a version containing that handler while retaining its URL. Do not create a separate Apps Script project or endpoint.

Keep the existing `LEAD_SPREADSHEET_ID` Script Property pointing at the current spreadsheet. Add `STUDIO_LEAD_APPS_SCRIPT_SECRET` in Apps Script Script Properties, using the same high-entropy value configured in Vercel. Do not log or place this secret in frontend variables.

Configure these server-only variables for the Vercel deployment:

| Variable | Purpose |
|---|---|
| `STUDIO_LEAD_APPS_SCRIPT_URL` | URL of the existing deployed Web App ending in `/exec` |
| `STUDIO_LEAD_APPS_SCRIPT_SECRET` | HMAC signing secret shared with Apps Script Script Properties |
| `NETLIFY_IDENTITY_URL` | Existing Netlify Identity API |
| `NETLIFY_BLOBS_SITE_ID` and `NETLIFY_BLOBS_TOKEN` | Existing Blobs site and Studio Lead store access |
| `SUPABASE_URL` and `SUPABASE_SECRET_KEY` | Server-side customer profile storage |

Vercel Studio Lead writes use the existing `Studio Leads` tab and its nine columns. Apps Script records the idempotency key as spreadsheet developer metadata, which does not add a visible column. Google Service Account credentials and `GOOGLE_SPREADSHEET_ID` are not needed in the Vercel Studio Lead flow; keep Netlify's existing values for rollback.

## Test checklist

Run these on the deployed site. They cannot be run on `npm run dev`, which has no Identity or functions.

**Access**

- [ ] In a private window, open `/mandir-designer` directly. The sign-up page appears and no 3D view loads.
- [ ] In the browser's network tab, no `MandirViewer` or `OrbitControls` file downloads while logged out.
- [ ] After logging in, the Studio opens. After **Log out**, the sign-up page returns.
- [ ] Open a read-only share link while logged out. The sign-up page appears, and the design opens after login.

**Sign-up**

- [ ] Sign up with a new email. A success message asks you to confirm your email.
- [ ] The `Studio Leads` tab has exactly one new row, with Status `New` and Consent `Yes`.
- [ ] Submit the same sign-up again. There is still exactly one row for that email.
- [ ] The confirmation email link opens the Studio login, and you can log in.
- [ ] A phone such as `12345` is refused. `98765 43210` and `+91 9876543210` are accepted.
- [ ] The form cannot be sent with the consent box unticked.
- [ ] **Forgot your password?** sends an email, and its link lets you set a new password.

**Quotation**

- [ ] Click **Request a Quotation**. One new row appears with the width, height, style, marble and pillars, and the enquiry form opens.
- [ ] Click it again without changing the design. No second row appears.
- [ ] Change the design and click it again. A new row appears.

**Failure and abuse**

- [ ] On a Preview deployment, verify a successful signed Apps Script write adds one row and a retry does not add another.
- [ ] On Preview, verify an Apps Script failure reports an unsaved lead while the Identity account and Supabase profile remain intact; retry after restoring the Apps Script configuration.
- [ ] Send more than 5 sign-ups in an hour from one connection. Further attempts are refused with a "too many attempts" message.

**Privacy**

- [ ] Open the sheet URL in a private window with no Google login. Google asks you to sign in or request access.
- [ ] Search the site's built JavaScript for your sheet ID and `gserviceaccount`. Neither appears.
- [ ] In the browser's network tab, no request goes to `googleapis.com` during sign-up or quotation.

## Good to know

- If the sheet save fails after an account was created, the customer sees the WhatsApp message. Signing up again before confirming their email retries the save. Their later quotation request also adds a row.
- Rate limits and the "one row" records are kept in Netlify Blobs, in the store `bharadwaj-mandir-studio-leads`. Deleting an email's record from that store allows a new row for it.
- The login gate runs in the browser, as on any single-page site. It stops people using the Studio, but the Studio's code files themselves are public. They contain no customer data or secrets.
- To delete a customer's data, remove their row from the sheet and their user from Netlify Identity.
