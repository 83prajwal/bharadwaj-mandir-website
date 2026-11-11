const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY']

function getRequestStage(table, method) {
  if (table === 'customer_profiles') return method === 'GET' ? 'supabase_customer_profile_lookup' : 'supabase_customer_profile_write'
  if (table === 'saved_designs') return method === 'GET' ? 'supabase_saved_design_metadata_lookup' : 'supabase_saved_design_metadata_write'
  return 'supabase_request'
}

function safeProviderCode(value) {
  if (typeof value !== 'string') return undefined
  const knownCodes = new Set([
    'invalid_token', 'invalid_grant', 'invalid_credentials', 'user_not_found', 'email_not_confirmed',
    'ETIMEDOUT', 'ECONNABORTED', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT',
  ])
  if (knownCodes.has(value) || /^[0-9A-Z]{5}$/.test(value) || /^PGRST\d{3}$/.test(value) || /^BLOBS_[A-Z0-9_]{1,32}$/.test(value)) return value
  return undefined
}

function reportFailure(onError, fields) {
  try { onError?.(fields) } catch { /* Diagnostics must not affect the request. */ }
}

export function getMissingSupabaseCustomerConfig(env = process.env) {
  return REQUIRED_ENV.filter((name) => !env[name]?.trim())
}

export function createSupabaseCustomerRepository({ env = process.env, fetchImpl = fetch, onError } = {}) {
  const missing = getMissingSupabaseCustomerConfig(env)
  if (missing.length) throw new Error('Supabase customer storage configuration is incomplete.')
  const baseUrl = env.SUPABASE_URL.trim().replace(/\/$/, '')
  const secretKey = env.SUPABASE_SECRET_KEY.trim()
  let parsedUrl
  try { parsedUrl = new URL(baseUrl) } catch { throw new Error('Supabase customer storage configuration is invalid.') }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
    throw new Error('Supabase customer storage configuration is invalid.')
  }

  async function request(table, query, { method = 'GET', body, prefer, expectedConflict = false } = {}) {
    const stage = getRequestStage(table, method)
    let response
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/${table}?${query}`, {
        method,
        headers: {
          apikey: secretKey,
          'content-type': 'application/json',
          ...(prefer ? { prefer } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (error) {
      const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError' || ['ETIMEDOUT', 'ECONNABORTED'].includes(error?.code)
      reportFailure(onError, {
        stage,
        category: timeout ? 'timeout' : 'network_error',
        providerCode: safeProviderCode(error?.code),
      })
      throw Object.assign(new Error(`Supabase ${table} request failed.`), { code: 'SUPABASE_REQUEST_FAILED', internalFailure: true })
    }
    if (!response.ok) {
      let providerCode
      try { providerCode = safeProviderCode((await response.clone().json())?.code) } catch { /* Provider error text is intentionally ignored. */ }
      const status = response.status
      // Insert conflicts are an expected control path when the caller handles
      // them with a scoped read/update. Other conflicts are diagnostic failures.
      if (status !== 409 || !expectedConflict) reportFailure(onError, {
        stage,
        category: 'provider_http_error',
        status,
        providerCode,
      })
      throw Object.assign(new Error(`Supabase ${table} request failed (HTTP ${status}).`), {
        status,
        providerCode,
        code: 'SUPABASE_REQUEST_FAILED',
        internalFailure: true,
      })
    }
    if (response.status === 204) return []
    try {
      return await response.json()
    } catch {
      reportFailure(onError, { stage, category: 'invalid_provider_response', status: response.status })
      throw Object.assign(new Error(`Supabase ${table} returned an unreadable response.`), {
        code: 'SUPABASE_INVALID_RESPONSE',
        internalFailure: true,
      })
    }
  }

  return {
    async createProfileIfMissing({ identityId, fullName, email, phone, contactConsent }) {
      if (!identityId) throw new Error('Verified Netlify Identity user ID is required.')
      const existing = await this.findProfile(identityId)
      if (existing) return existing

      const values = {
        netlify_identity_id: identityId,
        full_name: fullName || '',
        email: String(email || '').trim().toLowerCase(),
        phone: phone || '',
        contact_consent: contactConsent === true,
      }
      try {
        const rows = await request('customer_profiles', 'select=*', {
          method: 'POST', prefer: 'return=representation', body: values, expectedConflict: true,
        })
        if (!rows[0]?.id) throw new Error('Supabase customer profile was not returned.')
        return rows[0]
      } catch (error) {
        // A concurrent recovery may have created the profile. Read that row
        // without updating it so a retry cannot overwrite existing details.
        if (error.status !== 409) throw error
        const concurrent = await this.findProfile(identityId)
        if (concurrent) return concurrent
        throw error
      }
    },
    async upsertProfile({ identityId, fullName, email, phone, contactConsent }) {
      if (!identityId) throw new Error('Verified Netlify Identity user ID is required.')
      const values = {
        full_name: fullName || '',
        email: String(email || '').trim().toLowerCase(),
        phone: phone || '',
        contact_consent: contactConsent === true,
        updated_at: new Date().toISOString(),
      }
      const existing = await this.findProfile(identityId)
      let rows
      if (existing) {
        rows = await request('customer_profiles', `netlify_identity_id=eq.${encodeURIComponent(identityId)}&select=*`, {
          method: 'PATCH', prefer: 'return=representation', body: values,
        })
      } else {
        try {
          rows = await request('customer_profiles', 'select=*', {
            method: 'POST', prefer: 'return=representation', body: { netlify_identity_id: identityId, ...values }, expectedConflict: true,
          })
        } catch (error) {
          // A concurrent request may have inserted this Identity user first.
          if (error.status !== 409) throw error
          rows = await request('customer_profiles', `netlify_identity_id=eq.${encodeURIComponent(identityId)}&select=*`, {
            method: 'PATCH', prefer: 'return=representation', body: values,
          })
        }
      }
      if (!rows[0]?.id) throw new Error('Supabase customer profile was not returned.')
      return rows[0]
    },
    async findProfile(identityId) {
      const rows = await request('customer_profiles', `netlify_identity_id=eq.${encodeURIComponent(identityId)}&select=*`)
      return rows[0] || null
    },
    async saveDesign(row) {
      try {
        const rows = await request('saved_designs', 'select=*', {
          method: 'POST',
          prefer: 'return=representation',
          body: row,
          expectedConflict: true,
        })
        return rows[0] || null
      } catch (error) {
        if (error.status !== 409) throw error
        const existing = await this.findDesign(row.id, row.customer_id)
        if (!existing) {
          reportFailure(onError, {
            stage: 'supabase_saved_design_metadata_write',
            category: 'ownership_conflict',
            status: error.status,
            providerCode: safeProviderCode(error.providerCode),
          })
          throw Object.assign(new Error('Saved design is not available to this customer.'), { status: 409 })
        }
        const values = { ...row }
        delete values.id
        delete values.customer_id
        const rows = await request('saved_designs', `id=eq.${encodeURIComponent(row.id)}&customer_id=eq.${encodeURIComponent(row.customer_id)}&select=*`, {
          method: 'PATCH',
          prefer: 'return=representation',
          body: values,
        })
        if (!rows[0]) {
          reportFailure(onError, { stage: 'supabase_saved_design_metadata_write', category: 'ownership_conflict', status: 409 })
          throw Object.assign(new Error('Saved design is not available to this customer.'), { status: 409 })
        }
        return rows[0]
      }
    },
    async findDesign(id, customerId) {
      const rows = await request('saved_designs', `id=eq.${encodeURIComponent(id)}&customer_id=eq.${encodeURIComponent(customerId)}&select=*`)
      return rows[0] || null
    },
    async findDesignById(id) {
      const rows = await request('saved_designs', `id=eq.${encodeURIComponent(id)}&select=*`)
      return rows[0] || null
    },
    async listDesigns(customerId) {
      return request('saved_designs', `customer_id=eq.${encodeURIComponent(customerId)}&select=*&order=updated_at.desc`)
    },
    async deleteDesign(id, customerId) {
      await request('saved_designs', `id=eq.${encodeURIComponent(id)}&customer_id=eq.${encodeURIComponent(customerId)}`, { method: 'DELETE' })
    },
  }
}
