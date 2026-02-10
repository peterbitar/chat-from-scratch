import { StockCheckup } from '../agents/stockCheckup';

export function formatStockCheckup(checkup: StockCheckup): string {
  const { symbol, layers } = checkup;
  const d = layers.decisionHelper;
  const s = layers.snapshot;
  const h = layers.healthScore;
  const a = layers.analystSignals;
  const f = layers.financialReality;
  const exp = layers.expectations;
  const risk = layers.riskRadar;
  const news = layers.newsFilter;
  const sp500 = layers.sp500Comparison;

  let out = '';

  // Header — symbol and one-line takeaway first
  out += `${symbol} Stock Checkup\n\n`;
  if (d?.overallInterpretation) {
    out += `${d.overallInterpretation}\n\n`;
  }

  // Key metrics — score, rating, consensus
  out += `The numbers that matter\n`;
  const scoreLine: string[] = [];
  if (h?.overallScore != null) scoreLine.push(`Score ${h.overallScore}/100`);
  if (h?.scoreLabel) scoreLine.push(`(${h.scoreLabel})`);
  if (scoreLine.length) out += scoreLine.join(' ') + '\n';
  if (a?.consensusRating) out += `Analyst consensus: ${a.consensusRating}\n`;
  const buy = a?.buyCount ?? 0;
  const hold = a?.holdCount ?? 0;
  const sell = a?.sellCount ?? 0;
  if (buy + hold + sell > 0) {
    out += `${buy} Buy · ${hold} Hold · ${sell} Sell\n`;
  }
  out += '\n';

  // Price & valuation
  out += `Price & valuation\n`;
  if (s?.currentPrice != null) {
    out += `Trading at $${s.currentPrice.toFixed(2)}`;
    if (a?.priceTarget != null) {
      const pct = ((a.priceTarget - s.currentPrice) / s.currentPrice * 100).toFixed(0);
      const dir = a.priceTarget >= s.currentPrice ? 'upside' : 'downside';
      out += `. Analysts’ average target: $${a.priceTarget.toFixed(0)} (${Math.abs(Number(pct))}% ${dir})`;
    }
    out += '\n';
  }
  if (f?.peRatio != null && f?.sectorPE != null) {
    const vs = f.peRatio < f.sectorPE ? 'below' : 'above';
    const pct = Math.abs(((f.peRatio - f.sectorPE) / f.sectorPE) * 100).toFixed(0);
    out += `P/E ${f.peRatio.toFixed(1)}x (${vs} sector average of ${f.sectorPE.toFixed(1)}x) — ${f.peRatio < f.sectorPE ? 'valuation is relatively modest' : 'market is pricing in growth'}\n`;
  } else if (f?.peRatio != null) {
    out += `P/E ${f.peRatio.toFixed(1)}x\n`;
  }
  if (d?.valuationLevel) out += `Valuation view: ${d.valuationLevel}\n`;
  if (s?.marketCap || s?.sector) {
    const parts: string[] = [];
    if (s.marketCap != null) parts.push(typeof s.marketCap === 'string' ? s.marketCap : fmtCap(s.marketCap));
    if (s.sector) parts.push(s.sector);
    if (parts.length) out += parts.join(' · ') + '\n';
  }
  if (sp500 && (sp500.ytdPerformance != null || sp500.summary)) {
    if (sp500.summary && !sp500.summary.includes('Error')) {
      out += `Vs S&P 500: ${sp500.summary}\n`;
    } else if (sp500.ytdPerformance != null && sp500.sp500YTD != null) {
      const stockYtd = `${sp500.ytdPerformance >= 0 ? '+' : ''}${sp500.ytdPerformance.toFixed(1)}%`;
      const stock1Y = sp500.oneYearPerformance != null ? `${sp500.oneYearPerformance >= 0 ? '+' : ''}${sp500.oneYearPerformance.toFixed(1)}%` : '—';
      const stock5Y = sp500.fiveYearPerformance != null ? `${sp500.fiveYearPerformance >= 0 ? '+' : ''}${sp500.fiveYearPerformance.toFixed(1)}%` : '—';
      const indexYtd = `${sp500.sp500YTD >= 0 ? '+' : ''}${sp500.sp500YTD.toFixed(1)}%`;
      const index1Y = sp500.sp500OneYear != null ? `${sp500.sp500OneYear >= 0 ? '+' : ''}${sp500.sp500OneYear.toFixed(1)}%` : '—';
      const index5Y = sp500.sp500FiveYear != null ? `${sp500.sp500FiveYear >= 0 ? '+' : ''}${sp500.sp500FiveYear.toFixed(1)}%` : '—';
      out += `Vs S&P 500\n`;
      out += `Stock: YTD ${stockYtd}, 1Y ${stock1Y}, 5Y ${stock5Y}\n`;
      out += `Index: YTD ${indexYtd}, 1Y ${index1Y}, 5Y ${index5Y}\n`;
      if (sp500.outperforming != null && sp500.outperformanceAmount != null) {
        out += sp500.outperforming
          ? `Outperforming by ${Math.abs(sp500.outperformanceAmount).toFixed(1)}% YTD\n`
          : `Underperforming by ${Math.abs(sp500.outperformanceAmount).toFixed(1)}% YTD\n`;
      }
    }
  }
  out += '\n';

  // Growth & profitability
  out += `Growth & profitability\n`;
  const growthParts: string[] = [];
  if (f?.epsGrowth != null && f.epsGrowth.yoy != null) {
    growthParts.push(`EPS growth ${f.epsGrowth.yoy >= 0 ? '+' : ''}${f.epsGrowth.yoy.toFixed(1)}% YoY`);
  }
  if (f?.revenueGrowth != null && f.revenueGrowth.yoy != null) {
    growthParts.push(`revenue ${f.revenueGrowth.yoy >= 0 ? '+' : ''}${f.revenueGrowth.yoy}% YoY`);
  }
  if (growthParts.length) out += growthParts.join(', ') + '\n';
  if (d?.marketPosition) out += `Trajectory: ${d.marketPosition}\n`;
  if (d?.businessQuality) out += `Business quality: ${d.businessQuality}\n`;
  if (exp?.impliedExpectations) out += `${exp.impliedExpectations}\n`;
  out += '\n';

  // Risks
  if (risk?.keyRisks?.length) {
    out += `What to watch\n`;
    risk.keyRisks.slice(0, 3).forEach((r) => { out += `• ${r}\n`; });
    out += '\n';
  }

  // Bottom line
  if (d?.recommendations?.length) {
    out += `Bottom line\n`;
    d.recommendations.slice(0, 6).forEach((rec: string) => { out += `• ${rec}\n`; });
    out += '\n';
  }

  // News
  if (news?.storyline) {
    out += `Recent context\n`;
    const first = news.storyline.split(/\n\n/)[0];
    out += `${first}\n`;
  }

  return out.trimEnd() + '\n';
}

function fmtCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n}`;
}
