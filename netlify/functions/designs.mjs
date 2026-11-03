import { getStore } from '@netlify/blobs'
import { createDesignHandler } from './lib/design-storage.mjs'

// Site-wide storage keeps saved configurations available across deploys.
export default createDesignHandler({ store: getStore('bharadwaj-mandir-designs') })
