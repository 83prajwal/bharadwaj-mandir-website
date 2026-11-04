// ============================================================================
//  SAMPLE / PLACEHOLDER CONTENT
//  Items marked `confirmed: false` are not yet confirmed by Bharadwaj Mandir.
//  Replace the values with real details, then set `confirmed: true`.
// ============================================================================

// Real, widely used Sanskrit prayer.
export const heroShloka = {
  devanagari: 'सर्वे भवन्तु सुखिनः । सर्वे सन्तु निरामयाः ॥',
  transliteration: 'Sarve bhavantu sukhinaḥ, sarve santu nirāmayāḥ',
  meaning: 'May all be happy; may all be free from suffering.',
}

export const blessingLine = { devanagari: 'ॐ नमः शिवाय', english: 'Om Namah Shivaya' }

export const visitInfo = {
  confirmed: false,
  addressLines: ['Bharadwaj Mandir', 'Workshop / showroom address to be confirmed', 'City, State, PIN'],
  // Exact address or Google Maps place name. When empty, the map area shows a
  // placeholder instead of pointing visitors to a wrong location.
  mapQuery: '',
}

export const socialLinks = {
  confirmed: false,
  // Add real profile URLs. Items with an empty url are shown as "coming soon".
  items: [
    { id: 'instagram', label: 'Instagram', url: '' },
    { id: 'facebook', label: 'Facebook', url: '' },
    { id: 'youtube', label: 'YouTube', url: '' },
  ],
}
