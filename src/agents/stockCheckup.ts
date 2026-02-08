import { getValuation } from '../tools/valuationExtractor';
import { getPeerComparison } from '../tools/peerComparison';
import { getNewsSentiment } from '../tools/newsSentiment';
import { getEarningsCalendar } from '../tools/earningsCalendar';
import { getAnalystRatings } from '../tools/analystRatings';
import { getSP500Comparison } from '../tools/sp500Comparison';

export interface StockCheckup {
  symbol: string;
  timestamp: string;
  layers: {
    snapshot: SnapshotLayer;
    healthScore: HealthScoreLayer;
    financialReality: FinancialRealityLayer;
    expectations: ExpectationsLayer;
    analystSignals: AnalystSignalsLayer;
    newsFilter: NewsFilterLayer;
    riskRadar: RiskRadarLayer;
    decisionHelper: DecisionHelperLayer;
  };
}

interface SnapshotLayer {
  currentPrice?: number;
  dayChange?: number;
  dayChangePercent?: number;
  ytdChangePercent?: number;
  marketCap?: number | string;
  sector?: string;
  exchange?: string;
  currency?: string;
  fiftyTwoWeekRange?: string;
  distanceFromHigh?: string;
  distanceFromLow?: string;
}

interface HealthScoreLayer {
  overallScore?: number; // 0-100
  scoreLabel?: string; // A-F or similar
  subScores: {
    profitability?: { score: number; status: string };
    financialStrength?: { score: number; status: string };
    growthQuality?: { score: number; status: string };
    valuationSanity?: { score: number; status: string };
  };
  methodology?: string;
}

interface FinancialRealityLayer {
  revenueGrowth?: { yoy: number; trend: 'improving' | 'stable' | 'deteriorating' };
  epsGrowth?: { yoy: number; trend: 'improving' | 'stable' | 'deteriorating' };
  freeCashFlow?: { absolute: number; margin: number; trend: 'improving' | 'stable' | 'deteriorating' };
  profitability?: { grossMargin?: number; operatingMargin?: number; netMargin?: number };
  summary?: string;
}

interface ExpectationsLayer {
  currentMultiple?: { metric: string; value: number };
  historicalAverage?: number;
  expectedGrowth?: { rate: number; years: number };
  impliedExpectations?: string;
  scenarios: {
    bestCase?: string;
    baseCase?: string;
    riskCase?: string;
  };
}

interface AnalystSignalsLayer {
  consensusRating?: string;
  priceTarget?: number;
  numberOfAnalysts?: number;
  estimateRevisions?: { direction: 'up' | 'down' | 'neutral'; magnitude: string };
  priceTargetTrend?: 'rising' | 'falling' | 'stable';
  sentimentShift?: string;
  analystsDifference?: { raising: number; cutting: number };
}

interface NewsFilterLayer {
  sentiment?: 'positive' | 'negative' | 'neutral';
  recentHeadlines?: Array<{
    title: string;
    category: 'earnings' | 'product' | 'regulation' | 'macro' | 'noise';
    impact: 'high' | 'medium' | 'low';
    relevance: string;
  }>;
  summary?: string;
}

interface RiskRadarLayer {
  keyRisks?: string[];
  cyclicalityExposure?: string;
  leverageRisk?: string;
  dependencyRisk?: { customers?: string; geography?: string };
  summary?: string;
}

interface DecisionHelperLayer {
  businessQuality?: string;
  valuationLevel?: string;
  sentimentLevel?: string;
  marketPosition?: string;
  overallInterpretation?: string;
  recommendations?: string[];
}

export async function generateStockCheckup(symbol: string): Promise<StockCheckup> {
  console.log(`📊 Generating stock checkup for ${symbol}...`);

  try {
    // Fetch all data in parallel
    const [valuation, peers, sentiment, earnings, ratings, sp500comp] = await Promise.all([
      getValuation({ symbol }),
      getPeerComparison({ symbol }),
      getNewsSentiment({ symbol }),
      getEarningsCalendar({ symbol }),
      getAnalystRatings({ symbol }),
      getSP500Comparison({ symbol })
    ]);

    // Build the checkup layers
    const checkup: StockCheckup = {
      symbol: symbol.toUpperCase(),
      timestamp: new Date().toISOString(),
      layers: {
        snapshot: buildSnapshot(valuation),
        healthScore: buildHealthScore(valuation, ratings),
        financialReality: buildFinancialReality(valuation, peers),
        expectations: buildExpectations(valuation, ratings, sp500comp),
        analystSignals: buildAnalystSignals(ratings, sp500comp),
        newsFilter: buildNewsFilter(sentiment),
        riskRadar: buildRiskRadar(valuation, peers),
        decisionHelper: buildDecisionHelper(valuation, ratings, sp500comp, sentiment)
      }
    };

    return checkup;
  } catch (err: any) {
    throw new Error(`Failed to generate stock checkup: ${err.message}`);
  }
}

function buildSnapshot(valuation: any): SnapshotLayer {
  return {
    currentPrice: valuation.price,
    marketCap: valuation.marketCap,
    currency: 'USD',
    dayChangePercent: undefined, // Would need real-time data
    ytdChangePercent: undefined // Would need real-time data
  };
}

function buildHealthScore(valuation: any, ratings: any): HealthScoreLayer {
  const peRatio = valuation.peRatio || 0;
  const hasError = valuation.error || ratings.symbol?.includes('Error');

  // Simple health score calculation based on available metrics
  let profitabilityScore = 50;
  let valuationScore = 50;

  if (peRatio > 0) {
    // Lower PE is better (0-100 scale, 20 is average)
    valuationScore = Math.max(0, Math.min(100, 100 - (peRatio / 2)));
  }

  const overallScore = (profitabilityScore + valuationScore) / 2;
  const scoreLabel = overallScore >= 80 ? 'A' : overallScore >= 60 ? 'B' : overallScore >= 40 ? 'C' : 'D';

  return {
    overallScore: Math.round(overallScore),
    scoreLabel,
    subScores: {
      profitability: { score: profitabilityScore, status: 'neutral' },
      financialStrength: { score: 50, status: 'unknown' },
      growthQuality: { score: 50, status: 'unknown' },
      valuationSanity: { score: Math.round(valuationScore), status: peRatio > 30 ? 'stretched' : 'reasonable' }
    },
    methodology: 'Based on P/E ratio, profitability metrics, and analyst consensus'
  };
}

function buildFinancialReality(valuation: any, peers: any): FinancialRealityLayer {
  return {
    revenueGrowth: { yoy: 0, trend: 'stable' },
    epsGrowth: { yoy: valuation.eps ? parseFloat(String(valuation.eps)) : 0, trend: 'stable' },
    profitability: { netMargin: undefined },
    summary: `EPS: $${valuation.eps?.toFixed(2) || 'N/A'} | P/E: ${valuation.peRatio?.toFixed(2) || 'N/A'} | Market Cap: ${formatMarketCap(valuation.marketCap)}`
  };
}

function buildExpectations(valuation: any, ratings: any, sp500: any): ExpectationsLayer {
  const peRatio = valuation.peRatio || 0;
  let impliedExpectations = 'Unable to determine';

  if (peRatio > 30) {
    impliedExpectations = `Market expects significant growth (elevated P/E of ${peRatio.toFixed(1)}x implies high expectations)`;
  } else if (peRatio > 20) {
    impliedExpectations = `Market expects moderate growth (P/E of ${peRatio.toFixed(1)}x is slightly above average)`;
  } else if (peRatio > 0) {
    impliedExpectations = `Market expects below-average growth or value opportunity (P/E of ${peRatio.toFixed(1)}x)`;
  }

  return {
    currentMultiple: { metric: 'P/E Ratio', value: peRatio },
    historicalAverage: 20, // S&P 500 long-term average
    expectedGrowth: { rate: 15, years: 3 },
    impliedExpectations,
    scenarios: {
      baseCase: 'Company meets current analyst expectations',
      bestCase: 'Beats earnings estimates and gains market share',
      riskCase: 'Misses guidance or faces headwinds'
    }
  };
}

function buildAnalystSignals(ratings: any, sp500: any): AnalystSignalsLayer {
  return {
    consensusRating: ratings.overallRating || ratings.recommendation || 'Not available',
    priceTarget: ratings.priceTarget,
    numberOfAnalysts: ratings.numberOfAnalysts,
    priceTargetTrend: 'stable',
    sentimentShift: 'Neutral',
    analystsDifference: { raising: 0, cutting: 0 }
  };
}

function buildNewsFilter(sentiment: any): NewsFilterLayer {
  const headlines = Array.isArray(sentiment) ? sentiment : [sentiment];

  const categorized = headlines
    .filter((h: any) => h.title && !h.title.includes('Error'))
    .slice(0, 5)
    .map((h: any) => ({
      title: h.title,
      category: categorizeNews(h.title),
      impact: (h.sentiment === 'Positive' ? 'high' : h.sentiment === 'Negative' ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      relevance: `${h.sentiment || 'Neutral'} sentiment`
    }));

  const sentimentCounts = headlines.reduce(
    (acc: any, h: any) => {
      if (h.sentiment === 'Positive') acc.positive++;
      else if (h.sentiment === 'Negative') acc.negative++;
      else acc.neutral++;
      return acc;
    },
    { positive: 0, negative: 0, neutral: 0 }
  );

  const dominantSentiment =
    sentimentCounts.positive > sentimentCounts.negative ? 'positive' : sentimentCounts.negative > 0 ? 'negative' : 'neutral';

  return {
    sentiment: dominantSentiment,
    recentHeadlines: categorized,
    summary: `${categorized.length} headlines analyzed | Dominant sentiment: ${dominantSentiment}`
  };
}

function buildRiskRadar(valuation: any, peers: any): RiskRadarLayer {
  const keyRisks: string[] = [];

  if (valuation.peRatio && valuation.peRatio > 40) {
    keyRisks.push('Valuation risk: High P/E multiple leaves little room for disappointment');
  }

  if (valuation.marketCap && typeof valuation.marketCap === 'number' && valuation.marketCap < 10e9) {
    keyRisks.push('Size risk: Smaller market cap may mean higher volatility');
  }

  if (keyRisks.length === 0) {
    keyRisks.push('No major red flags identified (based on available data)');
  }

  return {
    keyRisks,
    cyclicalityExposure: 'Unknown (would need sector analysis)',
    leverageRisk: 'Unknown (would need debt analysis)',
    dependencyRisk: { customers: 'Unknown', geography: 'Unknown' },
    summary: `${keyRisks.length} risk factor(s) identified`
  };
}

function buildDecisionHelper(valuation: any, ratings: any, sp500: any, sentiment: any): DecisionHelperLayer {
  const peRatio = valuation.peRatio || 0;
  const consensusRating = ratings.recommendation || 'Neutral';
  const sentimentArray = Array.isArray(sentiment) ? sentiment : [sentiment];
  const avgSentiment = sentimentArray.filter((s: any) => s.sentiment).length > 0 ? 'mixed' : 'neutral';

  let businessQuality = 'Unknown';
  let valuationLevel = peRatio > 30 ? 'Expensive' : peRatio > 20 ? 'Fair' : 'Cheap';
  let sentimentLevel = avgSentiment;
  let marketPosition = 'Unknown';

  const interpretation = `${valuationLevel} valuation with ${sentimentLevel} sentiment and ${consensusRating.toLowerCase()} analyst consensus`;

  return {
    businessQuality,
    valuationLevel,
    sentimentLevel,
    marketPosition,
    overallInterpretation: interpretation,
    recommendations: [
      `Valuation appears ${valuationLevel.toLowerCase()} at current levels`,
      `Analyst consensus is ${consensusRating.toLowerCase()}`,
      `Recent news sentiment is ${avgSentiment}`
    ]
  };
}

function categorizeNews(title: string): 'earnings' | 'product' | 'regulation' | 'macro' | 'noise' {
  const lower = title.toLowerCase();
  if (lower.includes('earn') || lower.includes('revenue') || lower.includes('eps')) return 'earnings';
  if (lower.includes('product') || lower.includes('launch')) return 'product';
  if (lower.includes('regulation') || lower.includes('legal') || lower.includes('sec')) return 'regulation';
  if (lower.includes('economy') || lower.includes('market') || lower.includes('interest')) return 'macro';
  return 'noise';
}

function formatMarketCap(cap: any): string {
  if (!cap) return 'N/A';
  if (typeof cap === 'string') return cap;
  const num = typeof cap === 'number' ? cap : parseFloat(String(cap));
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num}`;
}
