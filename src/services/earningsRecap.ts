/**
 * Earnings Recap — Structured last-quarter anchor for long-term investors.
 *
 * Shows only when relevant: within 7 days after earnings, or revision spike
 * post-earnings, or significant price move post-earnings. Otherwise stale.
 *
 * Uses tools as single source of truth: getEarningsCalendar, getEarningsHistory, getPriceHistory.
 */

import { getEarningsCalendar, getEarningsHistory } from '../tools/earningsCalendar';
import { getPriceHistory, getClose } from '../tools/priceHistory';

export type GuidanceVerdict = 'Raised' | 'Lowered' | 'Reaffirmed' | null;
export type MarginsVerdict = 'Expanded' | 'Compressed' | 'Flat' | null;

export interface EarningsRecap {
  symbol: string;
  quarter: string;
  reportedDate: string;
  revenue: { actual: number; estimate: number | null; beatPct: number | null };
  eps: { actual: number; estimate: number | null; beatPct: number | null };
  guidance: GuidanceVerdict;
  margins: MarginsVerdict;
  marketReaction1to3DaysPct: number | null;
  narrativeSummary: string;
  /** Report date (YYYY-MM-DD) for "days since" logic */
  reportDate: string;
}

export interface EarningsRecapWithRelevance {
  recap: EarningsRecap;
  /** Only show in feed when true */
  shouldShow: boolean;
  daysSinceEarnings: number;
  reason: 'within_7d' | 'revision_spike_post_earnings' | 'price_move_post_earnings' | 'stale';
}

function formatReportDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec';
  const mon = months.split(' ')[d.getMonth()];
  return `${mon} ${d.getDate()}`;
}

/** Quarter label from report date (heuristic: calendar quarter). */
function quarterFromDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const q = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4;
  return `Q${q} FY${y}`;
}

/** Price change from reportDate to 3 trading days later (approximate). Uses getPriceHistory. */
async function marketReactionAfterEarnings(symbol: string, reportDate: string): Promise<number | null> {
  const from = new Date(reportDate);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const prices = await getPriceHistory(symbol, fromStr, toStr);
  if (prices.length < 2) return null;
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const firstClose = getClose(sorted[0]!);
  const lastPoint = sorted[Math.min(3, sorted.length - 1)];
  const lastClose = lastPoint ? getClose(lastPoint) : undefined;
  if (firstClose == null || lastClose == null || firstClose === 0) return null;
  return ((lastClose - firstClose) / firstClose) * 100;
}

function buildNarrative(
  revenueBeat: number | null,
  epsBeat: number | null,
  guidance: GuidanceVerdict,
  margins: MarginsVerdict
): string {
  const parts: string[] = [];
  if (epsBeat != null || revenueBeat != null) {
    const beat = epsBeat != null && revenueBeat != null ? (epsBeat + revenueBeat) / 2 : epsBeat ?? revenueBeat ?? 0;
    if (beat > 2) parts.push('The company delivered an earnings beat');
    else if (beat < -2) parts.push('The company missed expectations');
    else parts.push('Results were roughly in line with expectations');
  }
  if (guidance === 'Raised') parts.push('forward guidance was raised');
  else if (guidance === 'Lowered') parts.push('guidance was lowered');
  if (margins === 'Expanded') parts.push('margins expanded');
  else if (margins === 'Compressed') parts.push('margins compressed');
  if (parts.length === 0) return 'Last quarter results are available; see details above.';
  return parts.join(', ') + '.';
}

/**
 * Fetch last reported earnings and build structured recap.
 * Returns null if no reported earnings in the last 2 quarters.
 */
export async function getEarningsRecap(symbol: string): Promise<EarningsRecap | null> {
  const sym = symbol.toUpperCase();
  const cal = await getEarningsCalendar({ symbol: sym });
  let events = cal.events ?? [];

  // Fallback: earnings-calendar is 90-day window; use getEarningsHistory for full history
  if (events.filter((ev) => ev.epsActual != null || ev.revenueActual != null).length === 0) {
    events = await getEarningsHistory(sym);
  }

  // Prefer most recent event with actuals. Trust actuals over date—FMP date can be
  // fiscal/announcement and may appear "future" in some timezones; actuals mean reported.
  const reported = events.find(
    (ev) => ev.epsActual != null || ev.revenueActual != null
  );
  if (!reported) return null;

  const epsActual = reported.epsActual ?? 0;
  const epsEst = reported.epsEstimated;
  const revActual = reported.revenueActual ?? 0;
  const revEst = reported.revenueEstimated;
  const epsBeatPct =
    epsEst != null && epsEst !== 0 ? ((epsActual - epsEst) / Math.abs(epsEst)) * 100 : null;
  const revBeatPct =
    revEst != null && revEst !== 0 ? ((revActual - revEst) / Math.abs(revEst)) * 100 : null;

  const marketReaction = await marketReactionAfterEarnings(symbol, reported.date);

  const quarter = quarterFromDate(reported.date);
  const reportedDateFormatted = formatReportDate(reported.date);

  const narrative = buildNarrative(revBeatPct, epsBeatPct, null, null);

  return {
    symbol: symbol.toUpperCase(),
    quarter,
    reportedDate: reportedDateFormatted,
    revenue: {
      actual: revActual,
      estimate: revEst ?? null,
      beatPct: revBeatPct != null ? Math.round(revBeatPct * 10) / 10 : null
    },
    eps: {
      actual: epsActual,
      estimate: epsEst ?? null,
      beatPct: epsBeatPct != null ? Math.round(epsBeatPct * 10) / 10 : null
    },
    guidance: null,
    margins: null,
    marketReaction1to3DaysPct: marketReaction != null ? Math.round(marketReaction * 10) / 10 : null,
    narrativeSummary: narrative,
    reportDate: reported.date
  };
}

/**
 * Decide if recap should be shown in feed: within 7d, or revision spike post-earnings, or big price move post-earnings.
 */
export function earningsRecapRelevance(
  recap: EarningsRecap,
  opts: {
    revisionSpikeAfterEarnings?: boolean;
    significantPriceMovePostEarnings?: boolean;
  }
): EarningsRecapWithRelevance {
  const reportDate = new Date(recap.reportDate);
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - reportDate.getTime()) / (24 * 60 * 60 * 1000));

  if (daysSince <= 7 && daysSince >= 0) {
    return { recap, shouldShow: true, daysSinceEarnings: daysSince, reason: 'within_7d' };
  }
  if (daysSince > 7 && daysSince <= 30 && opts.revisionSpikeAfterEarnings) {
    return { recap, shouldShow: true, daysSinceEarnings: daysSince, reason: 'revision_spike_post_earnings' };
  }
  if (daysSince > 7 && daysSince <= 30 && opts.significantPriceMovePostEarnings) {
    return { recap, shouldShow: true, daysSinceEarnings: daysSince, reason: 'price_move_post_earnings' };
  }
  return { recap, shouldShow: false, daysSinceEarnings: daysSince, reason: 'stale' };
}
