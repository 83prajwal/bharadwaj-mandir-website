import test from 'node:test'
import assert from 'node:assert/strict'
import { ENQUIRY_ERROR_MESSAGES, getEnquirySubmissionError } from '../src/lib/enquiry-errors.mjs'

test('successful form responses do not produce a submission error', () => {
  assert.equal(getEnquirySubmissionError(null, 200), null)
})

test('network failures use a connection message', () => {
  assert.equal(getEnquirySubmissionError(new TypeError('Failed to fetch')), ENQUIRY_ERROR_MESSAGES.network)
})

test('server and temporary service failures use a service message', () => {
  assert.equal(getEnquirySubmissionError(null, 503), ENQUIRY_ERROR_MESSAGES.service)
  assert.equal(getEnquirySubmissionError(Object.assign(new Error('internal route detail'), { code: 'SERVICE_UNAVAILABLE' })), ENQUIRY_ERROR_MESSAGES.service)
})

test('validation failures use the required-fields message', () => {
  assert.equal(getEnquirySubmissionError(Object.assign(new Error('backend schema detail'), { code: 'VALIDATION_FAILURE' })), ENQUIRY_ERROR_MESSAGES.validation)
})

test('form provider failures do not expose their HTTP status or response details', () => {
  assert.equal(getEnquirySubmissionError(null, 422), ENQUIRY_ERROR_MESSAGES.submission)
  assert.doesNotMatch(ENQUIRY_ERROR_MESSAGES.submission, /Netlify|Vercel|HTTP|provider|API/i)
})

test('unexpected backend failures use a support message and hide the exception', () => {
  const message = getEnquirySubmissionError(new Error('token=secret stack trace'))
  assert.equal(message, ENQUIRY_ERROR_MESSAGES.unexpected)
  assert.doesNotMatch(message, /secret|stack trace|Netlify|HTTP/i)
})
