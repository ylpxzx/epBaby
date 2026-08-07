# epBaby bead-chart contract

Use `reference/Beads_demo/拼豆图纸1.webp` and `reference/Beads_demo/拼豆图纸2.webp` only as layout references. Do not copy their characters, watermarks, or palettes.

## Required page structure

- Represent exactly one sprite frame in each chart file.
- Put column coordinates across the top and row coordinates along the side.
- Use a one-pixel-cell grid with heavier guides at regular counting intervals.
- Leave transparent source pixels as empty grid cells.
- Fill every occupied cell with its exact indexed color and print its stable bead code inside it.
- Put the title, action ID, `frame NN/TT`, legend, and all decoration outside the indexed grid.
- Include every used bead code in the legend with a color swatch, hex value, and exact quantity.
- Never put another pose, neighboring frame, watermark, or decorative character pixel inside the grid.

## Compact grid calculation

Align all actions first, calculate their shared union foreground bounds relative to the common pivot, then derive one project canvas:

- target 2 cells of top padding; allow at most 5% of canvas height unless raised foreground needs more;
- retain 1–3 cells below the lowest union foreground pixel;
- retain 2–4 cells on the left and right of the union foreground;
- prefer a non-square grid when content is not square;
- interpret 32, 64, 128, and 192 as longest-side detail tiers, not mandatory square dimensions.

Do not center each frame independently. The same character point must occupy the same grid coordinate in every chart.

## Isolation and round-trip proof

Start every frame with a new source crop, extraction state, pixel buffer, and chart document. Do not reuse uncleared buffers.

For each chart, record or print:

- action ID and frame index;
- source-frame dimensions and hash;
- source occupied-pixel count;
- chart occupied-cell count;
- count for every bead code;
- reconstructed indexed-frame hash or explicit zero-difference result.

Reject a chart when a cell exists outside the source-frame mask, any source pixel is missing, any bead code differs, any transparent cell becomes occupied, or reconstruction produces a nonzero pixel diff.

## Final pet fidelity

Decode the final `EditorProject` frame back to the same indexed grid and compare it to the approved chart. Require identical canvas dimensions, coordinates, palette codes, transparency, frame order, and per-code counts. Visual similarity is not evidence; only zero-difference comparison satisfies 100% chart reproduction.
