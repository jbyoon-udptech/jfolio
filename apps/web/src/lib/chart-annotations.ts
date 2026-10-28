/**
 * Max/min annotations for the valuation charts. `changeRate` is the percentage
 * move from the extreme point to the latest finite value of the same series,
 * matching the dashboard convention: (current - point) / point * 100.
 */

export interface ChartPoint {
  asOf: string;
  totalAssetValue: number | null | undefined;
}

export type ChartExtremeKind = "max" | "min";

export interface ChartExtremeAnnotation {
  kind: ChartExtremeKind;
  /** Index in the chart's point array. */
  index: number;
  asOf: string;
  value: number;
  /** Percent change from this point to the series' latest finite value. */
  changeRate: number | null;
}

export interface SeriesChartExtremeAnnotation extends ChartExtremeAnnotation {
  seriesIndex: number;
}

interface Candidate {
  seriesIndex: number;
  index: number;
  value: number;
  asOf: string;
}

function isFiniteValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function changeRate(current: number | null, value: number): number | null {
  if (current === null || value <= 0) return null;
  return ((current - value) / value) * 100;
}

/** Find the max/min point across one or more series on a shared chart. */
export function findSeriesChartExtremes(
  series: ReadonlyArray<{ points: readonly ChartPoint[] }>,
): SeriesChartExtremeAnnotation[] {
  const currents: Array<number | null> = [];
  let max: Candidate | null = null;
  let min: Candidate | null = null;
  let finiteCount = 0;

  series.forEach((item, seriesIndex) => {
    let current: number | null = null;
    item.points.forEach((point, index) => {
      if (!isFiniteValue(point.totalAssetValue)) return;
      const value = point.totalAssetValue;
      current = value;
      finiteCount += 1;
      const candidate: Candidate = {
        seriesIndex,
        index,
        value,
        asOf: point.asOf,
      };
      if (max === null || value > max.value) max = candidate;
      if (min === null || value < min.value) min = candidate;
    });
    currents[seriesIndex] = current;
  });

  // A single finite point has no meaningful shape and its two labels would sit
  // on top of each other.
  if (finiteCount < 2 || max === null || min === null) return [];
  const maxCandidate: Candidate = max;
  const minCandidate: Candidate = min;

  const toAnnotation = (
    kind: ChartExtremeKind,
    candidate: Candidate,
  ): SeriesChartExtremeAnnotation => ({
    kind,
    seriesIndex: candidate.seriesIndex,
    index: candidate.index,
    asOf: candidate.asOf,
    value: candidate.value,
    changeRate: changeRate(currents[candidate.seriesIndex] ?? null, candidate.value),
  });

  const annotations = [toAnnotation("max", maxCandidate)];
  // Flat data puts both extrema on the same point; one label is enough.
  if (
    maxCandidate.seriesIndex !== minCandidate.seriesIndex ||
    maxCandidate.index !== minCandidate.index
  ) {
    annotations.push(toAnnotation("min", minCandidate));
  }
  return annotations;
}

/** Single-series wrapper used by the asset valuation chart. */
export function findChartExtremeAnnotations(
  points: readonly ChartPoint[],
): ChartExtremeAnnotation[] {
  return findSeriesChartExtremes([{ points }]).map((item) => ({
    kind: item.kind,
    index: item.index,
    asOf: item.asOf,
    value: item.value,
    changeRate: item.changeRate,
  }));
}
