import { StockCheckup } from '../agents/stockCheckup';
import {
  simplifyText,
  formatNoobHealthScore as getHealthScoreLabel,
  formatNoobValuation as getValuationLabel,
  formatNoobSentiment as getSentimentLabel,
  formatNoobAnalystConsensus as getConsensusLabel,
  getNoobDreamOrDanger
} from '../utils/noobMode';

export function formatNoobCheckup(checkup: StockCheckup): string {
  const { symbol, layers } = checkup;
  const d = layers.decisionHelper;
  const s = layers.snapshot;
  const h = layers.healthScore;
  const a = layers.analystSignals;
  const f = layers.financialReality;
  const risk = layers.riskRadar;
  const news = layers.newsFilter;

  let out = '';

  out += `${symbol} Check-up\n\n`;
  if (d?.overallInterpretation) {
    out += `${d.overallInterpretation}\n\n`;
  }

  // Dream or danger (noob-specific)
  const valuation = getValuationLabel(layers.expectations?.currentMultiple?.value || 0).assessment;
  const sentiment = news?.sentiment || 'neutral';
  const rating = a?.consensusRating || 'unknown';
  const { headline, meaning } = getNoobDreamOrDanger(valuation, sentiment, rating);
  out += `The big picture\n`;
  out += `${headline}\n`;
  out += `${meaning}\n\n`;

  out += `Key numbers\n`;
  if (h?.overallScore != null) {
    const { label, explanation } = getHealthScoreLabel(h.overallScore);
    out += `Health score: ${h.overallScore}/100 (${label}) — ${explanation}\n`;
  }
  if (a?.consensusRating) {
    const c = getConsensusLabel(a.consensusRating);
    out += `Analysts say: ${c.recommendation} ${c.meaning}\n`;
  }
  const buy = a?.buyCount ?? 0;
  const hold = a?.holdCount ?? 0;
  const sell = a?.sellCount ?? 0;
  if (buy + hold + sell > 0) out += `Recommendations: ${buy} Buy · ${hold} Hold · ${sell} Sell\n`;
  if (s?.currentPrice != null) out += `Price: $${s.currentPrice.toFixed(2)} per share`;
  if (a?.priceTarget != null) out += ` · Analysts’ average target: $${a.priceTarget.toFixed(0)}`;
  out += '\n\n';

  if (layers.expectations?.currentMultiple) {
    const pe = layers.expectations.currentMultiple.value;
    const v = getValuationLabel(pe);
    out += `Is the price fair?\n`;
    out += `${v.assessment}\n`;
    out += `${v.explanation}\n\n`;
  }

  const sp500 = layers.sp500Comparison;
  if (sp500?.summary && !sp500.summary.includes('Error')) {
    out += `Vs the market\n`;
    out += `${sp500.summary}\n\n`;
  } else if (sp500?.outperforming != null && sp500?.outperformanceAmount != null) {
    out += `Vs the market\n`;
    out += sp500.outperforming
      ? `This stock is beating the S&P 500 by ${Math.abs(sp500.outperformanceAmount).toFixed(1)}% so far this year.\n\n`
      : `This stock is trailing the S&P 500 by ${Math.abs(sp500.outperformanceAmount).toFixed(1)}% so far this year.\n\n`;
  }

  if (f?.epsGrowth != null || f?.revenueGrowth != null) {
    out += `Growth\n`;
    if (f.epsGrowth != null) out += `Earnings per share: ${f.epsGrowth.yoy >= 0 ? '+' : ''}${f.epsGrowth.yoy?.toFixed(1)}% vs last year\n`;
    if (f.revenueGrowth != null) out += `Revenue: ${f.revenueGrowth.yoy >= 0 ? '+' : ''}${f.revenueGrowth.yoy}% vs last year\n`;
    out += '\n';
  }

  if (risk?.keyRisks?.length) {
    out += `What to watch\n`;
    risk.keyRisks.slice(0, 3).forEach((r: string) => { out += `• ${r}\n`; });
    out += '\n';
  }

  if (d?.recommendations?.length) {
    out += `So… what now?\n`;
    d.recommendations.slice(0, 6).forEach((rec: string) => {
      out += `• ${simplifyText(rec, 'noob')}\n`;
    });
    out += '\n';
  }

  if (news?.storyline) {
    out += `Recent context\n`;
    const first = news.storyline.split(/\n\n/)[0];
    out += `${first}\n`;
    if (news.sentiment) {
      const sent = getSentimentLabel(news.sentiment);
      out += `Mood: ${sent.vibe}\n`;
    }
  }

  out += `\nPast performance ≠ future returns. Diversify. Invest only what you can afford to lose.\n`;
  return out;
}
