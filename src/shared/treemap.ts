export interface Weighted {
  id: number;
  weight: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Tile extends Rect {
  id: number;
}
// Squarified treemap: rows are committed when the worst aspect ratio stops improving.
export function layout(items: Weighted[], bounds: Rect): Tile[] {
  const positive = items
    .filter((item) => Number.isFinite(item.weight) && item.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const sum = positive.reduce((n, item) => n + item.weight, 0);
  if (!sum || bounds.width <= 0 || bounds.height <= 0) return [];
  const scaled = positive.map((item) => ({
    ...item,
    area: (item.weight / sum) * bounds.width * bounds.height,
  }));
  const result: Tile[] = [];
  let box = { ...bounds },
    row: typeof scaled = [],
    index = 0;
  const worst = (values: typeof scaled, side: number) => {
    if (!values.length || !side) return Infinity;
    const total = values.reduce((n, item) => n + item.area, 0);
    const max = values[0]!.area,
      min = values[values.length - 1]!.area;
    return Math.max(
      (side * side * max) / (total * total),
      (total * total) / (side * side * min),
    );
  };
  const commit = () => {
    const total = row.reduce((n, item) => n + item.area, 0);
    const vertical = box.width >= box.height;
    const side = vertical ? box.height : box.width;
    const thickness = total / side;
    let offset = 0;
    row.forEach((item, i) => {
      const length =
        i === row.length - 1 ? side - offset : item.area / thickness;
      result.push({
        id: item.id,
        x: box.x + (vertical ? 0 : offset),
        y: box.y + (vertical ? offset : 0),
        width: vertical ? thickness : length,
        height: vertical ? length : thickness,
      });
      offset += length;
    });
    box = vertical
      ? {
          ...box,
          x: box.x + thickness,
          width: Math.max(0, box.width - thickness),
        }
      : {
          ...box,
          y: box.y + thickness,
          height: Math.max(0, box.height - thickness),
        };
    row = [];
  };
  while (index < scaled.length) {
    const next = scaled[index]!;
    const side = Math.min(box.width, box.height);
    if (!row.length || worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
      index++;
    } else commit();
  }
  if (row.length) commit();
  return result;
}
