import { test } from "node:test";
import assert from "node:assert/strict";
import { layout } from "../src/shared/treemap";
test("treemap covers its bounds proportionally without overlap", () => {
  // Deterministic varied weights exercise changing row aspect ratios and skinny rectangles.
  for (const count of [1, 2, 7, 70, 500])
    for (const [width, height] of [
      [1000, 600],
      [20, 500],
      [500, 20],
    ]) {
      const values = Array.from({ length: count }, (_, id) => ({
        id,
        weight: ((id * 37 + 17) % 101) + 1,
      }));
      const tiles = layout(values, {
        x: 11,
        y: 23,
        width: width!,
        height: height!,
      });
      const total = values.reduce((n, item) => n + item.weight, 0);
      assert.equal(tiles.length, count);
      for (const tile of tiles) {
        assert.ok(tile.x >= 11 - 1e-6 && tile.y >= 23 - 1e-6);
        assert.ok(
          tile.x + tile.width <= 11 + width! + 1e-6 &&
            tile.y + tile.height <= 23 + height! + 1e-6,
        );
        assert.ok(
          Math.abs(
            (tile.width * tile.height) / (width! * height!) -
              values[tile.id]!.weight / total,
          ) < 1e-8,
        );
      }
      for (let a = 0; a < tiles.length; a++)
        for (let b = a + 1; b < tiles.length; b++) {
          const x = tiles[a]!,
            y = tiles[b]!;
          assert.ok(
            Math.min(x.x + x.width, y.x + y.width) - Math.max(x.x, y.x) <
              1e-6 ||
              Math.min(x.y + x.height, y.y + y.height) - Math.max(x.y, y.y) <
                1e-6,
          );
        }
    }
});
test("empty, invalid and zero-sized weights produce no bogus rectangles", () => {
  assert.deepEqual(
    layout(
      [
        { id: 0, weight: 0 },
        { id: 1, weight: -1 },
        { id: 2, weight: NaN },
      ],
      { x: 0, y: 0, width: 100, height: 100 },
    ),
    [],
  );
  assert.deepEqual(
    layout([{ id: 0, weight: 2 }], { x: 0, y: 0, width: 0, height: 100 }),
    [],
  );
});
