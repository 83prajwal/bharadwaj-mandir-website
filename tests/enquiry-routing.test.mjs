import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const formSource = await readFile(new URL('../src/components/EnquiryForm.jsx', import.meta.url), 'utf8')
const vercelConfig = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))

test('enquiry form action and intercepted submission share the Vite-configured URL', () => {
  assert.match(formSource, /const enquirySubmissionUrl = import\.meta\.env\.VITE_ENQUIRY_SUBMISSION_URL \|\| '\/'/)
  assert.match(formSource, /fetch\(enquirySubmissionUrl, request\)/)
  assert.match(formSource, /action=\{enquirySubmissionUrl\}/)
  assert.match(formSource, /setSubmitted\(true\)/)
  assert.doesNotMatch(formSource, /Redeploy|Netlify Forms returned|HTTP \$\{response\.status\}|submissionError\.message/i)
})

test('Vercel proxies the enquiry endpoint to the existing Netlify site before the SPA fallback', () => {
  const rewrites = vercelConfig.rewrites
  const enquiryIndex = rewrites.findIndex(({ source }) => source === '/api/enquiry')
  const spaIndex = rewrites.findIndex(({ source }) => source === '/(.*)')

  assert.notEqual(enquiryIndex, -1)
  assert.ok(enquiryIndex < spaIndex)
  assert.equal(rewrites[enquiryIndex].destination, 'https://singular-kelpie-c8df6b.netlify.app/')
})
