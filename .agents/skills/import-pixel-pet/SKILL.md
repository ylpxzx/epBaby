---
name: import-pixel-pet
description: Legacy epBaby-only import helper for converting already-approved sprite sheets, indexed frames, bead charts, or existing generators into editable EditorProject files and wiring them into the default library. Use for compatibility imports and deterministic revisions, not for the full reference-to-actions-to-charts-to-pet creation flow; use create-epbaby-pixel-pet for new end-to-end pets. Do not use outside this repository.
---

# Import Pixel Pet

Convert reference artwork into a deterministic, editable `EditorProject` while preserving the supplied character instead of loosely redrawing it.

For a new pet that still needs action design, frame-count review, bead-chart generation, compact layout, and chart-exact reconstruction, use `create-epbaby-pixel-pet` instead.

## Guard the scope

1. Confirm the workspace contains `src/shared/editor-project.ts`, `src/main/editor-project-store.ts`, and `default-pets/`.
2. Stop if those files are absent; this Skill is only for epBaby.
3. Preserve existing pets unless the user explicitly asks to replace or remove them.
4. Do not launch Electron unless the user asks. Generate, preview, typecheck, and build by default.

Read [references/epbaby-contract.md](references/epbaby-contract.md) before changing storage, startup seeding, rendering, or package scripts.

## Choose the import method

- For an approved concept sheet or sprite sheet, use it as the pixel source. Decode, remove only edge-connected background, isolate poses by segment and connected component, downsample with hard pixels, then quantize to a fixed palette.
- For multiple reference illustrations without an approved pixel concept, first establish one consistent action sheet. Use image generation only when the user wants a new visual design; never replace an approved target with a merely similar redraw.
- For an already indexed pixel project, edit its generator or JSON deterministically instead of generating a new raster image.

Use `scripts/generate-role-cat.mjs` as the working extraction example. Create a sibling `scripts/generate-<pet-id>.mjs` for a new pet; do not overwrite another pet's generator.

## Import workflow

1. Inspect every reference image at original detail. Record identity invariants, action poses, prop ownership, ground line, and background type.
2. Select the smallest canvas that preserves the approved design:
   - 48×48 for simple silhouettes.
   - 96×96 for detailed single-character animation.
   - 128×128 for tall characters, vehicles, umbrellas, wings, or large props.
3. Assign a stable lowercase kebab-case project ID. Keep it unchanged across revisions.
4. Build the generator with these stages:
   - Decode the source locally; avoid network dependencies.
   - Flood-fill only background-like pixels connected to image edges so enclosed white faces and pale props survive.
   - Segment poses with explicit horizontal bounds.
   - Keep the dominant connected component and meaningful attached prop components; reject neighboring-character fragments.
   - Downsample without interpolation and map colors into a fixed palette of at most 256 entries with index `0` equal to `#00000000`.
   - Split pixels into stable `body`, `costume`, `face`, and `prop` layers when practical.
   - Use the approved pose as the anchor frame. Animate integer layer/component offsets and small deterministic effects; never redraw the identity per frame.
5. Generate exactly the requested number of frames. Default to 20 only when the request or existing character convention requires it.
6. Fix every pivot to one ground anchor for the action set. Keep all cels at the full canvas length and all offsets at integers.
7. Render a four-keyframe-per-action overview with `scripts/render-project-preview.mjs` and inspect it visually. Look for cross-column fragments, missing limbs, detached props, layer seams, clipped effects, and inconsistent scale.
8. Run the bundled validator:

   ```cmd
   node .agents\skills\import-pixel-pet\scripts\validate-project.mjs default-pets\<pet-id>.json 20
   ```

9. Add the generator to `pet:generate-default`, seed the JSON with a new one-time migration ID, and confirm `vite.config.ts` still copies all `default-pets` files.
10. Run `npm.cmd run build`. Do not report completion if validation or build fails.

## Revision rules

- Increase the migration suffix (`v2`, `v3`, …) when a bundled pet must replace its earlier installed default.
- Use `v1` for a genuinely new pet ID.
- Do not change a migration ID after release; add another ID.
- Direct-source fidelity takes precedence over adding procedural detail.
- Keep locomotion names detectable by `isLocomotionAction` only when the desktop window should actually move.
- Make preview output derive from the final JSON, not from the concept image.

## Handoff

Report the project JSON, generator, preview, migration location, canvas size, action/frame totals, validator result, and build result. State whether the app was launched.
