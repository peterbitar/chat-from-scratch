import type { IndustryComparisonResult } from '../services/industryComparison';

export function formatIndustryComparison(result: IndustryComparisonResult): string {
  const {
    symbol,
    industrySnapshot,
    stockVsIndustry,
    verdict,
    verdictReason,
    analystSignal,
    peerSetHealthWarning,
    peg,
    pegInterpretation,
    verdictNuance,
    verdictSummary,
    balanceSheetNote,
    multiAxis,
    forwardEpsConsensus,
    earningsRevisionTrend,
    epsRevisionTrend90d,
    fcfYield,
    fcfYieldInterpretation,
    revenueCagr3y,
    marginTrend,
    reRatingProbabilityScore
  } = result;

  const ind = industrySnapshot;
  const vs = stockVsIndustry;

  let out = `\n━━━ Industry comparison: ${symbol} ━━━\n\n`;

  out += `1️⃣ Industry snapshot (${ind.industry || ind.sector || 'sector'} | ${ind.peerCount} peers)\n`;
  out += `   Peer set is FMP sector/industry; may include different business models (e.g. streaming vs theme parks).\n`;
  out += `   Median Forward P/E:  ${ind.medianForwardPE != null ? ind.medianForwardPE.toFixed(1) : '—'}\n`;
  out += `   Median Growth (%):    ${ind.medianGrowth != null ? ind.medianGrowth.toFixed(1) : '—'}\n`;
  out += `   Median ROE (%):      ${ind.medianROE != null ? ind.medianROE.toFixed(1) : '—'}\n`;
  out += `   Median ROIC (%):     ${ind.medianROIC != null ? ind.medianROIC.toFixed(1) : '—'}\n`;
  out += `   Median Debt (ND/EBITDA): ${ind.medianDebt != null ? ind.medianDebt.toFixed(2) : '—'}\n\n`;

  if (peerSetHealthWarning) {
    out += `⚠️  Peer set / data quality\n`;
    out += `   ${peerSetHealthWarning}\n\n`;
  }

  out += `2️⃣ ${symbol} vs industry\n`;
  const premiumPct = vs.valuationPremiumPct;
  const premiumText =
    premiumPct == null
      ? '—'
      : premiumPct < 0
        ? `${Math.abs(premiumPct).toFixed(0)}% below industry median`
        : premiumPct > 0
          ? `${premiumPct.toFixed(0)}% above industry median`
          : 'in line with median';
  out += `   P/E:        ${vs.stockPE != null ? vs.stockPE.toFixed(1) : '—'}  (${premiumText})\n`;
  // growthVs: not shown (peer median for growth not used)
  const roeVs = vs.roeVsMedianPct != null ? (Math.abs(vs.roeVsMedianPct) > 500 ? (vs.roeVsMedianPct > 0 ? 'well above median' : 'well below median') : (vs.roeVsMedianPct >= 0 ? '+' : '') + vs.roeVsMedianPct.toFixed(0) + '% vs median') : '—';
  if (vs.stockRevenueGrowth != null) {
    out += `   Growth (Revenue YoY): ${vs.stockRevenueGrowth.toFixed(1)}%\n`;
  }
  if (vs.stockEpsGrowth != null) {
    out += `   Growth (EPS YoY):     ${vs.stockEpsGrowth.toFixed(1)}%\n`;
  }
  if (vs.stockRevenueGrowth == null && vs.stockEpsGrowth == null && vs.stockGrowth != null) {
    out += `   Growth: ${vs.stockGrowth.toFixed(1)}%\n`;
  }
  out += `   ROE:        ${vs.stockROE != null ? vs.stockROE.toFixed(1) + '%' : '—'}  (${roeVs})\n`;
  out += `   ROIC:       ${vs.stockROIC != null ? vs.stockROIC.toFixed(1) + '%' : '—'}\n`;
  out += `   Debt:       ${vs.stockNetDebtToEBITDA != null ? vs.stockNetDebtToEBITDA.toFixed(2) + 'x' : '—'}  (${vs.debtVsMedian})\n`;
  if (balanceSheetNote) {
    out += `   ${balanceSheetNote}\n`;
  }
  out += `\n`;

  if (peg != null && pegInterpretation) {
    out += `📊 Growth vs multiple (PEG)\n`;
    out += `   PEG (based on EPS growth): ${peg.toFixed(1)} — ${pegInterpretation}\n`;
    out += `\n`;
  } else if (result.pegDisabledReason) {
    out += `📊 Growth vs multiple (PEG)\n`;
    out += `   ${result.pegDisabledReason}\n`;
    out += `\n`;
  }

  if (fcfYield != null && fcfYieldInterpretation != null) {
    out += `💰 Free Cash Flow yield\n`;
    out += `   FCF yield: ${fcfYield.toFixed(1)}% — ${fcfYieldInterpretation}\n`;
    out += `\n`;
  }

  const hasInstitutional =
    vs.stockROIC != null || revenueCagr3y != null || marginTrend != null || forwardEpsConsensus != null || earningsRevisionTrend != null || epsRevisionTrend90d != null;
  if (hasInstitutional) {
    out += `🏦 Institutional metrics\n`;
    if (vs.stockROIC != null) {
      out += `   ROIC:              ${vs.stockROIC.toFixed(1)}%\n`;
    }
    if (revenueCagr3y != null) {
      out += `   3Y Revenue CAGR:   ${revenueCagr3y.toFixed(1)}%\n`;
    }
    if (marginTrend != null) {
      const marginLabel =
        marginTrend === 'expanding' ? 'Expanding → durable quality' : marginTrend === 'contracting' ? 'Contracting → margin risk' : 'Stable';
      out += `   Margin trend (3Y): ${marginLabel}\n`;
    }
    if (forwardEpsConsensus != null) {
      out += `   Forward EPS (consensus): $${forwardEpsConsensus.toFixed(2)}\n`;
    }
    if (earningsRevisionTrend != null) {
      const trendLabel =
        earningsRevisionTrend === 'rising'
          ? 'EPS revision trend: Rising → positive signal'
          : earningsRevisionTrend === 'falling'
            ? 'EPS revision trend: Falling → valuation risk'
            : 'EPS revision trend: Flat → neutral';
      out += `   ${trendLabel}\n`;
    } else if (forwardEpsConsensus != null) {
      out += `   EPS revision trend: Not available in this snapshot\n`;
    }
    if (epsRevisionTrend90d != null) {
      const label90 = epsRevisionTrend90d === 'up' ? 'Up' : epsRevisionTrend90d === 'down' ? 'Down' : 'Flat';
      out += `   📉 EPS Revision Trend (90 days): ${label90}\n`;
      out += `   Because: Premium stocks get punished when revisions roll over. That's the missing forward-looking layer.\n`;
    }
    out += `\n`;
  }

  if (reRatingProbabilityScore) {
    const rps = reRatingProbabilityScore;
    out += `📈 Re-rating Probability Score (RPS)\n`;
    out += `   Score: ${rps.total}/100 — ${rps.interpretation}\n`;
    out += `   Answers: "What is the probability this stock's multiple expands over the next 6–18 months?"\n`;
    out += `   Pillars:  Relative ${rps.pillars.relativeCompression}/25  |  Absolute ${rps.pillars.absoluteCheapness}/30  |  Momentum ${rps.pillars.fundamentalMomentum}/30  |  Risk ${rps.pillars.riskBalanceSheet}/15\n`;
    out += `\n`;
  }

  out += `3️⃣ Multi-axis view\n`;
  if (multiAxis) {
    out += `   Relative Value:   ${multiAxis.relativeValue}\n`;
    out += `   Absolute Value:   ${result.pegDisabledReason ? '— (EPS growth required for PEG)' : multiAxis.absoluteValue}\n`;
    out += `   Quality:          ${multiAxis.quality}\n`;
    out += `   Financial Risk:   ${multiAxis.financialRisk}\n`;
    out += `\n`;
  }

  out += `   Verdict: ${verdict}\n`;
  if (verdictSummary) {
    out += `   ${verdictSummary}\n`;
  }
  out += `   ${verdictReason}\n`;
  if (verdictNuance) {
    out += `   ${verdictNuance}\n`;
  }
  if (analystSignal) {
    out += `   Analyst signal: ${analystSignal}\n`;
  }

  out += `\n━━━ Where the numbers come from (FMP) ━━━\n\n`;
  out += `Industry snapshot (medians)\n`;
  out += `   • Peer list: FMP company-screener by sector/industry (same as ${symbol}). Peers with ROE < -20% excluded; P/E winsorized at top 5%.\n`;
  out += `   • Median P/E:  FMP industry-pe/sector-pe snapshot when available; else median of each peer's P/E from FMP ratios-ttm.\n`;
  out += `   • Median Growth:  not used (no FMP sector/industry growth snapshot).\n`;
  out += `   • Median ROE:  median of each peer’s return on equity from FMP key-metrics.\n`;
  out += `   • Median Debt:  median of each peer’s net debt/EBITDA from FMP key-metrics.\n\n`;
  out += `${symbol} (this stock)\n`;
  out += `   • P/E:  FMP quote or key-metrics or price ÷ EPS (income statement); ratios-ttm as fallback.\n`;
  out += `   • Growth:  FMP financial-growth — Revenue (YoY) and EPS (YoY) shown separately when both available; PEG uses EPS only.\n`;
  out += `   • ROE / ROIC:  FMP key-metrics (return on equity, return on invested capital).\n`;
  out += `   • Net Debt/EBITDA:  FMP key-metrics.\n`;
  if (revenueCagr3y != null || marginTrend != null) {
    out += `   • 3Y Revenue CAGR & margin trend:  FMP income-statement (annual, 4 years).\n`;
  }
  if (fcfYield != null) {
    out += `   • FCF yield:  FMP key-metrics (>5% attractive, 3–5% fair, <3% expensive).\n`;
  }
  out += `\n`;
  out += `Derived\n`;
  out += `   • Premium vs median:  (stock P/E − median P/E) ÷ median P/E. Shown as "X% below/above industry median".\n`;
  out += `   • PEG:  stock P/E ÷ EPS growth (%) only. Revenue growth is not used for PEG.\n`;
  out += `   • Multi-axis:  Relative Value ±20% rule; Absolute Value PEG <1 / 1–2 / >2; Quality from ROE (>20% / 10–20% / <10%) and leverage (<1 / 1–3 / >3); Financial Risk from net debt/EBITDA.\n`;
  out += `   • Analyst signal:  FMP ratings-snapshot / grades-consensus (Buy/Hold/Sell).\n`;
  if (forwardEpsConsensus != null || earningsRevisionTrend != null || epsRevisionTrend90d != null) {
    out += `   • Forward EPS / revision trend:  FMP analyst-estimates (annual).\n`;
    out += `   • EPS Revision Trend (90 days):  Proxy from same analyst-estimates (latest vs prior annual); FMP does not provide true 90-day revision history.\n`;
  }
  if (reRatingProbabilityScore != null) {
    out += `   • Re-rating Probability Score (RPS):  Not a valuation score. Measures probability of multiple expansion (6–18 months). Pillars: Relative Compression (discount vs median P/E) 25%; Absolute Cheapness (PEG + FCF yield) 30%; Fundamental Momentum (revisions + margin trend + 3Y revenue CAGR) 30%; Risk/Balance Sheet (ND/EBITDA + ROIC) 15%.\n`;
  }
  out += `\n`;

  return out;
}
