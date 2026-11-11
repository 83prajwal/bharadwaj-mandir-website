const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY']

export function getMissingSupabaseCustomerConfig(env = process.env) {
  return REQUIRED_ENV.filter((name) => !env[name]?.trim())
}

export function createSupabaseCustomerRepository({ env = process.env, fetchImpl = fetch } = {}) {
  const missing = getMissingSupabaseCustomerConfig(env)
  if (missing.length) throw new Error('Supabase customer storage configuration is incomplete.')
  const baseUrl = env.SUPABASE_URL.trim().replace(/\/$/, '')
  const secretKey = env.SUPABASE_SECRET_KEY.trim()
  let parsedUrl
  try { parsedUrl = new URL(baseUrl) } catch { throw new Error('Supabase customer storage configuration is invalid.') }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
    throw new Error('Supabase customer storage configuration is invalid.')
  }

  async function request(table, query, { method = 'GET', body, prefer } = {}) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${table}?${query}`, {
      method,
      headers: {
        apikey: secretKey,
        'content-type': 'application/json',
        ...(prefer ? { prefer } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw Object.assign(new Error(`Supabase ${table} request failed (HTTP ${response.status}).`), { status: response.status })
    return response.status === 204 ? [] : response.json()
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
          method: 'POST', prefer: 'return=representation', body: values,
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
            method: 'POST', prefer: 'return=representation', body: { netlify_identity_id: identityId, ...values },
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
        })
        return rows[0] || null
      } catch (error) {
        if (error.status !== 409) throw error
        const existing = await this.findDesign(row.id, row.customer_id)
        if (!existing) {
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
        if (!rows[0]) throw Object.assign(new Error('Saved design is not available to this customer.'), { status: 409 })
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
