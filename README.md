# Bharadwaj Mandir website

React 19 and Vite single-page website with React Router 7. Existing routes, product/gallery data, and supplied product/workshop images and videos are retained. Netlify is the intended deployment because the enquiry intake and scheduled lead operations depend on Netlify services.

## Local development

```sh
npm install
npm run dev
npm run lint
npm run build
npm run test:lead
npm run preview
```

Copy `.env.example` to `.env` for local configuration. `VITE_SITE_URL` is the public HTTPS canonical origin (hostname only, no route or query) used for page canonical links and the sitemap. The shared Netlify build environment retains the Netlify hostname for previews; the production context sets it to `https://homemarbletemple.com`. Invalid values, including booleans such as `true`, are ignored; without a valid origin, the build emits an empty `sitemap.xml` and `robots.txt` omits a sitemap URL. Netlify Forms does not use a Vite environment flag; local submissions are blocked by hostname, while deployed submissions post to the Netlify form endpoint. Keep all server credentials in Netlify environment settings and never use a `VITE_` prefix for them.

## Implemented routes and features

- `/`: image-led editorial hero, four-design collection, custom project journey, asymmetric craft feature, brand story, FAQ and enquiry CTA.
- `/products` and `/products/:id`: existing catalogue and product detail template. Current IDs are internal product IDs; no owner-approved SKUs or detailed specifications were supplied.
- `/custom-mandir`, `/gallery`, `/about`, `/faq`, `/contact`: retained and updated existing pages.
- `/international-delivery`: explains the enquiry-to-delivery stages and asks the visitor to request destination feasibility confirmation.
- `/privacy` and `/terms`: plain-language draft notices that state which business and policy details still require owner/legal review.
- Enquiry form: captures contact, country, buyer type, project interest, optional dimensions/budget/timing, delivery needs, message, optional file and separate optional marketing consent. It sends product ID/URL, landing page and UTM context to Netlify Forms. Required enquiry consent is not combined with marketing consent.
- Cookie controls: Accept, Reject non-essential, Customise, and a persistent settings button. No analytics or advertising scripts are included; therefore choosing Accept does not activate optional tracking.
- Reduced-motion handling, visible keyboard focus, mobile layouts, page titles/descriptions and optional canonical links.

## Netlify Forms setup

The app submits the static `enquiry` form to Netlify. The hidden form definition and field names in `index.html` allow the deploy parser to detect the React form.

1. Enable Netlify form detection for the intended site, then deploy this build. Detection applies to deploys made after the setting is enabled.
2. Configure the owner-approved sales notification and access controls.
3. Review uploaded-file permissions, retention, account access, and whether email notifications expose attachments before accepting customer drawings. The browser restricts uploads to one JPG, PNG, WebP or PDF up to 7 MB; it does not replace server-side validation or private object storage.
4. Submit test enquiries, invalid files and duplicate/spam examples. Verify actual records and notification delivery in the Netlify account.
5. Submit a realistic test enquiry from the deployed Netlify URL and verify the form record and notification. Localhost submissions are deliberately blocked and cannot verify Netlify delivery.

The UI reports success only after the Netlify POST returns an OK response. Netlify Forms does not provide this app with a confirmed reference ID, so the success message does not invent one. The existing Netlify notification workflow is unchanged. Lead-register sync and scheduled reports require the server-side configuration in the setup guide; local checks do not verify delivery to production mailboxes.

## Lead management

See [LEAD_MANAGEMENT_SETUP.md](LEAD_MANAGEMENT_SETUP.md) for the Netlify Forms-to-Sheets data flow, credentials/configuration, spreadsheet schema and dropdowns, 48-hour reporting, retry/recovery behavior, test coverage and deployment instructions. The existing Netlify form remains the customer intake and notification path; a scheduled server-side process copies accepted submissions into the private register.

## Deployment

Netlify is the configured production target: `netlify.toml`, Netlify Forms, and `netlify/functions` together provide the site build, enquiry intake and scheduled lead operations. In Netlify, connect the project, use the existing build command (`npm run build`) and publish directory (`dist`), enable form detection, set the required server-side environment variables described in `LEAD_MANAGEMENT_SETUP.md`, and deploy. The production build context sets `VITE_SITE_URL` to `https://homemarbletemple.com`; branch and deploy previews retain the Netlify hostname. The build writes `dist/sitemap.xml` and a matching absolute sitemap reference in `dist/robots.txt` when the origin is valid. Verify DNS, HTTPS, direct route refreshes, form submissions and notifications in the deployed site. The existing `vercel.json` is only an SPA rewrite; deploying there does not provide the Netlify Forms or scheduled function integrations and is not an equivalent production setup. This client-rendered SPA updates route metadata in the browser; prerendered metadata remains an SEO improvement.

## Phase 0: owner decisions before launch

- Confirm domain/canonical host and intended deployment provider.
- Approve inventory, product IDs/SKUs, dimensions, material and stone origin by product, availability, multi-angle imagery, prices/quote model and image usage rights.
- Confirm company story, Makrana/manufacturing claims, real business contact/controller details and address where appropriate.
- Confirm destination serviceability, freight/Incoterms wording, installation scope, export readiness and applicable policies (payment, deposits, timing, cancellation, returns, damage and warranty).
- Provide an approved business-controlled WhatsApp number before activating `wa.me` links. No WhatsApp links are active until supplied.
- Select and connect calendar/booking, CRM/database, approved sales inbox, high-intent alerts, and 48-hour report destination. No such service is configured in this repo.
- Confirm staffed hours, response targets, lead owner and backup, retention/access/deletion process, privacy notice and legal review.
- Confirm supported languages and regional pages only after operational review and translation.
- Approve genuine product/workshop captions, customer/project permissions and the image/video asset register.
- Confirm whether analytics is needed, its IDs/provider, consent implementation, Search Console and Bing access. No analytics IDs or trackers are invented here.

## Launch checklist

### Critical before launch

- Enable Netlify Forms on the intended site and deploy so the static form definition is detected.
- Configure the owner-approved form notification recipient and review account access.
- Set server-only lead-operation credentials in Netlify. Keep private keys and API tokens out of `.env.example`, Vite `VITE_` variables, source files and public assets.
- Submit an actual deployed test enquiry and verify the form record and notification in Netlify.
- Review upload access, retention, and whether notifications include customer reference files before soliciting confidential drawings.
- Confirm the production domain, DNS, HTTPS and `VITE_SITE_URL`; redeploy after configuration.
- Have the business owner and qualified adviser review the privacy notice, terms and applicable customer data handling.

### Required business-owner confirmation

- Approved wordmark/logo, company identity and business story.
- Product names/SKUs, materials and origins, dimensions, finishes, current availability, pricing approach and photo usage rights.
- Business email/phone, data controller contact, retention/deletion process, enquiry owner and notification destination.
- Destination coverage, freight and installation responsibilities, order, payment, cancellation, damage and warranty terms.
- Approved contact channels, including whether the existing phone/email details and any social account are current.

### Recommended improvements

- Add reviewed route metadata through prerendering once the canonical domain and page content are approved.
- Create a sitemap after the production host and final indexable URL set are confirmed.
- Run a real-device keyboard, screen-reader and contrast review at 360, 390, 768, 1280 and 1440 pixel widths.
- Run the live deployment through an accessibility and performance audit; no scores are claimed from local build checks.

### Optional future features

- Add a CRM, booking calendar, analytics, localized pages, article templates or customer project stories only after the owner approves services, content and privacy behavior.

### Manual acceptance checklist

- [ ] Directly open and refresh every route listed above, including product details and an invalid URL.
- [ ] At mobile and desktop widths, use the menu with touch and keyboard; confirm focus is visible and Escape closes it.
- [ ] Follow every product card and verify its enquiry form carries the correct product name and ID.
- [ ] Submit invalid and valid form fields, duplicate clicks, a permitted file and an oversized or unsupported file; then verify real Netlify receipt and notification.
- [ ] Open a gallery image and video, close the image preview with Escape, and verify the image description is available.
- [ ] Review all policy pages, business claims, contacts, destination statements and approved imagery before publication.
- [ ] Verify final canonical URL, HTTPS, crawler access, Netlify scheduled function and external lead/report integrations in production.

## Requirement status summary

| Blueprint area | Status in this repo |
| --- | --- |
| Brand styling, responsive shell, focus/reduced motion | Marble, maroon, gold and beige tokens retained; wordmark, shared layout, keyboard focus, skip link, reduced motion and responsive styles improved. Physical device and full contrast audits remain. |
| Home, catalogue, product details, custom/contact, about/gallery/FAQ | Implemented as SPA pages; detailed specs and approved SKU data remain unavailable. |
| Indoor-only catalogue scope | Removed the moorti navigation/footer category; current catalogue contains mandir designs. |
| International delivery | Informational page implemented with explicit feasibility qualification; no country promises. |
| Quote form and product/source context | Netlify Forms interface implemented; real provider delivery must be tested on deployment. |
| Upload security, lead database/CRM, notifications, customer email, reference ID | Not implemented/verified. Netlify account controls and a backend/approved CRM are required. |
| WhatsApp and consultation booking | Not active; number, calendar and availability approvals are missing. |
| Privacy/terms and cookie choices | Draft pages and preference UI implemented; business identity, legal review, retention, and processor details are outstanding. No non-essential tracking is loaded. |
| Metadata/canonical | Route titles/descriptions updated client-side; canonical requires `VITE_SITE_URL`. SSR/prerendering, final sitemap, schema and redirect audit remain outstanding. |
| Analytics, 48-hour reports, routing/SLA | Report and scheduled sync code implemented; Netlify/Google/Resend credentials, actual owners/recipient and production verification required. Analytics and routing/SLA remain unconnected. |
| Country pages/hreflang, translated pages, blogs/projects | Not published because approved operational coverage/content has not been supplied. |
| Exports, shipping/customs, GBP, legal/compliance | Business/adviser verification required; no status claims are made. |

## Verification report

Local checks run after implementation:

- `npm.cmd run lint` — passed.
- `npm.cmd run build` — passed with Vite 8.3.3.
- `npm.cmd run test:lead` — lead unit tests; see `LEAD_MANAGEMENT_SETUP.md` for scope.

Not tested against a live Netlify account, Google spreadsheet, external inbox, CRM, calendar, analytics service, domain, actual mobile devices, or production crawl. Do not treat repository checks as launch approval or proof of external integration delivery.
