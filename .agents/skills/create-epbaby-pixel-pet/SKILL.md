---
name: create-epbaby-pixel-pet
description: epBaby-only workflow for creating or revising editable pixel pets from character reference images and action descriptions, including smooth action sprites, deterministic bead charts, compact fixed-anchor canvases, validation, and default-library wiring. Use only inside the epBaby repository.
---

# Create epBaby Pixel Pet

Create a pet through three separately approved stages: action sprites, bead charts, then the editable pixel pet. Preserve identity, motion continuity, frame isolation, compact layout, and exact chart fidelity.

## Guard the scope

1. Confirm the workspace contains `src/shared/editor-project.ts`, `src/main/editor-project-store.ts`, `default-pets/`, and `reference/Beads_demo/`.
2. Stop if those paths are absent. Use this skill only for epBaby.
3. Preserve existing pets unless the user explicitly requests replacement or removal.
4. Do not launch Electron unless requested. Generate, preview, validate, typecheck, and build by default.
5. Read [the epBaby project contract](../import-pixel-pet/references/epbaby-contract.md) before changing storage, seeding, rendering, or package scripts.
6. Read [the bead-chart contract](references/beads-template.md) before generating charts.

## Require complete input

Require at least one clear character reference image, a list of required actions with a motion description for each, and identity invariants such as clothing, hairstyle, weapons, handedness, and props.

If the reference image or action descriptions are missing, pause and request them. Do not invent the character or action list. Assign a stable lowercase kebab-case pet ID and keep it unchanged across revisions.

## Stage 1: generate and approve action sprites

1. Generate every requested action as an isolated sprite sequence before creating charts.
2. Start each action at 8 frames. Choose the frame count independently per action.
3. Render playback at intended durations and inspect the full cycle, including last-to-first continuity for loops.
4. Accept a tier only when silhouette, center of mass, limbs, clothing, hair, weapons, and effects follow continuous trajectories; identity, scale, palette, viewpoint, ground line, and prop ownership stay stable; key motion poses read clearly; and playback has no jump, frozen interval, duplicate-frame pause, or temporal hitch.
5. If 8 frames fail, regenerate meaningful in-betweens at 16 frames. If 16 fail, regenerate at 32 frames. Never qualify by duplicating frames or using cross-fades.
6. Stop at the smallest passing tier: 8, 16, or 32. Record the count and reason for every action.
7. Keep one transparent hard-pixel image per frame. A sprite sheet may accompany individual files but must not replace them.

Do not start Stage 2 until all Stage 1 actions pass visual review.

## Choose a compact shared canvas

Use the smallest detail tier preserving identity and motion:

1. Try a native canvas up to 32 pixels on its longest side.
2. Increase to 64 when 32 loses anatomy, face, clothing, props, or action clarity.
3. Increase to 128 when 64 still loses necessary detail.
4. Use up to epBaby's 192 limit only for unavoidable oversized weapons, wings, vehicles, or effects. State why 128 was insufficient.

A tier is a maximum dimension, not a requirement to output a wasteful square. Calculate the aligned union bounds of all approved frames and crop to the smallest shared width and height containing that union plus minimal padding.

For the whole pet:

- use one shared canvas, scale, pivot, horizontal anchor, and ground line;
- translate only by integer pixels;
- place the union foreground near the top with a target top padding of 2 pixels and no more than 5% of canvas height unless raised content requires it;
- keep 1–3 pixels below the lowest union foreground pixel;
- keep 2–4 pixels at the left and right of the union bounds;
- derive width and height from content instead of centering inside a preset square.

Never recenter individual frames. Fixed character placement takes precedence over per-frame local centering.

## Stage 2: generate one bead chart per frame

Generate charts deterministically from approved Stage 1 images. Never use image generation to redraw or interpret a chart.

For every sprite frame:

1. Clear a fresh chart buffer.
2. Load only that frame. Never crop a multi-frame sheet without explicit verified bounds.
3. Preserve every occupied pixel and transparent cell exactly. Do not interpolate, antialias, smooth, or decorate inside the grid.
4. Map colors to a fixed palette with stable bead codes and index `0` reserved for transparency.
5. Follow `reference/Beads_demo/`: coordinate grid, heavy interval guides, bead codes in occupied cells, and an external legend with code, swatch, hex value, and exact count.
6. Keep the shared canvas, pivot, ground line, scale, and character coordinates unchanged across charts.
7. Name charts `<pet-id>-<action-id>-chart-NN-of-TT.png`.

The chart count must equal the approved sprite count. If chart playback exposes a hitch, return to Stage 1, promote 8→16 or 16→32, regenerate that action, and regenerate all its charts.

## Prohibit cross-frame contamination

Each chart must contain exactly one frame. Recreate extraction state and the destination buffer for every frame. Verify that no component, prop, effect, shadow, or pixel from an adjacent frame appears.

Require all of these per chart:

- occupied chart-cell count equals occupied source-pixel count;
- every palette-code count equals the indexed source count;
- reconstructing the chart yields the same indexed dimensions, palette indices, transparency, and pixel coordinates;
- the chart-to-source pixel diff is exactly zero.

Any nonzero difference or count mismatch is a failure. Fix extraction rather than hiding the discrepancy.

## Stage 3: build the pet only from approved charts

Treat the approved charts as the final source of truth. Do not redraw from the character reference or Stage 1 images.

1. Decode each chart grid deterministically into indexed pixels.
2. Exclude titles, coordinates, grid lines, legends, watermarks, and adjacent page content from extraction.
3. Preserve every occupied cell's coordinate and bead code exactly; preserve every empty cell as transparent.
4. Reuse the chart canvas, frame order, timing, pivot, anchor, and ground line without scaling or interpolation.
5. Create `scripts/generate-<pet-id>.mjs`; never overwrite another pet's generator.
6. Use a palette of at most 256 entries with index `0` exactly `#00000000`.
7. Create full-canvas cels for every layer and frame. Split stable `body`, `costume`, `face`, and `prop` layers when practical without changing the composite.
8. Round-trip the final project frame back to indexed pixels and compare it with the decoded chart. Require zero pixel differences and identical per-code counts for every frame.

“100% 按图纸还原” means zero coordinate, color-code, transparency, dimension, or frame-order differences. A visually similar result is not acceptable.

## Validate in order

1. Inspect every Stage 1 action at final timing and confirm its 8/16/32 tier.
2. Inspect every chart for fixed placement, compact padding, clipping, and contamination.
3. Run sprite-to-chart round-trip and per-code count checks for every frame.
4. Generate the project JSON exclusively from approved charts.
5. Run chart-to-project round-trip and per-code count checks for every frame.
6. Run `node .agents\skills\import-pixel-pet\scripts\validate-project.mjs default-pets\<pet-id>.json <expected-frames>` when all actions share a count. Otherwise omit the optional count and assert each action count in the generator.
7. Render final JSON with `scripts/render-project-preview.mjs` and inspect every frame.
8. Add the generator to `pet:generate-default` and add a one-time default migration.
9. Run `npm.cmd run build`.
10. Verify `dist/renderer/default-pets/<pet-id>.json` matches the source JSON.

Do not report completion when motion, isolation, padding, either round-trip, project validation, or build checks fail.

## Handoff

Report input references and actions; sprite files and previews; frame tier per action; chart directory and chart count; canvas, union bounds, pivot, ground line, and padding; sprite-to-chart and chart-to-project zero-diff results; project JSON, generator, migration, palette, layers, actions, and frames; validator/build results; and whether Electron was launched.
