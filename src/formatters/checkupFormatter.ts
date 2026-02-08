import { StockCheckup } from '../agents/stockCheckup';

export function formatStockCheckup(checkup: StockCheckup): string {
  const { symbol, layers } = checkup;
  let output = '';

  // Header
  output += `\n${'═'.repeat(80)}\n`;
  output += `  📊 STOCK CHECKUP: ${symbol}\n`;
  output += `${'═'.repeat(80)}\n\n`;

  // Layer 1: Snapshot
  output += formatSnapshot(symbol, layers.snapshot);

  // Layer 2: Health Score
  output += formatHealthScore(layers.healthScore);

  // Layer 3: Financial Reality
  output += formatFinancialReality(layers.financialReality);

  // Layer 4: Expectations
  output += formatExpectations(layers.expectations);

  // Layer 5: Analyst Signals
  output += formatAnalystSignals(layers.analystSignals);

  // Layer 6: News Filter
  output += formatNewsFilter(layers.newsFilter);

  // Layer 7: Risk Radar
  output += formatRiskRadar(layers.riskRadar);

  // Layer 8: Decision Helper
  output += formatDecisionHelper(layers.decisionHelper);

  output += `\n${'═'.repeat(80)}\n`;

  return output;
}

function formatSnapshot(symbol: string, layer: any): string {
  let output = `\n1️⃣  SNAPSHOT — "What am I looking at?"\n${'─'.repeat(80)}\n`;

  output += `  Symbol: ${symbol}\n`;
  if (layer.currentPrice) output += `  Current Price: $${layer.currentPrice.toFixed(2)}\n`;
  if (layer.marketCap) output += `  Market Cap: ${layer.marketCap}\n`;
  if (layer.currency) output += `  Currency: ${layer.currency}\n`;

  output += '\n';
  return output;
}

function formatHealthScore(layer: any): string {
  let output = `2️⃣  HEALTH SCORE — "Is this company fundamentally OK?"\n${'─'.repeat(80)}\n`;

  const scoreBar = getScoreBar(layer.overallScore || 0);
  output += `  Overall Score: ${layer.overallScore || '?'}/100 [${scoreBar}] ${layer.scoreLabel || '?'}\n\n`;

  output += `  Sub-Scores:\n`;
  if (layer.subScores.profitability) {
    output += `    • Profitability: ${layer.subScores.profitability.score}/100 (${layer.subScores.profitability.status})\n`;
  }
  if (layer.subScores.financialStrength) {
    output += `    • Financial Strength: ${layer.subScores.financialStrength.score}/100 (${layer.subScores.financialStrength.status})\n`;
  }
  if (layer.subScores.growthQuality) {
    output += `    • Growth Quality: ${layer.subScores.growthQuality.score}/100 (${layer.subScores.growthQuality.status})\n`;
  }
  if (layer.subScores.valuationSanity) {
    output += `    • Valuation: ${layer.subScores.valuationSanity.score}/100 (${layer.subScores.valuationSanity.status})\n`;
  }

  if (layer.methodology) output += `\n  Methodology: ${layer.methodology}\n`;
  output += '\n';
  return output;
}

function formatFinancialReality(layer: any): string {
  let output = `3️⃣  FINANCIAL REALITY — "Is the business actually working?"\n${'─'.repeat(80)}\n`;

  if (layer.revenueGrowth) {
    const trend = getTrendIcon(layer.revenueGrowth.trend);
    output += `  Revenue Growth: ${trend} ${layer.revenueGrowth.yoy}% YoY\n`;
  }

  if (layer.epsGrowth) {
    const trend = getTrendIcon(layer.epsGrowth.trend);
    output += `  EPS Growth: ${trend} ${layer.epsGrowth.yoy.toFixed(2)} YoY\n`;
  }

  if (layer.freeCashFlow) {
    const trend = getTrendIcon(layer.freeCashFlow.trend);
    output += `  Free Cash Flow: ${trend} ${layer.freeCashFlow.absolute} (${layer.freeCashFlow.margin}% margin)\n`;
  }

  if (layer.profitability) {
    output += `  Profitability:\n`;
    if (layer.profitability.grossMargin) output += `    • Gross Margin: ${layer.profitability.grossMargin}%\n`;
    if (layer.profitability.operatingMargin) output += `    • Operating Margin: ${layer.profitability.operatingMargin}%\n`;
    if (layer.profitability.netMargin) output += `    • Net Margin: ${layer.profitability.netMargin}%\n`;
  }

  if (layer.summary) output += `\n  ${layer.summary}\n`;
  output += '\n';
  return output;
}

function formatExpectations(layer: any): string {
  let output = `4️⃣  EXPECTATIONS & VALUATION — "What's priced in?"\n${'─'.repeat(80)}\n`;

  if (layer.currentMultiple) {
    output += `  ${layer.currentMultiple.metric}: ${layer.currentMultiple.value.toFixed(2)}x\n`;
  }
  if (layer.historicalAverage) {
    output += `  Historical Average Multiple: ${layer.historicalAverage}x\n`;
  }
  if (layer.expectedGrowth) {
    output += `  Expected Growth: ~${layer.expectedGrowth.rate}% over ${layer.expectedGrowth.years} years\n`;
  }

  output += `\n  Implied Expectations:\n  "${layer.impliedExpectations}"\n`;

  if (layer.scenarios) {
    output += `\n  Scenarios:\n`;
    if (layer.scenarios.bestCase) output += `    Best Case: ${layer.scenarios.bestCase}\n`;
    if (layer.scenarios.baseCase) output += `    Base Case: ${layer.scenarios.baseCase}\n`;
    if (layer.scenarios.riskCase) output += `    Risk Case: ${layer.scenarios.riskCase}\n`;
  }
  output += '\n';
  return output;
}

function formatAnalystSignals(layer: any): string {
  let output = `5️⃣  ANALYST & MARKET SIGNALS — "What's changing?"\n${'─'.repeat(80)}\n`;

  if (layer.consensusRating) output += `  Consensus Rating: ${layer.consensusRating}\n`;
  if (layer.priceTarget) output += `  Price Target: $${layer.priceTarget.toFixed(2)}\n`;
  if (layer.numberOfAnalysts) output += `  Number of Analysts: ${layer.numberOfAnalysts}\n`;

  if (layer.priceTargetTrend) {
    const trend = getTrendIcon(layer.priceTargetTrend);
    output += `  Price Target Trend: ${trend}\n`;
  }

  if (layer.sentimentShift) output += `  Sentiment Shift: ${layer.sentimentShift}\n`;

  if (layer.analystsDifference) {
    output += `  Estimate Revisions: ${layer.analystsDifference.raising} analysts raising, ${layer.analystsDifference.cutting} cutting\n`;
  }

  output += '\n';
  return output;
}

function formatNewsFilter(layer: any): string {
  let output = `6️⃣  LIVE NEWS FILTER — "What matters today?"\n${'─'.repeat(80)}\n`;

  if (layer.summary) output += `  ${layer.summary}\n`;

  if (layer.recentHeadlines && layer.recentHeadlines.length > 0) {
    output += `\n  Recent Headlines:\n`;
    layer.recentHeadlines.slice(0, 5).forEach((headline: any) => {
      const impactIcon = headline.impact === 'high' ? '🔴' : headline.impact === 'medium' ? '🟡' : '⚪';
      output += `    ${impactIcon} [${headline.category.toUpperCase()}] ${headline.title.substring(0, 60)}...\n`;
      output += `       ${headline.relevance}\n`;
    });
  }

  output += '\n';
  return output;
}

function formatRiskRadar(layer: any): string {
  let output = `7️⃣  RISK RADAR — "What could go wrong?"\n${'─'.repeat(80)}\n`;

  if (layer.keyRisks && layer.keyRisks.length > 0) {
    output += `  Key Risks:\n`;
    layer.keyRisks.forEach((risk: string) => {
      output += `    ⚠️  ${risk}\n`;
    });
  }

  if (layer.cyclicalityExposure) output += `\n  Cyclicality Exposure: ${layer.cyclicalityExposure}\n`;
  if (layer.leverageRisk) output += `  Leverage Risk: ${layer.leverageRisk}\n`;
  if (layer.dependencyRisk) {
    if (layer.dependencyRisk.customers) output += `  Customer Dependency: ${layer.dependencyRisk.customers}\n`;
    if (layer.dependencyRisk.geography) output += `  Geographic Risk: ${layer.dependencyRisk.geography}\n`;
  }

  output += '\n';
  return output;
}

function formatDecisionHelper(layer: any): string {
  let output = `8️⃣  DECISION HELPER — "So... what does this mean for me?"\n${'─'.repeat(80)}\n`;

  if (layer.businessQuality) output += `  Business Quality: ${layer.businessQuality}\n`;
  if (layer.valuationLevel) output += `  Valuation Level: ${layer.valuationLevel}\n`;
  if (layer.sentimentLevel) output += `  Sentiment: ${layer.sentimentLevel}\n`;

  output += `\n  Interpretation:\n  "${layer.overallInterpretation}"\n`;

  if (layer.recommendations && layer.recommendations.length > 0) {
    output += `\n  Key Takeaways:\n`;
    layer.recommendations.forEach((rec: string) => {
      output += `    → ${rec}\n`;
    });
  }

  output += '\n';
  return output;
}

function getScoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function getTrendIcon(trend: string): string {
  if (trend === 'improving') return '📈';
  if (trend === 'deteriorating') return '📉';
  return '→';
}
