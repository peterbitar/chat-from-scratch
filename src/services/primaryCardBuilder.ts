/**
 * Primary Card Builder — Converts dominant signal into a clean card for the feed.
 *
 * User sees only: The anomaly. The shift. The tension.
 * Everything else belongs behind "View Details".
 */

import type { DailyCheckResult } from './dailyCheck';
import { getDominantSignal } from './dominantSignalEngine';
import { SignalCategory } from './dominantSignalEngine';
import type { EarningsRecapWithRelevance } from './earningsRecap';

export interface PrimaryCard {
  symbol: string;
  category: SignalCategory;
  title: string;
  summary: string;
  keyMetric: string;
  tone: 'Bullish' | 'Bearish' | 'Neutral';
  severity: number;
  /** Optional: "Confidence: Medium (Dispersion high)" */
  confidenceNote?: string;
  /** When to show: within 7d of earnings, or revision spike, or price move */
  earningsRecap?: EarningsRecapWithRelevance;
}

function buildCardFromSignal(
  symbol: string,
  result: DailyCheckResult,
  category: SignalCategory,
  severity: number,
  data: Record<string, unknown>
): PrimaryCard {
  const dir = result.revisions.direction;
  const eps7d = result.revisions.eps7d ?? 0;
  const eps30d = result.revisions.eps30d ?? 0;
  const price7d = result.price.change7d ?? 0;
  const price30d = result.price.change30d ?? 0;

  switch (category) {
    case SignalCategory.ESTIMATE_SHIFT: {
      const revUp = dir === 'up' || eps7d > 0 || eps30d > 0;
      const tone: PrimaryCard['tone'] = revUp ? 'Bullish' : 'Bearish';
      const primary = Math.abs(eps7d) >= Math.abs(eps30d) ? eps7d : eps30d;
      const period = Math.abs(eps7d) >= Math.abs(eps30d) ? '7d' : '30d';
      const title =
        result.majorRecalibrationFlag ? 'Major Estimate Recalibration' :
        Math.abs(primary) > 15 ? 'Significant Estimate Revision' :
        Math.abs(primary) > 10 ? 'Upward Estimate Trend' : 'Estimate Shift';
      const keyMetric = `${primary >= 0 ? '+' : ''}${primary.toFixed(1)}% EPS (${period})`;
      const epsNow = result.revisions.epsNow;
      const priorEps = result.revisions.priorEps;
      let summary: string;
      if (epsNow != null && priorEps != null && priorEps !== 0) {
        const pct = ((epsNow - priorEps) / Math.abs(priorEps)) * 100;
        summary = `EPS revised from $${priorEps.toFixed(2)} → $${epsNow.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)${period === '7d' ? ' in 7 days.' : '.'}`;
      } else {
        const direction = revUp ? 'raised' : 'cut';
        summary =
          Math.abs(primary) > 20
            ? `Analysts ${direction} EPS ${Math.abs(primary).toFixed(0)}%${period === '7d' ? ' this week.' : ' over the month.'}`
            : `Analysts ${direction} earnings expectations by ${Math.abs(primary).toFixed(1)}%.`;
      }
      const dispersionPct = result.revisionBreadth.dispersionPct;
      const confidenceNote =
        dispersionPct != null && dispersionPct > 35
          ? `Confidence: Medium (Dispersion high)`
          : result.revisionBreadth.conviction === 'Low'
            ? 'Revision broad but not unanimous.'
            : undefined;
      return { symbol, category, title, summary, keyMetric, tone, severity, confidenceNote };
    }

    case SignalCategory.FORCED_REPRICING: {
      const move = Math.abs(price30d) >= Math.abs(price7d) ? price30d : price7d;
      const period = Math.abs(price30d) >= Math.abs(price7d) ? '30d' : '7d';
      const tone: PrimaryCard['tone'] = move > 5 ? 'Bullish' : move < -5 ? 'Bearish' : 'Neutral';
      const unusualMove = (data.unusualMove as boolean) ?? false;
      const revFlat = (data.revFlat as boolean) ?? false;
      const title = unusualMove ? 'Forced Repricing (Unusual Move)' : revFlat ? 'Forced Repricing (No Revision Change)' : 'Forced Repricing';
      const keyMetric = `${move >= 0 ? '+' : ''}${move.toFixed(1)}% (${period})`;
      const summary = unusualMove
        ? `Price moved ${move >= 0 ? '+' : ''}${move.toFixed(1)}% — >2x historical volatility.`
        : revFlat
          ? `Price moved ${move >= 0 ? '+' : ''}${move.toFixed(1)}% with no revision change.`
          : `Price moved ${move >= 0 ? '+' : ''}${move.toFixed(1)}% against revision trend.`;
      return { symbol, category, title, summary, keyMetric, tone, severity };
    }

    case SignalCategory.DIVERGENCE: {
      const priceDown = price7d < -2 || price30d < -2;
      const tone: PrimaryCard['tone'] = priceDown && (dir === 'up' || eps7d > 0) ? 'Bullish' : 'Bearish';
      const priceMove = Math.abs(price30d) >= Math.abs(price7d) ? price30d : price7d;
      const revMove = Math.abs(eps30d) >= Math.abs(eps7d) ? eps30d : eps7d;
      const title =
        tone === 'Bullish' ? 'Price Weakness vs Rising Estimates' : 'Price Strength vs Falling Estimates';
      const keyMetric =
        priceDown && (dir === 'up' || eps7d > 0)
          ? 'Price down / Revisions up'
          : 'Price up / Revisions down';
      const summary =
        tone === 'Bullish'
          ? `Price ${priceMove >= 0 ? '+' : ''}${priceMove.toFixed(1)}% while EPS revisions ${revMove >= 0 ? 'improved' : 'deteriorated'} ${revMove >= 0 ? '+' : ''}${revMove.toFixed(1)}%.`
          : `Price ${priceMove >= 0 ? '+' : ''}${priceMove.toFixed(1)}% despite ${revMove >= 0 ? 'rising' : 'falling'} EPS revisions.`;
      return { symbol, category, title, summary, keyMetric, tone, severity };
    }

    case SignalCategory.RISK_CHANGE: {
      const tone: PrimaryCard['tone'] = 'Bearish';
      const leverage = (data.leverageBreach as boolean) ?? false;
      const downgrades = (data.downgradeCluster as boolean) ?? false;
      const insider = (data.insiderSpike as boolean) ?? false;
      const earnings = (data.earningsNegRev as boolean) ?? false;
      const parts: string[] = [];
      if (leverage) parts.push('elevated leverage');
      if (downgrades) parts.push('analyst downgrades');
      if (insider) parts.push('insider selling');
      if (earnings) parts.push('earnings + negative revisions');
      const title = parts.length > 1 ? 'Multiple Risk Factors' : 'Risk Change';
      const keyMetric = parts.slice(0, 2).join('; ') || 'Risk elevated';
      const summary = `Risk elevated: ${parts.join(', ')}.`;
      return { symbol, category, title, summary, keyMetric, tone, severity };
    }

    case SignalCategory.VALUATION_SHIFT: {
      const fcfChange = (data.fcfYieldChange as number) ?? 0;
      const negFcf = (data.negativeFcf as boolean) ?? false;
      const tone: PrimaryCard['tone'] =
        fcfChange > 1 && !negFcf ? 'Bullish' : negFcf || fcfChange < -1 ? 'Bearish' : 'Neutral';
      const title = negFcf ? 'Negative FCF' : 'Valuation Shift';
      const keyMetric =
        negFcf ? 'Negative FCF' : `${fcfChange >= 0 ? '+' : ''}${fcfChange.toFixed(1)}pp FCF yield`;
      const summary = negFcf
        ? 'Company flipped to negative free cash flow.'
        : `FCF yield changed ${fcfChange >= 0 ? '+' : ''}${fcfChange.toFixed(1)}pp.`;
      return { symbol, category, title, summary, keyMetric, tone, severity };
    }

    case SignalCategory.POSITIONING_SHIFT: {
      const title = 'Positioning Shift';
      const keyMetric = 'Short / institutional change';
      const summary = 'Notable change in short interest or institutional ownership.';
      return { symbol, category, title, summary, keyMetric, tone: 'Neutral', severity };
    }

    case SignalCategory.VOLATILITY_EVENT: {
      const vol = (data.historicalVol30d as number) ?? 0;
      const beta = (data.beta as number) ?? 1;
      const title = vol > 30 ? 'High Volatility' : 'Volatility Event';
      const keyMetric = vol > 0 ? `30d vol ${vol.toFixed(1)}%` : `Beta ${beta}x`;
      const summary = `Elevated volatility: ${vol > 0 ? `${vol.toFixed(0)}% 30d historical vol` : `beta ${beta}x`}.`;
      return { symbol, category, title, summary, keyMetric, tone: 'Neutral', severity };
    }

    default:
      return {
        symbol,
        category,
        title: 'Signal',
        summary: 'Notable change detected.',
        keyMetric: '',
        tone: 'Neutral',
        severity
      };
  }
}

/**
 * Build the primary card for a stock from its DailyCheckResult.
 * Returns null if no dominant signal (silence = stability).
 */
export function buildPrimaryCard(result: DailyCheckResult): PrimaryCard | null {
  const signal = getDominantSignal(result);
  if (!signal) return null;
  const card = buildCardFromSignal(
    result.symbol,
    result,
    signal.category,
    signal.severity,
    signal.data
  );
  if (result.earningsRecap?.shouldShow) {
    card.earningsRecap = result.earningsRecap;
  }
  return card;
}
