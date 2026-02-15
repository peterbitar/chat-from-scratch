/**
 * News Trigger Detection — When Rabbit should run Catalyst Scan (fetch news).
 *
 * Rabbit does NOT read news by default.
 * News is only fetched when a trigger event occurs.
 */

import type { DailyCheckResult } from './dailyCheck';

export interface NewsTriggerResult {
  triggered: boolean;
  reasons: string[];
}

/**
 * Detect if any catalyst-scan trigger fired.
 * Triggers (hard rules):
 * 1. Major Estimate Shift: EPS 7d > ±15% OR Revenue 30d > ±10%
 * 2. Price Shock: |price 7d| > 8% OR |price 30d| > 15% OR divergence
 * 3. Risk Cluster: 2+ downgrades, insider spike, leverage breach >3x, earnings within 7d
 * 4. Volatility Regime: 30d hist vol > 50%
 */
export function shouldTriggerNewsScan(result: DailyCheckResult): NewsTriggerResult {
  const reasons: string[] = [];
  const { revisions, price, signal, riskAlerts, structuralRisk, flowRisk, optionsSkewIv } = result;

  // 1. Major Estimate Shift
  const eps7d = revisions.eps7d ?? 0;
  const rev30d = revisions.revenue30d ?? 0;
  if (Math.abs(eps7d) > 15) {
    reasons.push(`Major estimate shift: EPS ${eps7d >= 0 ? '+' : ''}${eps7d.toFixed(1)}% (7d)`);
  }
  if (Math.abs(rev30d) > 10) {
    reasons.push(`Major estimate shift: Revenue ${rev30d >= 0 ? '+' : ''}${rev30d.toFixed(1)}% (30d)`);
  }

  // 2. Price Shock
  const price7d = price.change7d ?? 0;
  const price30d = price.change30d ?? 0;
  if (Math.abs(price7d) > 8) {
    reasons.push(`Price shock: ${price7d >= 0 ? '+' : ''}${price7d.toFixed(1)}% (7d)`);
  }
  if (Math.abs(price30d) > 15) {
    reasons.push(`Price shock: ${price30d >= 0 ? '+' : ''}${price30d.toFixed(1)}% (30d)`);
  }
  if (signal === 'Positive divergence' || signal === 'Risk divergence') {
    reasons.push('Divergence: price vs revisions');
  }

  // 3. Risk Cluster
  const downgradeMsg = riskAlerts.find((r) => /downgrade/.test(r.message));
  const downgradeCount = downgradeMsg ? parseInt(String(downgradeMsg.message).match(/\d+/)?.[0] ?? '0', 10) : 0;
  if (downgradeCount >= 2) {
    reasons.push(`${downgradeCount} analyst downgrades (7d)`);
  }
  const hasInsiderSpike = flowRisk.items.some((i) => /insider selling/i.test(i.label));
  if (hasInsiderSpike) {
    reasons.push('Insider selling spike');
  }
  const nd = structuralRisk.ndToEbitda ?? 0;
  if (nd > 3) {
    reasons.push(`Leverage breach: ND/EBITDA ${nd.toFixed(1)}x`);
  }
  const earningsUpcoming7d = result.earningsUpcoming7d ?? false;
  if (earningsUpcoming7d) {
    reasons.push('Earnings within 7 days');
  }

  // 4. Volatility Regime Change
  const histVol = optionsSkewIv?.historicalVol30d ?? 0;
  if (histVol > 50) {
    reasons.push(`Volatility regime: 30d hist vol ${histVol.toFixed(0)}%`);
  }

  return {
    triggered: reasons.length > 0,
    reasons
  };
}
