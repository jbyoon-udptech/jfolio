"use client";

import { useState } from "react";
import type { PortfolioTrendSeries } from "@/lib/dashboard";
import type { HistoryPoint } from "@/lib/types";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

const WIDTH = 800;
const PAD = 10;
const GRID_FRACTIONS = [0, 0.5, 1] as const;
const MAX_X_TICKS = 5;
const TOOLTIP_EDGE = 150;

const SERIES_COLORS: readonly string[] = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length] ?? "var(--accent)";
}

function formatXAxisLabel(asOf: string, interval: "hourly" | "daily"): string {
  return interval === "hourly"
    ? formatDateTime(asOf, { seconds: false }).replace(/^\d{4}-/, "")
    : formatDate(asOf);
}

/**
 * UI-001: one line per portfolio on a shared value axis. Missing points split
 * each line into segments instead of interpolating across the gap.
 */
export function PortfolioTrendChart({
  series,
  currency,
  height = 260,
  interval = "daily",
}: {
  series: PortfolioTrendSeries[];
  currency: string;
  height?: number;
  interval?: "hourly" | "daily";
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const referencePoints = series.reduce<HistoryPoint[]>(
    (longest, item) => (item.points.length > longest.length ? item.points : longest),
    [],
  );
  const finite = series
    .flatMap((item) => item.points.map((point) => point.totalAssetValue))
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (referencePoints.length === 0 || finite.length === 0) {
    return <div className="empty">표시할 데이터가 없습니다. (평가 불가 구간)</div>;
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const valueRange = max - min || Math.max(Math.abs(max), 1) * 0.01;
  const stepX =
    referencePoints.length > 1
      ? (WIDTH - PAD * 2) / (referencePoints.length - 1)
      : 0;
  const valueToY = (value: number) =>
    PAD + (1 - (value - min) / valueRange) * (height - PAD * 2);
  const ticks = GRID_FRACTIONS.map((fraction) => ({
    fraction,
    value: max - fraction * valueRange,
    y: PAD + fraction * (height - PAD * 2),
  }));
  const xTickCount = Math.min(MAX_X_TICKS, referencePoints.length);
  const xTicks = Array.from({ length: xTickCount }, (_, tickIndex) => {
    const index =
      xTickCount === 1
        ? 0
        : Math.round(
            (tickIndex * (referencePoints.length - 1)) / (xTickCount - 1),
          );
    const point = referencePoints[index];
    if (!point) return [];
    return [
      {
        index,
        x: PAD + index * stepX,
        minor: tickIndex > 0 && tickIndex < xTickCount - 1 && tickIndex % 2 === 1,
        align:
          tickIndex === 0
            ? "start"
            : tickIndex === xTickCount - 1
              ? "end"
              : "center",
        label: formatXAxisLabel(point.asOf, interval),
      },
    ];
  }).flat();

  const segmentsBySeries = series.map((item) => {
    const segments: Array<Array<{ x: number; y: number }>> = [];
    let current: Array<{ x: number; y: number }> = [];
    item.points.forEach((point, index) => {
      if (point.totalAssetValue === null || !Number.isFinite(point.totalAssetValue)) {
        if (current.length > 0) segments.push(current);
        current = [];
        return;
      }
      current.push({ x: PAD + index * stepX, y: valueToY(point.totalAssetValue) });
    });
    if (current.length > 0) segments.push(current);
    return segments;
  });

  const activePoint = activeIndex === null ? undefined : referencePoints[activeIndex];
  const activeRows =
    activeIndex === null
      ? []
      : series.map((item, index) => {
          const value = item.points[activeIndex]?.totalAssetValue;
          return {
            id: item.id,
            label: item.label,
            color: seriesColor(index),
            value:
              value !== null && value !== undefined && Number.isFinite(value)
                ? value
                : null,
          };
        });
  const activeY = activeRows.reduce<number | null>((top, row) => {
    if (row.value === null) return top;
    const y = valueToY(row.value);
    return top === null || y < top ? y : top;
  }, null);
  const active =
    activeIndex !== null && activePoint && activeY !== null
      ? {
          x: PAD + activeIndex * stepX,
          y: activeY,
          label:
            interval === "hourly"
              ? formatDateTime(activePoint.asOf, { seconds: false })
              : formatDate(activePoint.asOf),
        }
      : null;
  const tooltipLeft = active
    ? `clamp(${TOOLTIP_EDGE}px, ${(active.x / WIDTH) * 100}%, calc(100% - ${TOOLTIP_EDGE}px))`
    : "0%";
  const tooltipTransform =
    active && active.y < 96
      ? "translate(-50%, 10px)"
      : "translate(-50%, calc(-100% - 10px))";

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (referencePoints.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;

    const viewBoxX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const rawIndex = stepX > 0 ? Math.round((viewBoxX - PAD) / stepX) : 0;
    const index = Math.max(0, Math.min(referencePoints.length - 1, rawIndex));
    const hasValue = series.some((item) => {
      const value = item.points[index]?.totalAssetValue;
      return value !== null && value !== undefined && Number.isFinite(value);
    });
    if (!hasValue) {
      setActiveIndex(null);
      return;
    }
    setActiveIndex(index);
  }

  return (
    <div>
      <div className="chart-legend">
        {series.map((item, index) => (
          <span className="chart-legend-item" key={item.id}>
            <span
              className="chart-legend-swatch"
              style={{ background: seriesColor(index) }}
              aria-hidden="true"
            />
            {item.label}
          </span>
        ))}
      </div>
      <div className="chart-with-axis">
        <div className="chart-y-axis" style={{ height }} aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick.fraction} className="chart-y-tick" style={{ top: tick.y }}>
              {formatCurrency(tick.value, currency)}
            </span>
          ))}
        </div>
        <div className="chart-main">
          <div className="chart-plot">
            <svg
              viewBox={`0 0 ${WIDTH} ${height}`}
              className="chart"
              style={{ height }}
              preserveAspectRatio="none"
              role="img"
              aria-label="포트폴리오별 평가금액 추이"
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setActiveIndex(null)}
            >
              <title>포트폴리오별 평가금액 추이</title>
              {ticks.map((tick) => (
                <line
                  key={tick.fraction}
                  x1={PAD}
                  x2={WIDTH - PAD}
                  y1={tick.y}
                  y2={tick.y}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
              ))}
              {xTicks.map((tick) => (
                <line
                  key={`x-${tick.index}`}
                  x1={tick.x}
                  x2={tick.x}
                  y1={height - PAD}
                  y2={height - PAD - 4}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
              ))}
              {active ? (
                <line
                  x1={active.x}
                  x2={active.x}
                  y1={PAD}
                  y2={height - PAD}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
              ) : null}
              {segmentsBySeries.map((segments, seriesIndex) =>
                segments.map((segment, segmentIndex) =>
                  segment.length > 1 ? (
                    <polyline
                      key={`${seriesIndex}-${segmentIndex}`}
                      points={segment
                        .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
                        .join(" ")}
                      fill="none"
                      stroke={seriesColor(seriesIndex)}
                      strokeWidth={2}
                    />
                  ) : (
                    <circle
                      key={`${seriesIndex}-${segmentIndex}`}
                      cx={segment[0]?.x}
                      cy={segment[0]?.y}
                      r={2.5}
                      fill={seriesColor(seriesIndex)}
                    />
                  ),
                ),
              )}
              {activeIndex !== null
                ? series.map((item, index) => {
                    const value = item.points[activeIndex]?.totalAssetValue;
                    if (
                      value === null ||
                      value === undefined ||
                      !Number.isFinite(value)
                    ) {
                      return null;
                    }
                    return (
                      <circle
                        key={item.id}
                        cx={active?.x}
                        cy={valueToY(value)}
                        r={3.5}
                        fill={seriesColor(index)}
                        stroke="var(--panel)"
                        strokeWidth={2}
                      />
                    );
                  })
                : null}
            </svg>
            {active ? (
              <div
                className="chart-tooltip chart-tooltip-wide"
                role="tooltip"
                style={{ left: tooltipLeft, top: active.y, transform: tooltipTransform }}
              >
                <span className="chart-tooltip-date">{active.label}</span>
                <div className="chart-tooltip-rows">
                  {activeRows.map((row) => (
                    <div className="chart-tooltip-row" key={row.id}>
                      <span
                        className="chart-tooltip-swatch"
                        style={{ background: row.color }}
                        aria-hidden="true"
                      />
                      <span className="chart-tooltip-label">{row.label}</span>
                      <strong className="chart-tooltip-value">
                        {row.value === null
                          ? "평가 불가"
                          : formatCurrency(row.value, currency)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="chart-x-axis" aria-hidden="true">
            {xTicks.map((tick) => (
              <span
                key={tick.index}
                className={`chart-x-tick ${tick.align}${tick.minor ? " minor" : ""}`}
                style={{ left: `${(tick.x / WIDTH) * 100}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
