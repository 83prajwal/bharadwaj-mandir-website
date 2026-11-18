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

// Footer blessings, shown in turn so customers of every tradition feel welcome.
// The first one honours all deities. Add, remove or reorder freely.
export const blessings = [
  { devanagari: 'ॐ सर्वदेवेभ्यो नमः', english: 'Om Sarva Devebhyo Namah', meaning: 'Salutations to all the divine' },
  { devanagari: 'ॐ गं गणपतये नमः', english: 'Om Gam Ganapataye Namah', meaning: 'Salutations to Lord Ganesha' },
  { devanagari: 'ॐ नमो भगवते वासुदेवाय', english: 'Om Namo Bhagavate Vasudevaya', meaning: 'Salutations to Lord Krishna' },
  { devanagari: 'श्री राम जय राम जय जय राम', english: 'Shri Ram Jai Ram Jai Jai Ram', meaning: 'Glory to Lord Rama' },
  { devanagari: 'ॐ श्री महालक्ष्म्यै नमः', english: 'Om Shri Mahalakshmyai Namah', meaning: 'Salutations to Goddess Lakshmi' },
  { devanagari: 'ॐ दुं दुर्गायै नमः', english: 'Om Dum Durgayai Namah', meaning: 'Salutations to Goddess Durga' },
  { devanagari: 'ॐ श्री हनुमते नमः', english: 'Om Shri Hanumate Namah', meaning: 'Salutations to Lord Hanuman' },
  { devanagari: 'ॐ ऐं सरस्वत्यै नमः', english: 'Om Aim Saraswatyai Namah', meaning: 'Salutations to Goddess Saraswati' },
  { devanagari: 'ॐ नमः शिवाय', english: 'Om Namah Shivaya', meaning: 'Salutations to Lord Shiva' },
]

export const visitInfo = {
  confirmed: false,
  addressLines: ['Bharadwaj Mandir', 'Workshop / showroom address to be confirmed', 'City, State, PIN'],
  // Exact address or Google Maps place name. When empty, the map area shows a
  // placeholder instead of pointing visitors to a wrong location.
  mapQuery: '',
}

export const socialLinks = {
  confirmed: true,
  items: [
    { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/bharadwajmandir/' },
    { id: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61586725754477' },
    { id: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/@BharadwajMandir' },
  ],
}
