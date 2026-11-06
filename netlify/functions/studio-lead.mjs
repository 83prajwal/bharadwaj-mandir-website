import { getStore } from '@netlify/blobs'
import { getUser, signup } from '@netlify/identity'
import { createStudioLeadHandler } from './lib/studio-leads.mjs'

// The browser never talks to Google. Sign-ups run here so only validated,
// rate-limited requests can create an account row in the private sheet.
export default createStudioLeadHandler({
  store: getStore('bharadwaj-mandir-studio-leads'),
  createAccount: signup,
  currentUser: getUser,
})
