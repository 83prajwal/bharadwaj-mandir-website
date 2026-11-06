export async function readAssistantResponse(response) {
  const body = await response.text()
  let data
  try {
    data = body ? JSON.parse(body) : null
  } catch {
    data = null
  }

  if (response.status === 404) {
    const error = new Error(typeof data?.error === 'string'
      ? data.error
      : 'The assistant API route was not found in this deployment. Please try again or use the enquiry form.')
    error.code = 'ASSISTANT_ENDPOINT_UNAVAILABLE'
    throw error
  }
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'The assistant is temporarily unavailable. Please try again or continue with the enquiry form.')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const error = new Error('The assistant is temporarily unavailable. Please try again or continue with the enquiry form.')
    error.code = 'ASSISTANT_RESPONSE_INVALID'
    throw error
  }
  if (typeof data.answer !== 'string' || !data.answer.trim()) {
    const error = new Error('The assistant returned an invalid response.')
    error.code = 'ASSISTANT_RESPONSE_INVALID'
    throw error
  }
  return data
}
