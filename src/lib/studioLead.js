const STUDIO_LEAD_API = '/api/studio-lead'

export async function postStudioLead(payload) {
  const response = await fetch(STUDIO_LEAD_API, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  let result = null
  try { result = await response.json() } catch { /* handled below */ }
  if (!response.ok || !result) throw Object.assign(new Error(result?.error || 'The service is unavailable.'), { status: response.status })
  return result
}
