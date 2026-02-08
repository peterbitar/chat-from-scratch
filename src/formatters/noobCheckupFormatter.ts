import { StockCheckup } from '../agents/stockCheckup';
import {
  simplifyText,
  getNoobExplanation,
  formatNoobHealthScore as getHealthScoreLabel,
  formatNoobValuation as getValuationLabel,
  formatNoobSentiment as getSentimentLabel,
  formatNoobAnalystConsensus as getConsensusLabel,
  getNoobDreamOrDanger
} from '../utils/noobMode';

export function formatNoobCheckup(checkup: StockCheckup): string {
  const { symbol, layers } = checkup;
  let output = '';

  // Header
  output += `\n${'═'.repeat(80)}\n`;
  output += `  🔍 STOCK CHECK-UP FOR BEGINNERS: ${symbol}\n`;
  output += `  (Plain English version — no jargon!)\n`;
  output += `${'═'.repeat(80)}\n\n`;

  // Layer 1: What Is This?
  output += formatNoobSnapshot(symbol, layers.snapshot);

  // Layer 2: Is The Company Healthy?
  output += formatNoobHealthScoreSection(layers.healthScore);

  // Layer 3: Is The Price Fair?
  output += formatNoobPriceCheck(layers.expectations, layers.healthScore);

  // Layer 4: What's The Buzz?
  output += formatNoobBuzz(layers.newsFilter, layers.healthScore);

  // Layer 5: What Do Experts Think?
  output += formatNoobExpertOpinion(layers.analystSignals);

  // Layer 6: Dream or Danger?
  output += formatNoobDreamOrDangerSection(layers);

  // Layer 7: What Could Go Wrong?
  output += formatNoobRisks(layers.riskRadar);

  // Layer 8: So What Now?
  output += formatNoobWhatNow(layers);

  output += `\n${'═'.repeat(80)}\n`;
  output += `\n💡 Key Reminders:\n`;
  output += `   • Past performance ≠ future results\n`;
  output += `   • Diversify (don't put all money in one stock)\n`;
  output += `   • Only invest what you can afford to lose\n`;
  output += `   • If you don't understand it, don't buy it\n\n`;

  return output;
}

function formatNoobSnapshot(symbol: string, layer: any): string {
  let output = `1️⃣  WHAT AM I LOOKING AT?\n${'─'.repeat(80)}\n\n`;

  output += `Stock: ${symbol}\n`;

  if (layer.currentPrice) {
    output += `Current Price: $${layer.currentPrice.toFixed(2)}\n`;
    output += `   → This is what one share costs right now\n`;
  }

  if (layer.marketCap) {
    const cap = typeof layer.marketCap === 'string' ? layer.marketCap : formatMarketCapSimple(layer.marketCap);
    output += `\nCompany Value: ${cap}\n`;
    output += `   → If you bought the entire company, this is what you'd pay\n`;
  }

  output += '\n';
  return output;
}

function formatNoobHealthScoreSection(layer: any): string {
  const { label, explanation } = getHealthScoreLabel(layer.overallScore || 0);

  let output = `\n2️⃣  IS THE COMPANY HEALTHY?\n${'─'.repeat(80)}\n\n`;

  output += `Grade: ${label}\n`;
  output += `"${explanation}"\n\n`;

  if (layer.subScores.valuationSanity) {
    output += `Price Fairness: `;
    if (layer.subScores.valuationSanity.status === 'stretched') {
      output += `🔴 Stretched (expensive)\n`;
    } else {
      output += `🟢 Reasonable\n`;
    }
  }

  if (layer.subScores.profitability) {
    output += `Profitability: `;
    output += `${layer.subScores.profitability.score >= 60 ? '✅' : '⚠️'} ${layer.subScores.profitability.score}/100\n`;
  }

  output += '\n';
  return output;
}

function formatNoobPriceCheck(expectations: any, health: any): string {
  let output = `\n3️⃣  IS THE PRICE FAIR?\n${'─'.repeat(80)}\n\n`;

  const peRatio = expectations.currentMultiple?.value || 0;
  const valuation = getValuationLabel(peRatio);

  output += `Price Level: ${valuation.assessment}\n\n`;
  output += `"${valuation.explanation}"\n\n`;

  if (expectations.impliedExpectations) {
    output += `Market Expectation:\n`;
    output += `${expectations.impliedExpectations}\n\n`;
  }

  output += `What Could Happen:\n`;
  if (expectations.scenarios) {
    output += `   Best: ${expectations.scenarios.bestCase}\n`;
    output += `   Normal: ${expectations.scenarios.baseCase}\n`;
    output += `   Worst: ${expectations.scenarios.riskCase}\n`;
  }

  output += '\n';
  return output;
}

function formatNoobBuzz(newsFilter: any, health: any): string {
  let output = `\n4️⃣  WHAT'S THE BUZZ?\n${'─'.repeat(80)}\n\n`;

  if (newsFilter.sentiment) {
    const sentiment = getSentimentLabel(newsFilter.sentiment);
    output += `Mood: ${sentiment.vibe}\n`;
    output += `"${sentiment.meaning}"\n\n`;
  }

  if (newsFilter.recentHeadlines && newsFilter.recentHeadlines.length > 0) {
    output += `Recent Headlines:\n`;
    newsFilter.recentHeadlines.slice(0, 3).forEach((h: any) => {
      const icon = h.sentiment === 'Positive' ? '✅' : h.sentiment === 'Negative' ? '⚠️' : '🔵';
      output += `   ${icon} ${h.title.substring(0, 70)}...\n`;
    });
  }

  output += '\n';
  return output;
}

function formatNoobExpertOpinion(signals: any): string {
  let output = `\n5️⃣  WHAT DO EXPERTS THINK?\n${'─'.repeat(80)}\n\n`;

  if (signals.consensusRating) {
    const consensus = getConsensusLabel(signals.consensusRating);
    output += `Expert Recommendation: ${consensus.recommendation}\n`;
    output += `"${consensus.meaning}"\n\n`;
  }

  if (signals.numberOfAnalysts) {
    output += `How Many Experts: ${signals.numberOfAnalysts}\n`;
    output += `(More = more confident in the opinion)\n\n`;
  }

  if (signals.priceTarget) {
    output += `Price Target: $${signals.priceTarget.toFixed(2)}\n`;
    output += `(Where experts think the stock will go)\n`;
  }

  output += '\n';
  return output;
}

function formatNoobDreamOrDangerSection(layers: any): string {
  let output = `\n6️⃣  DREAM OR DANGER?\n${'─'.repeat(80)}\n\n`;

  const valuation = getValuationLabel(layers.expectations.currentMultiple?.value || 0).assessment;
  const sentiment = layers.newsFilter.sentiment || 'neutral';
  const rating = layers.analystSignals.consensusRating || 'unknown';

  const dreamOrDanger = getNoobDreamOrDanger(valuation, sentiment, rating);

  output += `${dreamOrDanger.headline}\n\n`;
  output += `"${dreamOrDanger.meaning}"\n\n`;

  output += `Quick Comparison:\n`;
  output += `   Price: ${valuation}\n`;
  output += `   News: ${sentiment.toUpperCase()}\n`;
  output += `   Experts: ${rating}\n`;

  output += '\n';
  return output;
}

function formatNoobRisks(riskRadar: any): string {
  let output = `\n7️⃣  WHAT COULD GO WRONG?\n${'─'.repeat(80)}\n\n`;

  if (riskRadar.keyRisks && riskRadar.keyRisks.length > 0) {
    riskRadar.keyRisks.slice(0, 3).forEach((risk: string) => {
      output += `⚠️  ${risk}\n`;
    });
  } else {
    output += `✅ No major red flags identified\n`;
  }

  output += '\n';
  return output;
}

function formatNoobWhatNow(layers: any): string {
  let output = `\n8️⃣  SO... SHOULD I BUY THIS STOCK?\n${'─'.repeat(80)}\n\n`;

  const recommendations = layers.decisionHelper.recommendations || [];

  output += `Here's What We Found:\n\n`;
  recommendations.slice(0, 3).forEach((rec: string) => {
    output += `   → ${simplifyText(rec, 'noob')}\n`;
  });

  output += `\n🤔 Still Unsure?\n`;
  output += `   • If you don't understand the business → DON'T BUY YET\n`;
  output += `   • Start with a small amount you can afford to lose\n`;
  output += `   • Or just buy a boring index fund (SPY, VOO) instead\n`;
  output += `   • Talk to a real financial advisor\n`;

  output += '\n';
  return output;
}

function formatMarketCapSimple(cap: any): string {
  if (typeof cap === 'string') return cap;
  const num = typeof cap === 'number' ? cap : parseFloat(String(cap));
  if (num >= 1e12) return `$${(num / 1e12).toFixed(1)} Trillion (MEGA CAP)`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)} Billion (Large Company)`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)} Million (Small Company)`;
  return `$${num}`;
}

// Re-exported utilities are available from '../utils/noobMode'
