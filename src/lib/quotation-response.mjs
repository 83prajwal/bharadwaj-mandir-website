export async function parseQuotationValidationResponse(response) {
  const body = await response.text()
  const contentType = response.headers.get('content-type')?.split(';', 1)[0] || 'missing Content-Type'
  let result

  try {
    result = JSON.parse(body)
  } catch {
    const looksLikeHtml = contentType === 'text/html' || /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(body)
    if (looksLikeHtml && (response.status === 404 || response.ok)) {
      throw new Error(`The deployed quotation validation function was not reached (HTTP ${response.status}, ${contentType}). Redeploy the Netlify function with the site.`)
    }
    if (response.status >= 500) {
      throw new Error(`The quotation validation function or Netlify gateway failed before returning JSON (HTTP ${response.status}, ${contentType}). Check the deployed function logs.`)
    }
    throw new Error(`The quotation validation service returned a non-JSON response (HTTP ${response.status}, ${contentType}). Your request was not submitted.`)
  }

  if (!response.ok) {
    throw new Error(typeof result?.error === 'string' ? result.error : `Quotation validation failed (HTTP ${response.status}).`)
  }
  if (!result || result.ok !== true || typeof result.designName !== 'string') {
    throw new Error('The quotation validation service returned an unexpected JSON response. Your request was not submitted.')
  }

  return result
}
