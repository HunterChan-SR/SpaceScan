import { useEffect, useRef, useState } from "react";
import { Folder, Layers } from "lucide-react";
import { layout, type Rect } from "./shared/treemap";
import { categoryColors, formatBytes } from "./shared/categories";
import type { Entry, MapEntry, Metric } from "./shared/types";

function inkFor(hex: string, depth: number, nested: boolean): string {
  const channels = [1, 3, 5].map(
    (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const whiteMix = nested ? 0 : depth === 1 ? 0.16 : depth === 2 ? 0.29 : 0;
  const linear = channels.map((channel) => {
    const value = nested ? channel * 0.92 : channel * (1 - whiteMix) + whiteMix;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
interface Props {
  entries: MapEntry[];
  total: number;
  metric: Metric;
  selected: number | null;
  groupedLabel: string;
  onSelect: (entry: Entry) => void;
  onOpen: (entry: Entry) => void;
}
export function Treemap({
  entries,
  total,
  metric,
  selected,
  groupedLabel,
  onSelect,
  onOpen,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const observer = new ResizeObserver(([item]) => {
      if (item)
        setSize({
          width: item.contentRect.width,
          height: item.contentRect.height,
        });
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const draw = (
    items: MapEntry[],
    value: number,
    box: Rect,
    depth: number,
    color?: string,
  ): React.ReactNode => {
    const weights = items.map((entry) => ({
      id: entry.id,
      weight: entry[metric],
    }));
    const remainder = Math.max(
      0,
      value - weights.reduce((n, item) => n + item.weight, 0),
    );
    if (remainder > 0) weights.push({ id: -1, weight: remainder });
    const byId = new Map(items.map((entry) => [entry.id, entry]));
    return layout(weights, box).map((tile) => {
      const entry = byId.get(tile.id);
      const palette = [
        "#7970d5",
        "#45a99a",
        "#749bcb",
        "#cd9560",
        "#b888ac",
        "#778ba8",
      ];
      const groupColor =
        entry?.kind === "directory"
          ? palette[
              [...entry.name].reduce(
                (n, c) => (n * 31 + c.charCodeAt(0)) >>> 0,
                0,
              ) % palette.length
            ]!
          : categoryColors[entry?.category ?? "other"];
      const gap = depth === 0 ? 4 : 2;
      const nested = !!(
        entry?.children?.length &&
        tile.width > 180 &&
        tile.height > 120
      );
      const style = {
        left: tile.x + gap / 2,
        top: tile.y + gap / 2,
        width: Math.max(0, tile.width - gap),
        height: Math.max(0, tile.height - gap),
        "--tile": color ?? groupColor,
        "--ink": inkFor(color ?? groupColor, depth, nested),
      } as React.CSSProperties;
      if (!entry)
        return (
          <div
            key="remainder"
            className="map-tile remainder"
            style={style}
            title={`${groupedLabel} · ${formatBytes(remainder)}`}
          >
            {tile.width > 65 && tile.height > 45 && (
              <span>
                <Layers size={13} /> {groupedLabel}
                <small>{formatBytes(remainder)}</small>
              </span>
            )}
          </div>
        );
      const header = nested ? 34 : 0;
      return (
        <div
          key={entry.id}
          className={`map-tile depth-${depth} ${selected === entry.id ? "selected" : ""} ${nested ? "nested" : ""}`}
          style={style}
        >
          <button
            className={`tile-hit ${nested ? "tile-header" : ""}`}
            aria-label={`${entry.name}, ${formatBytes(entry[metric])}`}
            title={`${entry.name}\n${formatBytes(entry[metric])}`}
            onClick={() => onSelect(entry)}
            onDoubleClick={() => onOpen(entry)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onOpen(entry);
              }
            }}
          >
            {tile.width > 48 && tile.height > 28 && (
              <span className="tile-name">
                {entry.kind === "directory" && tile.width > 90 && (
                  <Folder size={13} />
                )}
                <span className="tile-label">{entry.name}</span>
              </span>
            )}
            {!nested && tile.width > 68 && tile.height > 55 && (
              <small>{formatBytes(entry[metric])}</small>
            )}
            {nested && tile.width > 250 && (
              <small>{formatBytes(entry[metric])}</small>
            )}
          </button>
          {nested && (
            <div className="tile-children">
              {draw(
                entry.children!,
                entry[metric],
                {
                  x: 0,
                  y: header,
                  width: tile.width - gap,
                  height: tile.height - gap - header,
                },
                depth + 1,
                color ?? groupColor,
              )}
            </div>
          )}
        </div>
      );
    });
  };
  return (
    <div
      ref={ref}
      className="treemap"
      data-testid="treemap"
      aria-label="Treemap"
    >
      {size.width > 0 && draw(entries, total, { x: 0, y: 0, ...size }, 0)}
    </div>
  );
}
