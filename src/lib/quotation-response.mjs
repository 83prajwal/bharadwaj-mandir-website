function quotationValidationError(code) {
  return Object.assign(new Error(code === 'VALIDATION_FAILURE'
    ? 'Quotation request validation failed.'
    : code === 'SERVICE_UNAVAILABLE' ? 'Quotation service unavailable.' : 'Quotation validation response was unexpected.'), { code })
}

export async function parseQuotationValidationResponse(response) {
  const body = await response.text()
  const contentType = response.headers.get('content-type')?.split(';', 1)[0] || 'missing Content-Type'
  let result

  try {
    result = JSON.parse(body)
  } catch {
    const looksLikeHtml = contentType === 'text/html' || /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(body)
    if (looksLikeHtml && (response.status === 404 || response.ok)) {
      throw quotationValidationError('SERVICE_UNAVAILABLE')
    }
    if (response.status >= 500 || response.status === 404) throw quotationValidationError('SERVICE_UNAVAILABLE')
    if (response.status >= 400) throw quotationValidationError('VALIDATION_FAILURE')
    throw quotationValidationError('UNEXPECTED_RESPONSE')
  }

  if (!response.ok) {
    if (response.status >= 500 || response.status === 404) throw quotationValidationError('SERVICE_UNAVAILABLE')
    if (response.status >= 400) throw quotationValidationError('VALIDATION_FAILURE')
    throw quotationValidationError('UNEXPECTED_RESPONSE')
  }
  if (!result || result.ok !== true || typeof result.designName !== 'string') {
    throw quotationValidationError('UNEXPECTED_RESPONSE')
  }

  return result
}
