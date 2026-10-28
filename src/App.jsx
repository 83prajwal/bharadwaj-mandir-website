import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect, useLayoutEffect } from 'react'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Products from './pages/Products'
import ProductDetails from './pages/ProductDetails'
import About from './pages/About'
import GalleryPage from './pages/GalleryPage'
import CustomMandir from './pages/CustomMandir'
import Contact from './pages/Contact'
import FAQ from './pages/FAQ'
import InternationalDelivery from './pages/InternationalDelivery'
import LegalPage from './pages/LegalPage'
import { products } from './data/products'
import CookieConsent from './components/CookieConsent'
import AnalyticsTracking from './components/AnalyticsTracking'
import EnquiryAssistant from './components/EnquiryAssistant'

function NotFound() {
  return <main className="page-shell"><section className="section-shell container"><p className="eyebrow">Page not found</p><h1>This page is unavailable.</h1><a className="btn btn-primary" href="/">Return home</a></section></main>
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
  }, [])
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

function getCanonicalOrigin() {
  const configured = import.meta.env.VITE_SITE_URL
  if (typeof configured !== 'string') return null
  try {
    const url = new URL(configured)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

const pageMetadata = {
  '/': ['Bharadwaj Mandir | Marble Mandir Designs', 'Explore marble mandir designs, workshop details and custom enquiry options from Bharadwaj Mandir.'],
  '/products': ['Marble Mandir Collection | Bharadwaj Mandir', 'Explore mandir designs and enquire about project specifications and quotations.'],
  '/custom-mandir': ['Custom Marble Mandir | Bharadwaj Mandir', 'Enquire about a custom marble mandir designed around your space and requirements.'],
  '/gallery': ['Marble Mandir Gallery | Bharadwaj Mandir', 'View marble mandir designs and craftsmanship from Bharadwaj Mandir.'],
  '/about': ['About Bharadwaj Mandir', 'Learn about the mandir designs and project approach presented by Bharadwaj Mandir.'],
  '/contact': ['Contact Bharadwaj Mandir', 'Send an enquiry about a marble mandir, home temple or custom marble craftsmanship.'],
  '/faq': ['Frequently Asked Questions | Bharadwaj Mandir', 'Answers to common questions about custom marble mandirs, dimensions and enquiries.'],
  '/international-delivery': ['International Delivery Enquiries | Bharadwaj Mandir', 'Ask Bharadwaj Mandir to confirm shipping and installation feasibility for your destination.'],
  '/privacy': ['Privacy Notice | Bharadwaj Mandir', 'How enquiry information is handled on the Bharadwaj Mandir website.'],
  '/terms': ['Website Terms | Bharadwaj Mandir', 'Website information and enquiry terms for Bharadwaj Mandir.'],
}

function PageMetadata() {
  const { pathname } = useLocation()
  useEffect(() => {
    const normalizedPath = pathname.replace(/\/+$/, '') || '/'
    const product = normalizedPath.startsWith('/products/') ? products.find((item) => `/products/${item.id}` === normalizedPath) : null
    const [title, description] = product
      ? [product.seoTitle, product.metaDescription]
      : pageMetadata[normalizedPath] || ['Page Not Found | Bharadwaj Mandir', 'Explore marble mandirs and craftsmanship from Bharadwaj Mandir.']
    document.title = title
    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title)
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description)
    const siteUrl = getCanonicalOrigin()
    let canonical = document.querySelector('link[rel="canonical"]')
    if (siteUrl) {
      if (!canonical) {
        canonical = document.createElement('link')
        canonical.rel = 'canonical'
        document.head.append(canonical)
      }
      const productPath = normalizedPath.startsWith('/products/') && !product ? null : normalizedPath
      if (productPath) canonical.href = `${siteUrl}${productPath === '/' ? '/' : productPath.replace(/\/+$/, '')}`
      else canonical?.remove()
    } else canonical?.remove()
  }, [pathname])
  return null
}

function AttributionCapture() {
  const { search, pathname } = useLocation()
  useEffect(() => {
    if (!sessionStorage.getItem('bm-landing-page')) sessionStorage.setItem('bm-landing-page', pathname)
    const params = new URLSearchParams(search)
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
      const value = params.get(key)
      if (value) sessionStorage.setItem(`bm-${key}`, value)
    }
  }, [search, pathname])
  return null
}

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <PageMetadata />
        <ScrollToTop />
        <AttributionCapture />
        <AnalyticsTracking />
        <Navbar />
        <div id="main-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<ProductDetails />} />
            <Route path="/custom-mandir" element={<CustomMandir />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/international-delivery" element={<InternationalDelivery />} />
            <Route path="/privacy" element={<LegalPage type="privacy" />} />
            <Route path="/terms" element={<LegalPage type="terms" />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
        <Footer />
        <CookieConsent />
        <EnquiryAssistant />
      </div>
    </BrowserRouter>
  )
}

export default App
