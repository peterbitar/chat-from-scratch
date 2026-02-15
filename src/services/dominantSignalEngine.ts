/**
 * Dominant Signal Feed Engine
 *
 * Each stock produces ONE visible card per day: the highest-severity signal.
 * If no meaningful signal exists → return null (stock not shown).
 * All other signals are internal only (for scoring / detail view).
 */

import type { DailyCheckResult } from './dailyCheck';

export enum SignalCategory {
  ESTIMATE_SHIFT = 'ESTIMATE_SHIFT',
  FORCED_REPRICING = 'FORCED_REPRICING',
  DIVERGENCE = 'DIVERGENCE',
  VALUATION_SHIFT = 'VALUATION_SHIFT',
  RISK_CHANGE = 'RISK_CHANGE',
  POSITIONING_SHIFT = 'POSITIONING_SHIFT',
  VOLATILITY_EVENT = 'VOLATILITY_EVENT',
  NONE = 'NONE'
}

export type SignalConfidence = 'Low' | 'Medium' | 'High';

function toSignalConfidence(c: 'high' | 'medium' | 'low'): SignalConfidence {
  return c === 'high' ? 'High' : c === 'low' ? 'Low' : 'Medium';
}

export interface SignalScore {
  category: SignalCategory;
  severity: number;
  confidence: SignalConfidence;
  data: Record<string, unknown>;
}

const MIN_SEVERITY_THRESHOLD = 25;

/** Super mega-cap: marketCap > $500B — cap severity so 100 is rare */
const SUPER_MEGA_CAP_THRESHOLD = 500e9;

/** Floor for revision std dev — avoids division by zero; low-vol names get dampened surprise */
const REVISION_STD_FLOOR = 2;

/**
 * 1️⃣ Estimate Shift Severity — Surprise-based
 * surpriseScore = magnitude / historical_std_dev
 * +10% for TSLA (volatile) ≠ +10% for KO (stable) — institutional-grade.
 */
function scoreEstimateShift(r: DailyCheckResult): SignalScore | null {
  const eps7d = r.revisions.eps7d ?? 0;
  const eps30d = r.revisions.eps30d ?? 0;
  if (eps7d === 0 && eps30d === 0) return null;

  const magnitude = Math.abs(eps7d) * 2 + Math.abs(eps30d) * 1.2;
  const std7d = r.revisions.stdDev7d ?? null;
  const std30d = r.revisions.stdDev30d ?? null;
  const effectiveStd = std7d != null && std30d != null
    ? (std7d + std30d) / 2
    : std7d ?? std30d ?? REVISION_STD_FLOOR;
  const stdWithFloor = Math.max(REVISION_STD_FLOOR, effectiveStd);
  const surpriseScore = magnitude / stdWithFloor;
  let severity = Math.min(100, Math.round(surpriseScore * 25));

  if (Math.abs(eps7d) > 20 || Math.abs(eps30d) > 20) severity = Math.min(100, severity + 15);
  if (r.revisionBreadth.dispersionTrend === 'narrowing') severity = Math.min(100, severity + 10);

  const marketCap = r.marketCap ?? 0;
  if (marketCap > SUPER_MEGA_CAP_THRESHOLD) {
    severity = Math.round(severity * 0.7);
  }

  const confidence: SignalConfidence =
    (r.revisionBreadth.conviction ?? 'Medium') === 'High' ? 'High' :
    (r.revisionBreadth.conviction ?? 'Medium') === 'Low' ? 'Low' : 'Medium';

  return {
    category: SignalCategory.ESTIMATE_SHIFT,
    severity,
    confidence,
    data: { eps7d, eps30d, direction: r.revisions.direction, stdDev7d: std7d, stdDev30d: std30d }
  };
}

/**
 * 2️⃣ Forced Repricing (renamed from PRICE_REACTION)
 * Only show when: (a) price > 2x historical vol, (b) revisions flat, or (c) price against revisions.
 * Otherwise price alone is noise.
 */
function scoreForcedRepricing(r: DailyCheckResult): SignalScore | null {
  const price7d = r.price.change7d ?? 0;
  const price30d = r.price.change30d ?? 0;
  if (price7d === 0 && price30d === 0) return null;

  const dir = r.revisions.direction;
  const eps7d = r.revisions.eps7d ?? 0;
  const eps30d = r.revisions.eps30d ?? 0;
  const revUp = dir === 'up' || eps7d > 2 || eps30d > 2;
  const revDown = dir === 'down' || eps7d < -2 || eps30d < -2;
  const revFlat = dir === 'flat' && Math.abs(eps7d) <= 2 && Math.abs(eps30d) <= 2;
  const priceDown = price7d < -2 || price30d < -2;
  const priceUp = price7d > 3 || price30d > 3;

  const histVol = r.optionsSkewIv.historicalVol30d ?? 30;
  const vol30dExpected = histVol / Math.sqrt(12);
  const priceMove30d = Math.abs(price30d);
  const unusualMove = priceMove30d > 2 * vol30dExpected;

  const priceAgainstRevs = (priceDown && revUp) || (priceUp && revDown);

  const shouldShow = unusualMove || revFlat || priceAgainstRevs;
  if (!shouldShow) return null;

  let severity = Math.min(100, Math.abs(price30d) * 2 + Math.abs(price7d) * 3);
  if (unusualMove) severity = Math.min(100, severity + 15);
  const vs30 = r.relativeStrength.vsSp500_30d ?? 0;
  if (vs30 < -15) severity = Math.min(100, severity + 10);

  if (severity < MIN_SEVERITY_THRESHOLD) return null;

  return {
    category: SignalCategory.FORCED_REPRICING,
    severity: Math.round(severity),
    confidence: toSignalConfidence(r.confidence),
    data: { price7d, price30d, vsSp500_30d: vs30, unusualMove, revFlat }
  };
}

/**
 * 3️⃣ Divergence Severity
 * Only when price and revisions conflict.
 */
function scoreDivergence(r: DailyCheckResult): SignalScore | null {
  const price7d = r.price.change7d ?? 0;
  const price30d = r.price.change30d ?? 0;
  const dir = r.revisions.direction;
  const eps7d = r.revisions.eps7d ?? 0;
  const eps30d = r.revisions.eps30d ?? 0;
  const revUp = dir === 'up' || eps7d > 2 || eps30d > 2;
  const revDown = dir === 'down' || eps7d < -2 || eps30d < -2;
  const priceDown = price7d < -2 || price30d < -2;
  const priceUp = price7d > 3 || price30d > 3;

  let severity = 0;
  const magnitude = Math.min(30, Math.abs(eps7d) + Math.abs(eps30d) + Math.abs(price7d) + Math.abs(price30d));

  if (priceDown && revUp) {
    severity = Math.min(100, 70 + magnitude * 0.5);
  } else if (priceUp && revDown) {
    severity = Math.min(100, 70 + magnitude * 0.5);
  }

  if (severity === 0) return null;

  return {
    category: SignalCategory.DIVERGENCE,
    severity: Math.round(severity),
    confidence: toSignalConfidence(r.confidence),
    data: { price7d, price30d, direction: dir }
  };
}

function parseDowngradeCount(items: { label: string }[]): number {
  const item = items.find((i) => /downgrade/i.test(i.label));
  if (!item) return 0;
  const m = item.label.match(/(\d+)/);
  return m ? parseInt(m[1]!, 10) : 1; // "Analyst downgrade" => 1
}

/**
 * 5️⃣ Valuation Shift Severity
 * FCF yield jump > 2pp, P/E compression, negative FCF flip
 */
function scoreValuationShift(r: DailyCheckResult): SignalScore | null {
  const fcfChange = r.valuation.fcfYieldChange ?? 0;
  const fcfNow = r.valuation.fcfYieldNow ?? 0;
  const negFcfFlip = r.negativeFcfFlag;

  let severity = 0;
  if (Math.abs(fcfChange) > 2) severity = Math.min(100, 40 + Math.abs(fcfChange) * 10);
  if (negFcfFlip) severity = Math.min(100, severity + 35);
  if (severity === 0 && Math.abs(fcfChange) > 1) severity = Math.min(100, Math.abs(fcfChange) * 15);

  if (severity === 0) return null;

  return {
    category: SignalCategory.VALUATION_SHIFT,
    severity: Math.round(severity),
    confidence: toSignalConfidence(r.confidence),
    data: { fcfYieldChange: fcfChange, fcfYieldNow: fcfNow, negativeFcf: negFcfFlip }
  };
}

/**
 * 6️⃣ Positioning Shift (stub — often no data in FMP basic)
 */
function scorePositioningShift(r: DailyCheckResult): SignalScore | null {
  const si = r.shortInterest;
  const inst = r.institutionalOwnership;
  const siChange = si.change30dPct ?? 0;
  const instChange = inst.change30dPp ?? 0;
  if (siChange === 0 && instChange === 0) return null;
  if (si.dataSourceNote?.includes('not in FMP') && inst.dataSourceNote?.includes('premium')) return null;
  const severity = Math.min(100, Math.abs(siChange) * 2 + Math.abs(instChange) * 5);
  if (severity < MIN_SEVERITY_THRESHOLD) return null;
  return {
    category: SignalCategory.POSITIONING_SHIFT,
    severity: Math.round(severity),
    confidence: 'Medium',
    data: { shortChange30d: siChange, instChange30d: instChange }
  };
}

/**
 * 7️⃣ Volatility Event
 * Only trigger when vol is abnormal vs own history (proxy: vol > 50%).
 * NVDA at 36% 30d vol is normal for growth stocks — don't flag.
 */
const VOL_ABNORMAL_THRESHOLD = 50;

function scoreVolatilityEvent(r: DailyCheckResult): SignalScore | null {
  const vol30d = r.optionsSkewIv.historicalVol30d ?? 0;
  const beta = r.betaVsSp500 ?? 1;
  const price30d = r.price.change30d ?? 0;
  // Only flag when vol is truly abnormal (proxy for vol > 1y p80)
  if (vol30d < VOL_ABNORMAL_THRESHOLD) return null;
  if (beta < 1.5 && Math.abs(price30d) < 25) return null;
  let severity = 0;
  if (vol30d > 50) severity += 50;
  if (vol30d > 60) severity += 20;
  if (Math.abs(price30d) > 30) severity += 20;
  severity = Math.min(100, severity);
  if (severity < MIN_SEVERITY_THRESHOLD) return null;
  return {
    category: SignalCategory.VOLATILITY_EVENT,
    severity: Math.round(severity),
    confidence: toSignalConfidence(r.confidence),
    data: { historicalVol30d: vol30d, beta, price30d }
  };
}

/**
 * 4️⃣ Risk Change Severity
 * ND/EBITDA breach >3x, downgrade cluster, insider spike, earnings + negative revisions
 */
function scoreRiskChange(r: DailyCheckResult): SignalScore | null {
  const nd = r.structuralRisk.ndToEbitda ?? 0;
  const leverageBreach = nd > 3;
  const downgradeCount = parseDowngradeCount(r.flowRisk.items);
  const downgradeCluster = downgradeCount >= 2;
  const insiderSpike = r.flowRisk.items.some((i) => /Insider/i.test(i.label));
  const earningsNegRev = r.riskAlerts.some(
    (a) => /Earnings within.*negative/i.test(a.message)
  );

  let severity = 0;
  if (leverageBreach) severity += 60;
  if (downgradeCluster) severity += 40;
  else if (downgradeCount >= 1) severity += 20;
  if (insiderSpike) severity += 30;
  if (earningsNegRev) severity += 35;
  severity = Math.min(100, severity);

  if (severity === 0) return null;

  return {
    category: SignalCategory.RISK_CHANGE,
    severity: Math.round(severity),
    confidence: toSignalConfidence(r.confidence),
    data: { leverageBreach, downgradeCluster, downgradeCount, insiderSpike, earningsNegRev }
  };
}

/**
 * Select the dominant signal for a stock.
 * Returns null if no signal exceeds the minimum threshold (silence = stability).
 */
export function getDominantSignal(result: DailyCheckResult): SignalScore | null {
  const signals: SignalScore[] = [
    scoreEstimateShift(result),
    scoreForcedRepricing(result),
    scoreDivergence(result),
    scoreRiskChange(result),
    scoreValuationShift(result),
    scorePositioningShift(result),
    scoreVolatilityEvent(result)
  ].filter((s): s is SignalScore => s != null);

  const strongest = signals
    .filter((s) => s.severity >= MIN_SEVERITY_THRESHOLD)
    .sort((a, b) => b.severity - a.severity)[0];

  return strongest ?? null;
}
