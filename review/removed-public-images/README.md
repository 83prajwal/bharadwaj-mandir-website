# Removed public image archive

All website image assets were removed from `public/` after the site code stopped referencing them. The files are retained outside `public/` for traceability and are not copied into the Vite production build.

- 100 original JPG photos are preserved at `review/ai-generation/references/images/`; their SHA-256 hashes were verified against the former public files before removal.
- 58 optimized WebP files are preserved under `review/removed-public-images/assets/optimized/`.
- The former SVG favicon is preserved at `review/removed-public-images/brand/favicon.svg`.
- `image-archive-manifest.csv` maps each former public path to its archive path, byte size, and SHA-256 hash.
- The former `src/data/galleryAssets.json`, which contained website image paths, is retained at `review/removed-public-images/source-data/galleryAssets.json` for reference.

The seven MP4 workshop videos remain under `public/videos/`. Their still-image posters were removed from the video data and no poster images are requested by the site.

The local production build will contain no image files. After deploying that build, purge the hosting/CDN cache and invalidate old image URLs; local removal cannot invalidate copies already served by a deployment or CDN.
