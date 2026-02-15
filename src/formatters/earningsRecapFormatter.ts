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

/** One or two sentence interpretation of the quarter (beat/miss, guidance, reaction). */
function earningsInterpretiveLead(recap: EarningsRecap): string {
  const parts: string[] = [];
  const rev = recap.revenue;
  const eps = recap.eps;
  const beatRev = rev.beatPct != null && rev.beatPct > 0;
  const missRev = rev.beatPct != null && rev.beatPct < 0;
  const beatEps = eps.beatPct != null && eps.beatPct > 0;
  const missEps = eps.beatPct != null && eps.beatPct < 0;
  if (beatEps && beatRev) parts.push('The company beat on both revenue and EPS.');
  else if (missEps && missRev) parts.push('The company missed on both revenue and EPS.');
  else if (beatEps || beatRev) parts.push('Results were mixed: one beat and one miss.');
  else if (missEps || missRev) parts.push('The company missed expectations.');
  else parts.push('Results were roughly in line with expectations.');
  if (recap.guidance === 'Raised') parts.push('Guidance was raised.');
  else if (recap.guidance === 'Lowered') parts.push('Guidance was lowered.');
  const reaction = recap.marketReaction1to3DaysPct;
  if (reaction != null) {
    if (reaction > 2) parts.push(`The stock rallied ${reaction.toFixed(1)}% in the days after.`);
    else if (reaction < -2) parts.push(`The stock sold off ${Math.abs(reaction).toFixed(1)}% in the days after.`);
  }
  return parts.join(' ') + (parts.length > 0 ? ' ' : '') + 'Key numbers below.';
}

export function formatEarningsRecap(recap: EarningsRecap): string {
  const lead = earningsInterpretiveLead(recap);
  let out = `\n📊 Last Earnings Report\n\n`;
  out += `${lead}\n\n`;
  out += `Quarter: ${recap.quarter} | Reported: ${recap.reportedDate}\n\n`;

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
    out += `\nMarket reaction (1 to 3 days): ${sign}${recap.marketReaction1to3DaysPct.toFixed(1)}%\n`;
  }

  out += `\n${recap.narrativeSummary}\n`;
  return out;
}

/**
 * Card-style output: narrative and analysis, not just numbers.
 * Explains what the numbers mean and what the market reaction suggests (same philosophy as feed cards).
 */
export function formatEarningsRecapAsCard(recap: EarningsRecap): { title: string; content: string } {
  const rev = recap.revenue;
  const eps = recap.eps;
  const title = `${recap.symbol}: ${recap.quarter} Earnings`;

  const sections: string[] = [];

  // What the quarter showed (story + interpretation)
  let story = `${recap.symbol} reported ${recap.quarter} on ${recap.reportedDate}. `;
  if (eps.beatPct != null || rev.beatPct != null) {
    const beatEps = eps.beatPct != null && eps.beatPct > 0;
    const missEps = eps.beatPct != null && eps.beatPct < 0;
    const beatRev = rev.beatPct != null && rev.beatPct > 0;
    const missRev = rev.beatPct != null && rev.beatPct < 0;
    if (beatEps && beatRev) story += `EPS is earnings per share; the company beat both EPS and revenue estimates, meaning it did better than analysts expected. `;
    else if (missEps && missRev) story += `The company missed both EPS and revenue. A miss means results came in below what analysts had forecast. `;
    else story += `Results were mixed versus expectations. `;
  }
  story += `Revenue: ${formatRevenueB(rev.actual)}${rev.beatPct != null ? ` (${rev.beatPct > 0 ? 'beat' : 'miss'} by ${Math.abs(rev.beatPct).toFixed(1)}%)` : ''}. EPS: $${eps.actual.toFixed(2)}${eps.beatPct != null ? ` (${eps.beatPct > 0 ? 'beat' : 'miss'} by ${Math.abs(eps.beatPct).toFixed(1)}%)` : ''}.`;
  sections.push(`**What the quarter showed**\n${story}`);

  // What it means
  sections.push(`**What it means**\n${recap.narrativeSummary}`);

  if (recap.guidance) {
    const g = recap.guidance === 'Raised' ? 'raised' : recap.guidance === 'Lowered' ? 'lowered' : 'reaffirmed';
    sections.push(`**Guidance**\nManagement ${g} forward guidance.`);
  }
  if (recap.margins) {
    const m = recap.margins === 'Expanded' ? 'expanded' : recap.margins === 'Compressed' ? 'compressed' : 'held flat';
    sections.push(`**Margins**\nMargins ${m}.`);
  }

  if (recap.marketReaction1to3DaysPct != null) {
    const sign = recap.marketReaction1to3DaysPct >= 0 ? '+' : '';
    const pct = recap.marketReaction1to3DaysPct.toFixed(1);
    const interp = recap.marketReaction1to3DaysPct > 2
      ? 'The move suggests investors liked what they heard.'
      : recap.marketReaction1to3DaysPct < -2
        ? 'The selloff suggests disappointment or concern about the outlook.'
        : 'The muted move suggests results were largely anticipated.';
    sections.push(`**How the market reacted**\nThe stock moved ${sign}${pct}% in the 1 to 3 days after the report. ${interp}`);
  }

  const content = sections.join('\n\n');
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
