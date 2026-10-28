"use client";

import { useState } from "react";
import type { HistoryPoint } from "@/lib/types";
import { findChartExtremeAnnotations } from "@/lib/chart-annotations";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMonthDay,
  formatPercent,
} from "@/lib/format";

const WIDTH = 800;
const PAD = 10;
const GRID_FRACTIONS = [0, 0.5, 1] as const;
const MAX_X_TICKS = 5;
const TOOLTIP_EDGE = 84;

function formatXAxisLabel(asOf: string, interval: "hourly" | "daily"): string {
  return interval === "hourly"
    ? formatDateTime(asOf, { seconds: false }).replace(/^\d{4}-/, "")
    : formatDate(asOf);
}

/**
 * UI-004: a value-over-time chart that never interpolates across missing data.
 * Points whose `totalAssetValue` is null break the line into separate segments
 * so gaps are visible instead of being smoothed over.
 */
export function LineChart({
  points,
  currency,
  height = 220,
  interval = "daily",
}: {
  points: HistoryPoint[];
  currency: string;
  height?: number;
  interval?: "hourly" | "daily";
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const finite = points
    .map((p) => p.totalAssetValue)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  if (finite.length === 0) {
    return <div className="empty">표시할 데이터가 없습니다. (평가 불가 구간)</div>;
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min || Math.max(Math.abs(max), 1) * 0.01;
  const stepX = points.length > 1 ? (WIDTH - PAD * 2) / (points.length - 1) : 0;
  const valueToY = (value: number) =>
    PAD + (1 - (value - min) / range) * (height - PAD * 2);
  const ticks = GRID_FRACTIONS.map((fraction) => ({
    fraction,
    value: max - fraction * range,
    y: PAD + fraction * (height - PAD * 2),
  }));
  const xTickCount = Math.min(MAX_X_TICKS, points.length);
  const xTicks = Array.from({ length: xTickCount }, (_, tickIndex) => {
    const index =
      xTickCount === 1
        ? 0
        : Math.round((tickIndex * (points.length - 1)) / (xTickCount - 1));
    const point = points[index];
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

  const annotations = findChartExtremeAnnotations(points).map((annotation) => {
    const x = PAD + annotation.index * stepX;
    const y = valueToY(annotation.value);
    const horizontal = x < 110 ? "0" : x > WIDTH - 110 ? "-100%" : "-50%";
    const vertical =
      annotation.kind === "max" ? "10px" : "calc(-100% - 10px)";
    return {
      ...annotation,
      x,
      y,
      transform: `translate(${horizontal}, ${vertical})`,
      tone: changeClass(annotation.changeRate),
    };
  });

  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  points.forEach((point, index) => {
    if (point.totalAssetValue === null || !Number.isFinite(point.totalAssetValue)) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    current.push({ x: PAD + index * stepX, y: valueToY(point.totalAssetValue) });
  });
  if (current.length > 0) segments.push(current);

  const activePoint = activeIndex === null ? undefined : points[activeIndex];
  const activeValue = activePoint?.totalAssetValue;
  const active =
    activeIndex !== null &&
    activePoint &&
    activeValue !== null &&
    activeValue !== undefined &&
    Number.isFinite(activeValue)
      ? {
          x: PAD + activeIndex * stepX,
          y: valueToY(activeValue),
          value: activeValue,
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
    active && active.y < 72
      ? "translate(-50%, 10px)"
      : "translate(-50%, calc(-100% - 10px))";

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;

    const viewBoxX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const rawIndex = stepX > 0 ? Math.round((viewBoxX - PAD) / stepX) : 0;
    const index = Math.max(0, Math.min(points.length - 1, rawIndex));
    const value = points[index]?.totalAssetValue;
    if (value === null || value === undefined || !Number.isFinite(value)) {
      setActiveIndex(null);
      return;
    }
    setActiveIndex(index);
  }

  return (
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
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setActiveIndex(null)}
          >
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
            {segments.map((segment, index) =>
              segment.length > 1 ? (
                <polyline
                  key={index}
                  points={segment.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2}
                />
              ) : (
                <circle
                  key={index}
                  cx={segment[0]?.x}
                  cy={segment[0]?.y}
                  r={2.5}
                  fill="var(--accent)"
                />
              ),
            )}
            {annotations.map((annotation) => (
              <circle
                key={`extreme-${annotation.kind}`}
                cx={annotation.x}
                cy={annotation.y}
                r={3.5}
                fill={annotation.kind === "max" ? "var(--warn)" : "var(--chart-6)"}
                stroke="var(--panel)"
                strokeWidth={2}
              />
            ))}
            {active ? (
              <circle
                cx={active.x}
                cy={active.y}
                r={4}
                fill="var(--accent)"
                stroke="var(--panel)"
                strokeWidth={2}
              />
            ) : null}
          </svg>
          {annotations.map((annotation) => (
            <div
              key={`extreme-label-${annotation.kind}`}
              className="chart-annotation"
              style={{
                left: `${(annotation.x / WIDTH) * 100}%`,
                top: annotation.y,
                transform: annotation.transform,
              }}
              role="note"
              aria-label={`${annotation.kind === "max" ? "최대" : "최소"} ${formatMonthDay(annotation.asOf)} ${formatCurrency(annotation.value, currency)} ${formatPercent(annotation.changeRate)}`}
            >
              <span>{formatMonthDay(annotation.asOf)}</span>
              <span className={annotation.tone}>
                {formatPercent(annotation.changeRate)}
              </span>
            </div>
          ))}
          {active ? (
            <div
              className="chart-tooltip"
              role="tooltip"
              style={{ left: tooltipLeft, top: active.y, transform: tooltipTransform }}
            >
              <span className="chart-tooltip-date">{active.label}</span>
              <strong className="chart-tooltip-value">
                {formatCurrency(active.value, currency)}
              </strong>
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
  );
}

function changeClass(value: number | null): string {
  if (value === null) return "";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}
