export const ENQUIRY_ERROR_MESSAGES = {
  submission: "We couldn't submit your enquiry right now. Please try again in a few moments.",
  service: 'Our enquiry service is temporarily unavailable. Please try again shortly.',
  network: 'Please check your internet connection and try submitting your enquiry again.',
  validation: 'Please check the required fields and try again.',
  unexpected: 'Something went wrong while submitting your enquiry. Please contact our team for assistance.',
}

export function getEnquirySubmissionError(error, responseStatus) {
  if (!error && responseStatus >= 200 && responseStatus < 300) return null
  if (error?.code === 'VALIDATION_FAILURE') return ENQUIRY_ERROR_MESSAGES.validation
  if (error?.code === 'SERVICE_UNAVAILABLE') return ENQUIRY_ERROR_MESSAGES.service
  if (error instanceof TypeError) return ENQUIRY_ERROR_MESSAGES.network
  if (Number.isInteger(responseStatus)) {
    if (responseStatus >= 500) return ENQUIRY_ERROR_MESSAGES.service
    if (responseStatus >= 400) return ENQUIRY_ERROR_MESSAGES.submission
  }
  return ENQUIRY_ERROR_MESSAGES.unexpected
}
