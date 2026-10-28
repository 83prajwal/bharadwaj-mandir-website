# AI product imagery workflow

`references/images/` is the non-public archive copy of the 100 source images formerly in `public/images/`. The public image files and customer-facing references have since been removed. Optimized WebP variants and the favicon are archived separately in `review/removed-public-images/`, outside Vite's `public/` tree.

`generation-manifest.json` maps the four existing product IDs to their reference image(s), planned main-image output paths, generation status, review status, approval state and notes. `prompts.md` contains the shared base prompt and product-specific prompts. Three products have a single visually supported main-image prompt. `floral-design-mandir` is held for client confirmation because its current photo appears to show an unfinished assembly. A potentially related peacock photo is recorded as an unconfirmed candidate and is not used as a generation reference.

## Current state

- Generated review tests: **1**. OpenArt CLI completed a reference-guided `image2image` test for `peacock-design-mandir` using Seedream 5 Pro, at 4:3, 1K, one output. The estimated cost was 30 credits.
- Test output: `generated/test-peacock/T26fE8y0g7pNNeskfIud.webp` (216,794 bytes). It has a large OpenArt watermark over the central motif and arch, so it is marked **needs revision** and is not approved for publication.
- Approved generated images: **0**. Nothing was routed into the live website.
- Existing product IDs, routes, product text, videos, and enquiry/lead behavior remain intact.
- Customer-facing pages are now text-led and image-free. The 7 workshop videos remain available without image posters. Rebuild and redeploy the site, then purge the hosting/CDN cache to invalidate previously deployed public image URLs.
- Generated images must be disclosed on product pages as AI-generated interior visualizations based on the product reference; never describe their room as a verified customer installation.

## Generation and approval steps

1. Provide the relevant archived reference image to a reference-conditioned image-generation/editing tool and use the corresponding prompt in `prompts.md`.
2. Save unoptimized generated masters under `review/ai-generation/generated/products/<product-id>/`. Do not put unreviewed output in `public/`.
3. Compare the generated image side by side with its reference. Reject geometry, carving, color, or inlay changes; record approval status and reviewer notes in `generation-manifest.json`.
4. Only after approval and if the business later requests images on the site, create a web-sized derivative and update the product presentation. Keep the generated master and all original references outside `public/` until that change is authorized.
5. Run `npm.cmd run check:assets`, `npm.cmd run build`, `npm.cmd run lint`, and `npm.cmd run test:lead`. Then visually inspect desktop and mobile layouts and the generated/product reference side by side.

The installed OpenArt CLI supports reference images through `openart generate image ... --image <local-file>`, which switches the request to `image2image`. Its model list and cost commands are `openart model list` and `openart model cost --model <id> --mode image2image`. Cost varies by configuration; the Seedream 5 Pro test used 4:3, 1K, one image and cost an estimated 30 credits. The active workspace had 40 credits before the test and 10 after it. The test result is watermarked and not approved for publication. Do not use it on the website.
