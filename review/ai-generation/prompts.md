# AI product-photo generation prompts

Use these prompts with **reference-guided image generation/image editing**, supplying only the listed primary reference for each product. Generate the main view only. No alternate angle is supported by the confirmed references. All generated results start as unapproved review candidates; do not copy them to `public/` until a person checks product fidelity.

The built-in image-generation tool was not available in the Codex session used for this work. The API/CLI fallback was not run. The prompts below are prepared for the next available image-to-image tool.

## Shared base prompt

**Use case:** product-mockup  
**Asset type:** premium e-commerce main product photograph for a marble mandir catalogue  
**Input image:** Image 1 is the primary product-identity reference. Preserve the exact product shown; do not treat the reference room, floor, lighting, camera artifacts, or loose décor as product features.  
**Style:** photorealistic commercial interior photography, not a 3D render or illustration.  
**Composition:** complete product visible, near-frontal camera view matching the evidence in Image 1, believable residential scale, enough space around the product, no crop through the product.  
**Lighting:** soft directional window daylight with restrained fill, natural contact shadows, controlled marble highlights, accurate neutral white balance, sharp visible carving and material texture.  
**Interior:** realistic Indian home prayer room with warm ivory or cream walls, natural stone floor and restrained wood details. Keep the mandir dominant and the room uncluttered.  
**Constraints:** preserve the exact silhouette, structure, proportions, arch or roof, pillars, base, visible carvings, colors, and inlay positions from Image 1. Change the photographic setting and lighting only. Do not invent hidden sides or details. Do not add or remove structural features. Keep all surfaces physically grounded with correct perspective and natural shadows.  
**Avoid:** extra pillars, domes, doors, carvings, inlays, deity statues, religious symbols, flowers, lamps, furniture, text, captions, labels, logos, watermark, artificial glow, blown highlights, oversaturated gold, plastic-looking marble, repeated or malformed geometry, floating objects, heavy blur, dramatic HDR, or promotional graphics. No claims that the scene is a real installation.

## `white-marble-mandir` — main image

**Reference:** `review/ai-generation/references/images/finished/white-marble-mandir.jpg` (original website path: `/images/finished/white-marble-mandir.jpg`).

**Product-specific prompt:** Show the same broad, built-in white mandir arrangement in the reference: the central scalloped niche, symmetrical side structure and columns, upper side canopies, and wide carved lower cabinet. Keep the relative widths and placement unchanged. The source is a wide frontal room view, so use a wide near-frontal composition. Preserve only the visible design. Do not convert it into a freestanding shrine or add new architectural sections. The reference contains loose objects in the prayer space; do not add unrelated décor or new statues. Create one polished but truthful interior photograph suitable for both a homepage hero and product-detail primary image.

**Proposed output:** `public/assets/ai-generated/products/white-marble-mandir/main.webp`  
**Status:** not generated; not reviewed; not approved.

## `peacock-design-mandir` — main image

**Reference:** `review/ai-generation/references/images/finished/peacock-design-mandir.jpg` (original website path: `/images/finished/peacock-design-mandir.jpg`). Do not use `/images/finished/IMG-20260320-WA0027.jpg` unless the client confirms it shows this exact product.

**Product-specific prompt:** Show the same freestanding white mandir in the reference, with its openwork carved crest, broad arched opening, two side columns, carved base and centered blue/turquoise peacock motif. Preserve the feather pattern, colors, scale and placement exactly as visible. Use a restrained contemporary Indian prayer-room setting with warm neutral walls and a pale stone floor. Keep a near-frontal view because no confirmed side view exists. Do not add other colored inlay, new motifs, extra pillars, a dome, statues or a different base.

**Proposed output:** `public/assets/ai-generated/products/peacock-design-mandir/main.webp`  
**Status:** not generated; not reviewed; not approved.

## `ornate-traditional-mandir` — main image

**Reference:** `review/ai-generation/references/images/finished/ornate-mandir.jpg` (original website path: `/images/finished/ornate-mandir.jpg`).

**Product-specific prompt:** Show the exact freestanding white mandir from the reference: its high ornate arch, existing blue and green decorative accents in their visible positions, side columns and carved drawer base. Preserve the number and spacing of the visible structural elements, the arch silhouette, and the existing accent pattern. Use a calm cream Indian home prayer room with subtle natural wood and stone. Keep a near-frontal portrait view; no reliable side view is available. Do not add gold inlay, additional peacock motifs, extra pillars, a dome, doors, statues, or new carvings. Keep the reference product geometry unchanged while improving only the room, lighting and camera presentation.

**Proposed output:** `public/assets/ai-generated/products/ornate-traditional-mandir/main.webp`  
**Status:** not generated; not reviewed; not approved.

## `floral-design-mandir` — held for verification

**Reference:** `review/ai-generation/references/images/finished/floral-design-mandir.jpg` (original website path: `/images/finished/floral-design-mandir.jpg`).

**Do not generate yet.** The photo appears to show an unfinished assembly with visible construction marks, and the “Floral Design” product identity is not established by the image. Ask the client for a clear finished-product photograph and confirmation of the product identifier. After confirmation, use the shared base prompt and describe only features visible in that approved finished reference.

**Proposed output:** `public/assets/ai-generated/products/floral-design-mandir/main.webp`  
**Status:** held; needs product verification; not approved.

## Additional views

Three-quarter, carving-detail, and interior-context variants are not queued. The confirmed products currently have one associated view each, and no reliable side/rear views establish hidden geometry. A human can approve further references first; otherwise keep one generated main image per product rather than publish invented views.
