# 3D Studio login and lead sheet setup

The 3D Studio at `/mandir-designer` needs an account. Sign-ups and quotation requests are saved to a private Google Sheet.

Nothing works until steps 1 to 4 are done on the live Netlify site.

## How it works

1. A logged-out visitor sees the sign-up and login page. The 3D code is not downloaded until they log in.
2. The browser sends sign-ups to `netlify/functions/studio-lead.mjs`. The function checks the fields, the honeypot and the rate limit, creates the account in Netlify Identity, then adds one row to the sheet.
3. "Request a Quotation" calls the same function. It reads the name, phone and email from the logged-in account, adds a row, then opens the existing enquiry form.
4. Passwords pass through the function to Netlify Identity. They are not logged or stored by this site, and they never reach the sheet.
5. Google credentials and the sheet ID stay in Netlify environment variables. The browser never contacts Google.

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

## 3. Create the service account

Skip to step 6 of this list if `GOOGLE_SERVICE_ACCOUNT_EMAIL` is already set in Netlify.

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

Then redeploy the site. `.env.example` lists these names with empty values.

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

- [ ] Temporarily set a wrong `GOOGLE_SPREADSHEET_ID` and redeploy. Sign-up and quotation show the friendly message with a WhatsApp button. Restore the value afterwards.
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
