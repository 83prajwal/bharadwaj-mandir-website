import providedGalleryImages from './providedGalleryImages.json' with { type: 'json' }

const videoPath = '/videos/'

const addedWorkshopVideos = [
  { id: 'video-20260422-144518-1', title: 'Marble mandir craftsmanship', category: 'Product and Craftsmanship', video: '/videos/20260422_144518%20%281%29.mp4', audioAvailable: true },
  { id: 'video-20260422-144700-1', title: 'Marble mandir craftsmanship', category: 'Product and Craftsmanship', video: '/videos/20260422_144700%20%281%29.mp4', audioAvailable: true },
  { id: 'video-20260422-145302', title: 'Marble mandir craftsmanship', category: 'Product and Craftsmanship', video: '/videos/20260422_145302.mp4', audioAvailable: true },
  { id: 'video-20260422-155143-2', title: 'Marble mandir craftsmanship', category: 'Product and Craftsmanship', video: '/videos/20260422_155143%20%282%29.mp4', audioAvailable: true },
  { id: 'video-20260513-184859-1', title: 'Marble mandir craftsmanship', category: 'Product and Craftsmanship', video: '/videos/20260513_184859%20%281%29.mp4', audioAvailable: true },
]

export const products = [
  {
    id: 'white-marble-mandir',
    name: 'Carved White Mandir with Drawer Base',
    category: 'Carved white design',
    image: '/assets/products/20260224-wa0022.jpg',
    imageWidth: 1024,
    imageHeight: 1536,
    imageAlt: 'White mandir with an ornate carved arch, side pillars and a drawer base',
    shortDescription: 'An ornate arch and carved details frame this white mandir, finished with a broad drawer base.',
    description: 'This photographed design has an open central shrine framed by a deeply carved arch and decorated side pillars. A broad lower cabinet with carved drawer fronts and small colored knobs completes the composition. The image shows a white finish; material and product specifications are not confirmed here.',
    seoTitle: 'Carved White Mandir with Drawer Base | Bharadwaj Mandir',
    metaDescription: 'See a carved white mandir design with an ornate arch, decorated pillars and drawer base. Enquire to confirm specifications and availability.',
    material: null,
    finish: null,
    dimensions: null,
    price: null,
    availability: null,
    customization: null,
    features: ['Open central shrine space', 'Ornate carved arch and side pillars', 'Carved drawer-front base'],
  },
  {
    id: 'peacock-design-mandir',
    name: 'White Mandir with Peacock Motif',
    category: 'Peacock motif',
    image: '/assets/products/ornate-marble-peacock-shrine-alcove.png',
    imageWidth: 877,
    imageHeight: 836,
    imageAlt: 'White mandir with a blue peacock motif on the central back panel',
    shortDescription: 'A blue peacock motif stands out against the white carved surround and broad base.',
    description: 'The central back panel features a prominent blue peacock motif. Carved columns and an ornamental arch frame the open shrine, with a wide lower platform beneath. The description reflects visible features in the supplied photograph; material and specifications require confirmation.',
    seoTitle: 'White Mandir with Peacock Motif | Bharadwaj Mandir',
    metaDescription: 'Explore a white mandir design with a blue peacock motif, carved columns and ornamental arch. Contact Bharadwaj Mandir to confirm details.',
    material: null,
    finish: null,
    dimensions: null,
    price: null,
    availability: null,
    customization: null,
    features: ['Blue peacock motif on the back panel', 'Carved columns and ornamental arch', 'Wide lower platform'],
  },
  {
    id: 'floral-design-mandir',
    name: 'Tall Mandir with Floral Carving',
    category: 'Floral carving',
    image: '/assets/products/ornate-white-marble-mandir-warm-lighting.png',
    imageWidth: 468,
    imageHeight: 1040,
    imageAlt: 'Tall white mandir with an intricately carved floral arch and lower cabinet',
    shortDescription: 'A tall carved arch and compact cabinet give this mandir a vertical profile.',
    description: 'This tall design pairs a detailed floral-style arch with carved columns and a lower cabinet. The full form is visible in the reference photograph, including the central shrine opening and base. The image shows a light-colored finish; material and other specifications are not confirmed.',
    seoTitle: 'Tall Mandir with Floral Carving | Bharadwaj Mandir',
    metaDescription: 'View a tall mandir design with a floral-style carved arch, columns and lower cabinet. Enquire to confirm product specifications.',
    material: null,
    finish: null,
    dimensions: null,
    price: null,
    availability: null,
    customization: null,
    features: ['Tall floral-style carved arch', 'Carved side columns', 'Lower cabinet with central shrine opening'],
  },
  {
    id: 'ornate-traditional-mandir',
    name: 'Open Mandir with Carved Screenwork',
    category: 'Traditional carved design',
    image: '/assets/products/ornate-marble-temple-pavilion-courtyard.png',
    imageWidth: 960,
    imageHeight: 1280,
    imageAlt: 'Open white mandir with carved pillars, an ornamental crest and lattice side panels',
    shortDescription: 'Carved pillars and delicate lattice panels shape this open, pavilion-like design.',
    description: 'An ornamental crest rises above the open shrine, while carved pillars and lattice side panels give the design a pavilion-like appearance. The photograph shows the mandir in an outdoor setting. Product materials, dimensions and installation details are not confirmed.',
    seoTitle: 'Open Mandir with Carved Screenwork | Bharadwaj Mandir',
    metaDescription: 'Discover an open mandir design with carved pillars, an ornamental crest and lattice side panels. Contact us to confirm specifications.',
    material: null,
    finish: null,
    dimensions: null,
    price: null,
    availability: null,
    customization: null,
    features: ['Open pavilion-like structure', 'Carved pillars and ornamental crest', 'Lattice side panels'],
  },
]

// Specs transcribed from the branded Bharadwaj Mandir drawing below.
// They describe that drawing only, not a current product or order.
export const designReferences = [
  {
    id: 'white-marble-elephant-fountain-shree-yantra',
    name: 'Custom Pure White Marble Mandir with Elephant Fountain and Shree Yantra',
    material: 'Pure White Vietnam Marble (as specified in the drawing)',
    finish: 'Polished (as specified in the drawing)',
    dimensions: 'Width 11 ft 9 in, height 10 ft, depth 1 ft 9 in (21 in), as shown on the drawing',
    features: [
      'Elephant fountain shown on the drawing',
      'Shree Yantra with brass inlay shown on the drawing',
      'Water recirculation is described in the drawing notes',
    ],
  },
]

export const galleryCategories = [
  'Design Concepts',
  'Our Images',
  'Product and Craftsmanship',
  'Reference images',
]

export const galleryImages = [
  ...providedGalleryImages,
  { id: 'video-carving', title: 'Stone carving in progress', category: 'Product and Craftsmanship', video: `${videoPath}stone-carving.mp4`, audioAvailable: true },
  { id: 'video-detail', title: 'Carved detail work', category: 'Product and Craftsmanship', video: `${videoPath}carving-detail.mp4`, audioAvailable: true },
  ...addedWorkshopVideos,
]

export const faqItems = [
  {
    question: 'Can I request a custom mandir design?',
    answer: 'You can enquire about a custom marble mandir and share your space and design requirements. Specific options are confirmed for each project.',
  },
  {
    question: 'Can I share size, carving or decorative details?',
    answer: 'Yes. Include your requested size, design, carving, marble and decorative details in your enquiry. Final specifications are confirmed with Bharadwaj Mandir.',
  },
  {
    question: 'How can I get pricing and availability?',
    answer: 'Contact Bharadwaj Mandir with your requirements for a quotation and availability details.',
  },
]

export const additionalFaqItems = [
  { question: 'Which marble is best for an indoor mandir?', answer: 'The right material depends on the design, finish, use and project requirements. Confirm the actual stone and its suitability with the team for the specific design.' },
  { question: 'Why is Makrana marble well known?', answer: 'Makrana is a marble-producing area in Rajasthan with a long association with marble craft. Confirm the documented origin of the stone used in any specific mandir.' },
  { question: 'Can an international buyer order a custom marble mandir?', answer: 'You can submit an enquiry from your country. The team must confirm destination, shipping and project feasibility individually.' },
  { question: 'Can a mandir be designed for an apartment?', answer: 'Share the available width, height, depth, access route and any building constraints. The team can discuss a design subject to project review.' },
  { question: 'How do I choose the right dimensions?', answer: 'Measure the intended space and access path, including doorways, lifts and stairs. Share the measurements and a photo or plan if useful.' },
  { question: 'What affects the cost of a custom mandir?', answer: 'Dimensions, design detail, material, finish, packing, freight, insurance, taxes and installation scope may affect a project quotation.' },
  { question: 'Can a mandir be shipped to my country?', answer: 'Tell us your destination and we will confirm feasibility. No universal delivery coverage is promised.' },
  { question: 'Is installation available in my country?', answer: 'Installation support depends on the destination and project. Ask the team to confirm responsibilities and local support.' },
  { question: 'How long might a custom mandir take?', answer: 'Timing depends on the confirmed design, production scope and logistics. Ask for an estimated schedule with the project quotation.' },
  { question: 'How should natural marble be cleaned?', answer: 'Use a soft cloth and a mild, stone-safe cleaner after checking suitability on a small area. Avoid acidic cleaners and follow material-specific care guidance.' },
  { question: 'Can I share drawings or reference images?', answer: 'Yes. Attach one JPG, PNG, WebP or PDF file up to 7 MB to the enquiry form. Our team can review your reference with the project details you provide.' },
  { question: 'How do import duties and taxes work?', answer: 'Import charges depend on destination rules and the confirmed shipping arrangement. Confirm responsibility and expected charges before ordering.' },
  { question: 'What happens if marble is damaged in transit?', answer: 'Ask for the quotation to specify packing, insurance, inspection and damage-claim steps before shipment. No claim outcome is guaranteed here.' },
  { question: 'Can architects and interior designers request project quotes?', answer: 'Yes. Select Architect or Interior designer in the enquiry form and share the project context, destination and available drawings.' },
]

export const deliveryPolicyFacts = [
  'International delivery and installation availability are not confirmed for every country or project. Share your destination, city and project details so the team can assess the options for your enquiry.',
  'Product price, packing and crating, freight and insurance, import duties and taxes, customs clearance, unloading and site access, and installation may be separate considerations. The quotation should identify the applicable scope and responsibilities. No fixed prices, delivery dates, duty treatment or installation coverage are promised on this page.',
  'Destination serviceability, applicable export and import requirements, packing needs and local installation support must be assessed for each project. Ask the team to confirm these details in writing before placing an order.',
]

export const navLinks = [
  { label: 'Collection', to: '/products' },
  { label: 'Custom Mandir', to: '/custom-mandir' },
  { label: 'Gallery', to: '/gallery' },
  { label: 'Our Story', to: '/about' },
  { label: 'Contact', to: '/contact' },
]

export const siteMeta = {
  title: 'Bharadwaj Mandir | Custom Marble Mandirs',
  description: 'Explore custom marble mandir designs and craftsmanship from Bharadwaj Mandir.',
}
