/**
 * Trend Signal orchestration — validates Wire data, avoids LLM fabrication,
 * and combines product-level + category-level Google Trends context.
 */

import {
  fetchTrendForKeyword,
  fetchRisingQueries,
  type TrendsData,
  type TrendsFetchResult,
} from '@/lib/wire';
import { generateTrendSignalNarrative } from '@/lib/groq';

export interface TrendTimelinePoint {
  date: string;
  value: number;
}

export interface TrendSourceView {
  source: 'product' | 'category';
  keyword: string;
  direction: 'Rising' | 'Flat' | 'Falling';
  directionIcon: '↗' | '→' | '↘';
  summary: string;
  buySignal?: string;
  timelineData: TrendTimelinePoint[];
}

export interface TrendSignalResult {
  status: 'available' | 'unavailable';
  unavailableMessage?: string;
  primary: TrendSourceView | null;
  secondary: Omit<TrendSourceView, 'buySignal'> | null;
  fallbackNotice?: string;
  risingQueries: string[];
}

export function parseTimelineFromRaw(raw: unknown): TrendTimelinePoint[] {
  if (!raw || typeof raw !== 'object') return [];

  if (Array.isArray(raw)) {
    const parsed = normalizeTimeline(raw);
    if (parsed.length > 0) return parsed;
  }

  const candidates: unknown[] = [];
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.timelineData)) candidates.push(obj.timelineData);
  if (Array.isArray(obj.timeline)) candidates.push(obj.timeline);
  if (Array.isArray(obj.data)) candidates.push(obj.data);
  if (Array.isArray(obj.points)) candidates.push(obj.points);

  const interest = obj.interest_over_time;
  if (interest && typeof interest === 'object') {
    const i = interest as Record<string, unknown>;
    if (Array.isArray(i.timeline_data)) candidates.push(i.timeline_data);
    if (Array.isArray(i.timelineData)) candidates.push(i.timelineData);
  }

  const nested = obj.default;
  if (nested && typeof nested === 'object') {
    const nestedTimeline = parseTimelineFromRaw(nested);
    if (nestedTimeline.length > 0) return nestedTimeline;
  }

  for (const arr of candidates) {
    const parsed = normalizeTimeline(arr);
    if (parsed.length > 0) return parsed;
  }

  // Deep fallback for data.data.data shape if unwrap missed it
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    const innerTimeline = parseTimelineFromRaw(obj.data);
    if (innerTimeline.length > 0) return innerTimeline;
  }

  return [];
}

function normalizeTimeline(arr: unknown): TrendTimelinePoint[] {
  if (!Array.isArray(arr)) return [];

  return arr
    .map((item): TrendTimelinePoint | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const valueRaw = row.value ?? row.values ?? row.formattedValue;
      let value: number;
      if (Array.isArray(valueRaw)) {
        value = Number(valueRaw[0]);
      } else {
        value = Number(String(valueRaw ?? '').replace(/[^0-9.-]/g, ''));
      }
      const date = String(row.date ?? row.time ?? row.formattedTime ?? row.formattedAxisTime ?? '');
      if (!date || Number.isNaN(value)) return null;
      return { date, value };
    })
    .filter((p): p is TrendTimelinePoint => p !== null);
}

export function enrichTrendsData(result: TrendsFetchResult): TrendsData | null {
  if (!result.success || !result.data) return null;

  const timelineData =
    result.data.timelineData?.length
      ? result.data.timelineData
      : parseTimelineFromRaw(result.data.raw ?? result.rawBody);

  return { ...result.data, timelineData };
}

/** Real data = non-empty time series with at least one non-zero value. */
export function hasRealTrendData(data: TrendsData | null | undefined): boolean {
  if (!data) return false;
  const timeline =
    data.timelineData?.length ? data.timelineData : parseTimelineFromRaw(data.raw);
  if (timeline.length === 0) return false;
  return timeline.some(p => p.value > 0);
}

function toTrendData(result: TrendsFetchResult): TrendsData | null {
  const enriched = enrichTrendsData(result);
  return hasRealTrendData(enriched) ? enriched : null;
}

function summarizeTimeline(timeline: TrendTimelinePoint[]) {
  if (!timeline || timeline.length === 0) return null;
  const latestValue = timeline[timeline.length - 1].value;
  let peakValue = -1;
  let peakDate = '';
  for (const p of timeline) {
    if (p.value > peakValue) {
      peakValue = p.value;
      peakDate = p.date;
    }
  }
  const last4 = timeline.slice(-4).map(p => p.value);
  const prior8 = timeline.slice(-12, -4).map(p => p.value);
  const avg4 = last4.length ? last4.reduce((a,b)=>a+b,0)/last4.length : 0;
  const avg8 = prior8.length ? prior8.reduce((a,b)=>a+b,0)/prior8.length : 0;
  let trend = 'flat';
  if (avg4 > avg8 * 1.1) trend = 'rising';
  else if (avg4 < avg8 * 0.9) trend = 'falling';
  
  return { trend, latestValue, peakValue, peakDate, last4WeekAvg: Math.round(avg4), prior8WeekAvg: Math.round(avg8) };
}

export async function buildTrendSignal(
  productName: string,
  categoryTerm: string
): Promise<TrendSignalResult> {
  const [productResult, categoryResult, risingQueries] = await Promise.all([
    fetchTrendForKeyword(productName, 'product'),
    categoryTerm.toLowerCase() !== productName.toLowerCase()
      ? fetchTrendForKeyword(categoryTerm, 'category')
      : Promise.resolve({
          keyword: categoryTerm,
          label: 'category' as const,
          success: false,
          data: null,
          error: 'Category matches product name',
          log: {
            label: 'category',
            keyword: categoryTerm,
            body: null,
            error: 'Category matches product name',
          },
        } satisfies TrendsFetchResult),
    fetchRisingQueries(categoryTerm).catch(() => [] as string[]),
  ]);

  const productData = toTrendData(productResult);
  const categoryData = toTrendData(categoryResult);
  const hasProduct = productData !== null;
  const hasCategory = categoryData !== null;

  if (!hasProduct && !hasCategory) {
    const errors = [productResult.error, categoryResult.error].filter(Boolean);
    console.warn('[Trends] No real trend data for product or category', {
      productName,
      categoryTerm,
      productLog: productResult.log,
      categoryLog: categoryResult.log,
      errors,
    });

    return {
      status: 'unavailable',
      unavailableMessage: 'Trend data unavailable for this product',
      primary: null,
      secondary: null,
      risingQueries: [],
    };
  }

  const primarySource: 'product' | 'category' = hasProduct ? 'product' : 'category';
  const primaryData = hasProduct ? productData! : categoryData!;
  const primaryKeyword = hasProduct ? productName : categoryTerm;

  const secondaryData =
    hasProduct && hasCategory
      ? categoryData
      : !hasProduct && hasCategory
        ? null // category is primary; no secondary when product has no data
        : hasProduct && !hasCategory
          ? null
          : null;

  const secondarySource: 'product' | 'category' | null =
    secondaryData ? 'category' : null;

  const narrative = await generateTrendSignalNarrative({
    productName,
    categoryTerm,
    primary: {
      source: primarySource,
      keyword: primaryKeyword,
      data: summarizeTimeline(primaryData.timelineData ?? []),
    },
    secondary:
      secondaryData && secondarySource
        ? { source: secondarySource, keyword: categoryTerm, data: summarizeTimeline(secondaryData.timelineData ?? []) }
        : null,
  }).catch(e => {
    console.error('[Trends] LLM narrative failed:', e);
    return null;
  });

  if (!narrative) {
    return {
      status: 'unavailable',
      unavailableMessage: 'Trend data unavailable for this product',
      primary: null,
      secondary: null,
      risingQueries: [],
    };
  }

  const fallbackNotice =
    !hasProduct && hasCategory
      ? `${productName} doesn't have enough individual search data, but here's the trend for "${categoryTerm}" generally`
      : undefined;

  const primary: TrendSourceView = {
    source: primarySource,
    keyword: primaryKeyword,
    direction: narrative.primary.direction,
    directionIcon: narrative.primary.directionIcon,
    summary: narrative.primary.summary,
    buySignal: narrative.primary.buySignal,
    timelineData: primaryData.timelineData ?? [],
  };

  const secondary: Omit<TrendSourceView, 'buySignal'> | null =
    secondaryData && narrative.secondary
      ? {
          source: 'category',
          keyword: categoryTerm,
          direction: narrative.secondary.direction,
          directionIcon: narrative.secondary.directionIcon,
          summary: narrative.secondary.summary,
          timelineData: secondaryData.timelineData ?? [],
        }
      : null;

  return {
    status: 'available',
    primary,
    secondary,
    fallbackNotice,
    risingQueries: risingQueries.slice(0, 3),
  };
}
