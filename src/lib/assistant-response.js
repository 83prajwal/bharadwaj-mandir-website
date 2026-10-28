export async function readAssistantResponse(response) {
  const body = await response.text()
  let data
  try {
    data = body ? JSON.parse(body) : null
  } catch {
    data = null
  }

  if (!data || response.status === 404) {
    const error = new Error('The assistant endpoint is unavailable or returned an unreadable response.')
    error.code = 'ASSISTANT_ENDPOINT_UNAVAILABLE'
    throw error
  }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The assistant is temporarily unavailable.')
  if (typeof data.answer !== 'string' || !data.answer.trim()) {
    const error = new Error('The assistant returned an invalid response.')
    error.code = 'ASSISTANT_ENDPOINT_UNAVAILABLE'
    throw error
  }
  return data
}
