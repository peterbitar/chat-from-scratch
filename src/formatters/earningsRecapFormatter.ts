/**
 * Format Earnings Recap for display — Quick Recap block.
 */

import type { EarningsRecap } from '../services/earningsRecap';

function formatRevenueB(v: number): string {
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function formatEarningsRecap(recap: EarningsRecap): string {
  let out = `\n📊 Last Earnings Report — Quick Recap\n\n`;
  out += `Quarter: ${recap.quarter}\n`;
  out += `Reported: ${recap.reportedDate}\n\n`;

  const rev = recap.revenue;
  const revStr =
    rev.beatPct != null
      ? `${formatRevenueB(rev.actual)} (${rev.beatPct > 0 ? 'Beat' : 'Miss'} by ${Math.abs(rev.beatPct).toFixed(1)}%)`
      : `${formatRevenueB(rev.actual)}`;
  out += `Revenue: ${revStr}\n`;

  const eps = recap.eps;
  const epsStr =
    eps.beatPct != null
      ? `$${eps.actual.toFixed(2)} (${eps.beatPct > 0 ? 'Beat' : 'Miss'} by ${Math.abs(eps.beatPct).toFixed(1)}%)`
      : `$${eps.actual.toFixed(2)}`;
  out += `EPS: ${epsStr}\n`;

  if (recap.guidance) out += `Guidance: ${recap.guidance}\n`;
  if (recap.margins) out += `Margins: ${recap.margins}\n`;

  if (recap.marketReaction1to3DaysPct != null) {
    const sign = recap.marketReaction1to3DaysPct >= 0 ? '+' : '';
    out += `\nMarket reaction (1–3 days): ${sign}${recap.marketReaction1to3DaysPct.toFixed(1)}%\n`;
  }

  out += `\nNarrative summary:\n${recap.narrativeSummary}\n`;
  return out;
}

/** Card-style output: { title, content } matching /api/card format (Here's what happened / Why investors care). */
export function formatEarningsRecapAsCard(recap: EarningsRecap): { title: string; content: string } {
  const title = `${recap.symbol} — ${recap.quarter} Earnings Recap`;
  const rev = recap.revenue;
  const revStr =
    rev.beatPct != null
      ? `${formatRevenueB(rev.actual)} (${rev.beatPct > 0 ? 'Beat' : 'Miss'} by ${Math.abs(rev.beatPct).toFixed(1)}%)`
      : formatRevenueB(rev.actual);
  const eps = recap.eps;
  const epsStr =
    eps.beatPct != null
      ? `$${eps.actual.toFixed(2)} (${eps.beatPct > 0 ? 'Beat' : 'Miss'} by ${Math.abs(eps.beatPct).toFixed(1)}%)`
      : `$${eps.actual.toFixed(2)}`;

  const whatHappened = `${recap.symbol} reported ${recap.quarter} on ${recap.reportedDate}. Revenue came in at ${revStr}, EPS at ${epsStr}.`;
  const parts = [`**Here's what happened** — ${whatHappened}`, `**Why investors care** — ${recap.narrativeSummary}`];
  if (recap.marketReaction1to3DaysPct != null) {
    const sign = recap.marketReaction1to3DaysPct >= 0 ? '+' : '';
    parts.push(`**Market reaction** — Stock moved ${sign}${recap.marketReaction1to3DaysPct.toFixed(1)}% in the 1–3 days after the report.`);
  }
  const content = parts.join('\n\n');
  return { title, content };
}

/** One line for feed context: "This follows the Jan 24 earnings report where the company beat on revenue and EPS." */
export function earningsRecapContextLine(recap: EarningsRecap): string {
  const parts: string[] = [];
  if (recap.eps.beatPct != null && recap.eps.beatPct > 0) parts.push('EPS beat');
  if (recap.revenue.beatPct != null && recap.revenue.beatPct > 0) parts.push('revenue beat');
  if (recap.eps.beatPct != null && recap.eps.beatPct < 0 && recap.revenue.beatPct != null && recap.revenue.beatPct < 0) {
    parts.push('earnings miss');
  } else if (recap.eps.beatPct != null && recap.eps.beatPct < 0) parts.push('EPS miss');
  else if (recap.revenue.beatPct != null && recap.revenue.beatPct < 0) parts.push('revenue miss');
  if (recap.guidance === 'Raised') parts.push('guidance raised');
  else if (recap.guidance === 'Lowered') parts.push('guidance lowered');
  if (recap.margins === 'Expanded') parts.push('margins expanded');

  const outcome = parts.length > 0 ? parts.join(', ') : 'last earnings report';
  return `This follows the ${recap.reportedDate} earnings report (${recap.quarter}) where ${outcome}.`;
}
