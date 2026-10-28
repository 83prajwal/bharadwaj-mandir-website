# Blueprint implementation checklist

This checklist records the current repository state. “Pending” means the code or evidence cannot be completed truthfully without an owner decision, approved content, service credentials, or production verification.

| # | Blueprint area | Status | Implementation / remaining work |
| --- | --- | --- | --- |
| 1 | Existing project audit | Done locally | React 19, Vite 8, React Router SPA, Netlify and Vercel configuration, assets and routes inspected. Netlify is the intended integration target because the form and scheduled operations use Netlify services. No repository `.git` metadata was present. |
| 2 | Brand and design system | Partial | Brand palette, typography, editorial wordmark, split image hero, collection frames, custom project panels, asymmetric gallery composition, focus, skip link, reduced-motion behavior and responsive styles implemented. Full device and assistive technology audit pending. |
| 3 | Navigation and architecture | Partial | Existing Home, products, custom, gallery, About, contact and FAQ retained. Delivery/privacy/terms added. Dedicated category/article/case-study templates and final URL migration await approved content and domain audit. |
| 4 | Homepage | Partial | Rebuilt with an image-led split hero, four-design editorial collection, custom enquiry journey, asymmetric craft feature, concise brand story, FAQ and CTA. Genuine supplied imagery used; no fabricated testimonials. More verified process evidence and manufacturer facts require owner approval. |
| 5 | Catalogue and product detail | Partial | Reusable listing/detail templates show all four current entries, consistent imagery, product-specific enquiry links, and omit unverified specifications. Current items have internal IDs but no approved SKU, multiple-angle gallery, verified specs, availability, price or policy details. |
| 6 | Quote and enquiry form | Partial | Netlify Forms fields, basic browser validation, file type/size checks, product/page/UTM context, consent separation and truthful submit state added. Provider delivery test, server-side validation, private storage, unique server ID, customer acknowledgement and CRM persistence remain pending. |
| 7 | WhatsApp | Pending | No dedicated approved business number supplied; no `wa.me` links activated. |
| 8 | Consultation booking | Pending | No approved provider, connected work calendar, availability or booking lifecycle configuration. |
| 9 | International markets | Partial | Worldwide destination text is accepted and copy states feasibility is confirmed individually. No demand research, country ranking, local promises or destination-specific serviceability configuration. |
| 10 | SEO landing pages and URL architecture | Partial | Existing URLs preserved, new delivery/legal routes added, titles/descriptions updated client-side. Keyword research, redirects, server-rendered route metadata and page-by-page content map remain. |
| 11 | Localization and hreflang | Pending | No reviewed translations, country pages or approved production canonical host; no hreflang emitted. |
| 12 | International delivery and trust | Partial | Process and cost/responsibility considerations described with explicit feasibility qualifications. Incoterms, packing, export and policy details need operations/adviser approval. |
| 13 | About/craftsmanship/assets | Partial | Existing genuine workshop media retained and shown. Company story, asset provenance/rights register, approved captions and evidence for specific material-origin claims are not supplied. |
| 14 | GEO/AEO and FAQ | Partial | Buyer FAQ extended to cover all fourteen requested questions with qualified answers. Named reviewers, revision dates, approved About facts and structured data remain. |
| 15 | Guides/content strategy | Pending | Article template, roadmap, and articles not created; there is no approved evidence/content authoring workflow. |
| 16 | Technical SEO/performance | Partial | SPA fallback and basic robots.txt, route titles/descriptions, optional canonical, real images and lazy loading are present. Sitemap awaits domain/final URLs; schema, crawl, broken-link audit, image conversion and server-side metadata remain. |
| 17 | Analytics/conversion tracking | Partial | UTM/source attribution is carried into form fields. No analytics IDs, consent-integrated analytics, event collection or Search Console/Bing connection configured. |
| 18 | Privacy/cookies/security | Partial | Draft privacy/terms, separate optional marketing consent, reject/accept/customise preference UI, withdrawal button and basic client validation added. No analytics loads. Controller identity, legal review, retention, server validation, rate limiting, secure private uploads and data-request process remain. |
| 19 | Lead management and 48-hour reporting | Implemented; external setup pending | Added scheduled Netlify Forms API reconciliation, Google Sheets schema/duplicate key/report calculations, status validation setup, and Resend 48-hour report code. Requires Netlify API, Google service-account/sheet, Resend credentials, real owners/recipient and production verification. See `LEAD_MANAGEMENT_SETUP.md`. |
| 20 | Response coverage and Google Business Profile | Pending | Staffing, response SLA, routing owners and genuine GBP ownership/status require business confirmation. |
| 21 | Phased delivery | Partial | Phase 0 owner dependencies documented in README; implementation follows existing app structure. Acquisition, market expansion and ongoing optimization require live data/accounts. |
| 22 | Acceptance tests | Partial | ESLint/build and eleven lead unit tests pass, including schema, normalization, duplicate marking, report windows/calculations, retry behavior, scheduler shape, missing credential rejection and public-bundle secret-name scan. Live Netlify, Google Sheets, email, uploads, schedule, device/accessibility and production checks remain. |
| 23 | Deliverables | Partial | Source functions, Google Sheet setup utility, `.env.example`, lead setup guide, tests, updated README and checklist provided. Live credentials, spreadsheet and production verification remain external. |
| 24 | Non-negotiable factuality | Applied | No testimonials, delivery guarantees, foreign offices, fake WhatsApp number, invented prices, calendar slots, analytics IDs or delivery success are shown. Remaining unknowns are called out in-page and in setup notes. |

## Required owner inputs before production launch

1. Verified domain, canonical URL and deployment provider.
2. Approved company identity, legal controller/contact, company story, workshop/location claims and contact channels.
3. Product SKU mapping, per-design specifications, marble origin, availability, pricing model, multi-angle photos, asset rights and quote/order policies.
4. Supported destination countries, freight/Incoterms, packing, installation, export/import readiness and customs advice.
5. Business-controlled WhatsApp number; approved booking service/calendar and staffed availability.
6. Sales email/CRM/database, notification recipients, data retention/access/deletion rules, response owner/backup, SLA and scheduled-report destination.
7. Privacy/terms legal review, consent wording, file-access controls, analytics provider/IDs and Search Console/Bing access.
8. Approved language/localization plan and genuine project/customer permissions.
