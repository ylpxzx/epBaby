# epBaby pixel-pet contract

## Required file map

- `src/shared/editor-project.ts`: project schema, normalization, 1–128 canvas limit.
- `src/main/editor-project-store.ts`: project save/load, seeding, one-time replacements.
- `src/main/index.ts`: startup migrations, runtime project map, locomotion behavior.
- `src/shared/pets.ts`: locomotion action detection.
- `src/renderer/lib/project-renderer.ts`: integer-scaled Canvas renderer.
- `scripts/render-project-preview.mjs`: renders final JSON keyframes for visual QA.
- `default-pets/`: bundled editable project JSON files.
- `vite.config.ts`: copies the whole bundled-pet directory into production output.

## EditorProject invariants

- `version` is `1`.
- `canvas.width` and `canvas.height` are integers from 1 through 128.
- `palette[0]` is exactly `#00000000`; palette length is at most 256.
- Every layer has a stable unique ID.
- Every action has at least one frame.
- Every cel has `canvas.width * canvas.height` integer palette indices.
- Every frame contains one cel for every project layer.
- Frame duration is between 20 and 5000 milliseconds.
- Pivot coordinates stay inside the canvas and use one ground anchor unless the design explicitly requires otherwise.
- Keep transparent background and hard indexed pixels; do not store antialiased alpha edges.

## Exact concept-sheet extraction

1. Decode PNG data to RGBA.
2. Mark background candidates using high brightness and low channel spread.
3. Flood from image edges; do not globally delete pale pixels.
4. Define one source interval per pose.
5. Find connected foreground components inside each interval.
6. Retain the main character plus components above a relative area threshold. Generate tiny detached effects procedurally.
7. Sample source pixel blocks without interpolation into the target canvas.
8. Quantize by nearest fixed-palette color.
9. Center all poses horizontally and align them to one ground line.

This avoids deleting white faces or scooters, importing fragments from adjacent poses, and introducing generated identity drift.

## Default-library wiring

For a new pet:

```ts
await editorStore.replaceProjectFileOnce(
  defaultPetProjectFile("<pet-id>.json"),
  "default-<pet-id>-v1"
);
```

For a bundled revision, add a new migration ID such as `default-<pet-id>-v2`. The replacement occurs once; later launches preserve user edits.

Append the new generator to the `pet:generate-default` package script. Do not replace existing generator commands unless the corresponding pet is intentionally removed.

## Runtime motion

`isLocomotionAction` controls whether the transparent Electron window moves horizontally. Use IDs/names containing `walk`, `run`, `move`, `ride`, `行走`, `奔跑`, or `骑行` only when window movement is intended. Avoid movement keywords for in-place reactions.

## Integer display scaling

The renderer selects an integer pixel size that fits the Canvas. A 128×128 pet needs a 280×260 desktop canvas to display at 2×. Verify large canvases do not fall back to an unexpectedly small 1× preview.

## Verification sequence

1. Run the pet generator.
2. Run `validate-project.mjs` with the expected frame count.
3. Render the final JSON preview.
4. Inspect every action at several frames.
5. Run `npm.cmd run build`.
6. Verify the generated pet JSON exists in `dist/renderer/default-pets/`.
