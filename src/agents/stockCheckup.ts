import { getValuation } from '../tools/valuationExtractor';
import { getPeerComparison } from '../tools/peerComparison';
import { getNewsUpdate } from '../tools/newsSentiment';
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
    profitability: ProfitabilityLayer;
    liquidity: LiquidityLayer;
    efficiency: EfficiencyLayer;
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
  industry?: string;
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
  eps?: number;
  peRatio?: number;
  sectorPE?: number;
  industryPE?: number;
  summary?: string;
}

interface ProfitabilityLayer {
  returnOnAssets?: number;
  returnOnEquity?: number;
  returnOnInvestedCapital?: number;
  operatingReturnOnAssets?: number;
  earningsYield?: number;
  assessment?: string;
  trend?: 'strong' | 'healthy' | 'weak' | 'concerning';
  summary?: string;
}

interface LiquidityLayer {
  currentRatio?: number;
  workingCapital?: number;
  netDebtToEBITDA?: number;
  freeCashFlowYield?: number;
  assessment?: string;
  riskLevel?: 'low' | 'moderate' | 'high' | 'critical';
  summary?: string;
}

interface EfficiencyLayer {
  daysOfSalesOutstanding?: number;
  daysOfPayablesOutstanding?: number;
  daysOfInventoryOutstanding?: number;
  cashConversionCycle?: number;
  operatingCycle?: number;
  assessment?: string;
  trend?: 'improving' | 'stable' | 'deteriorating';
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
  buyCount?: number;
  holdCount?: number;
  sellCount?: number;
  estimateRevisions?: { direction: 'up' | 'down' | 'neutral'; magnitude: string };
  priceTargetTrend?: 'rising' | 'falling' | 'stable';
  sentimentShift?: string;
  analystsDifference?: { raising: number; cutting: number };
}

interface NewsFilterLayer {
  storyline?: string;
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
    const [valuation, peers, newsUpdate, earnings, ratings, sp500comp] = await Promise.all([
      getValuation({ symbol }),
      getPeerComparison({ symbol }),
      getNewsUpdate({ symbol }),
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
        profitability: buildProfitability(valuation),
        liquidity: buildLiquidity(valuation),
        efficiency: buildEfficiency(valuation),
        expectations: buildExpectations(valuation, ratings, sp500comp),
        analystSignals: buildAnalystSignals(ratings, sp500comp),
        newsFilter: buildNewsFilter(newsUpdate),
        riskRadar: buildRiskRadar(valuation, peers),
        decisionHelper: buildDecisionHelper(valuation, ratings, sp500comp, newsUpdate.headlines)
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
    sector: valuation.sector,
    industry: valuation.industry,
    currency: 'USD',
    dayChangePercent: undefined, // Would need real-time data
    ytdChangePercent: undefined // Would need real-time data
  };
}

function buildHealthScore(valuation: any, ratings: any): HealthScoreLayer {
  const peRatio = valuation.peRatio || 0;
  const sectorPE = valuation.sectorAveragePE || 20;
  const roe = valuation.returnOnEquity ?? 0;
  const roa = valuation.returnOnAssets ?? 0;
  const currentRatio = valuation.currentRatio ?? 0;
  const epsGrowth = valuation.epsGrowth ?? 0;
  const hasError = valuation.error || ratings.symbol?.includes('Error');

  // Enhanced health score calculation using multiple factors
  let profitabilityScore = 50;
  let valuationScore = 50;
  let growthScore = 50;
  let strengthScore = 50;

  // Profitability score (0-100). Valuation returns ROE/ROA as percentages (e.g. 41.26 for 41.26%)
  if (roe > 20 && roa > 8) {
    profitabilityScore = 90;
  } else if (roe > 15 && roa > 5) {
    profitabilityScore = 75;
  } else if (roe > 10 && roa > 3) {
    profitabilityScore = 60;
  } else if (roe > 5 && roa > 1) {
    profitabilityScore = 40;
  }

  // Valuation score (0-100)
  if (peRatio > 0) {
    if (sectorPE > 0) {
      const relativeMultiple = peRatio / sectorPE;
      valuationScore = Math.max(0, Math.min(100, 100 - (relativeMultiple * 50)));
    } else {
      valuationScore = Math.max(0, Math.min(100, 100 - (peRatio / 2)));
    }
  }

  // Growth score (0-100)
  if (epsGrowth > 20) {
    growthScore = 85;
  } else if (epsGrowth > 15) {
    growthScore = 70;
  } else if (epsGrowth > 10) {
    growthScore = 60;
  } else if (epsGrowth > 5) {
    growthScore = 50;
  } else if (epsGrowth > 0) {
    growthScore = 40;
  }

  // Financial strength score (0-100)
  if (currentRatio >= 1.5) {
    strengthScore = 80;
  } else if (currentRatio >= 1.2) {
    strengthScore = 65;
  } else if (currentRatio >= 1.0) {
    strengthScore = 50;
  } else if (currentRatio >= 0.7) {
    strengthScore = 30;
  } else {
    strengthScore = 15;
  }

  const overallScore = (profitabilityScore + valuationScore + growthScore + strengthScore) / 4;
  const scoreLabel = overallScore >= 80 ? 'A' : overallScore >= 65 ? 'B' : overallScore >= 50 ? 'C' : overallScore >= 35 ? 'D' : 'F';

  return {
    overallScore: Math.round(overallScore),
    scoreLabel,
    subScores: {
      profitability: { score: Math.round(profitabilityScore), status: profitabilityScore > 60 ? 'strong' : profitabilityScore > 40 ? 'neutral' : 'weak' },
      financialStrength: { score: Math.round(strengthScore), status: strengthScore > 60 ? 'strong' : strengthScore > 40 ? 'moderate' : 'weak' },
      growthQuality: { score: Math.round(growthScore), status: growthScore > 60 ? 'strong' : growthScore > 40 ? 'moderate' : 'weak' },
      valuationSanity: { score: Math.round(valuationScore), status: peRatio > sectorPE + 15 ? 'stretched' : 'reasonable' }
    },
    methodology: 'Based on profitability (ROE/ROA), valuation (P/E vs sector), growth (EPS growth), and financial strength (liquidity ratios)'
  };
}

function buildFinancialReality(valuation: any, peers: any): FinancialRealityLayer {
  // Use actual growth data from financial-growth endpoint
  const revenueGrowthValue = valuation.revenueGrowth ?? 0;
  const epsGrowthValue = valuation.epsGrowth ?? 0;
  const sectorPE = valuation.sectorAveragePE || 'N/A';
  const industryPE = valuation.industryAveragePE || 'N/A';

  const determineTrend = (value: number): 'improving' | 'stable' | 'deteriorating' => {
    if (value > 10) return 'improving';
    if (value < -5) return 'deteriorating';
    return 'stable';
  };

  // Build valuation comparison string
  const sectorComparison = sectorPE !== 'N/A' ? ` | Sector P/E: ${sectorPE}` : '';
  const industryComparison = industryPE !== 'N/A' ? ` | Industry P/E: ${industryPE}` : '';

  return {
    revenueGrowth: { yoy: revenueGrowthValue, trend: determineTrend(revenueGrowthValue) },
    epsGrowth: { yoy: epsGrowthValue, trend: determineTrend(epsGrowthValue) },
    profitability: { netMargin: undefined },
    eps: valuation.eps,
    peRatio: valuation.peRatio,
    sectorPE: typeof sectorPE === 'number' ? sectorPE : undefined,
    industryPE: typeof industryPE === 'number' ? industryPE : undefined,
    summary: `EPS: $${valuation.eps?.toFixed(2) || 'N/A'} | P/E: ${valuation.peRatio?.toFixed(2) || 'N/A'}${sectorComparison}${industryComparison} | Market Cap: ${formatMarketCap(valuation.marketCap)}`
  };
}

function buildProfitability(valuation: any): ProfitabilityLayer {
  // Valuation extractor returns these as percentages (0–100), not decimals
  const roe = valuation.returnOnEquity ?? 0;
  const roa = valuation.returnOnAssets ?? 0;
  const roic = valuation.returnOnInvestedCapital ?? 0;
  const earningsYield = valuation.earningsYield ?? 0;

  let assessment = 'Unknown';
  let trend: 'strong' | 'healthy' | 'weak' | 'concerning' = 'healthy';

  if (roe > 15 && roa > 5 && roic > 8) {
    assessment = 'Excellent - Outstanding returns on capital';
    trend = 'strong';
  } else if (roe > 10 && roa > 3 && roic > 6) {
    assessment = 'Strong - Above-average profitability';
    trend = 'strong';
  } else if (roe > 5 && roa > 1) {
    assessment = 'Adequate - Decent returns on capital';
    trend = 'healthy';
  } else if (roe > 0 && roa > 0) {
    assessment = 'Weak - Below-average profitability';
    trend = 'weak';
  } else {
    assessment = 'Concerning - Negative or near-zero returns';
    trend = 'concerning';
  }

  return {
    returnOnAssets: roa ? parseFloat(Number(roa).toFixed(2)) : undefined,
    returnOnEquity: roe ? parseFloat(Number(roe).toFixed(2)) : undefined,
    returnOnInvestedCapital: roic ? parseFloat(Number(roic).toFixed(2)) : undefined,
    operatingReturnOnAssets: valuation.operatingReturnOnAssets,
    earningsYield: earningsYield ? parseFloat(Number(earningsYield).toFixed(2)) : undefined,
    assessment,
    trend,
    summary: `ROE: ${roe > 0 ? Number(roe).toFixed(1) : 'N/A'}% | ROA: ${roa > 0 ? Number(roa).toFixed(1) : 'N/A'}% | ROIC: ${roic > 0 ? Number(roic).toFixed(1) : 'N/A'}%`
  };
}

function buildLiquidity(valuation: any): LiquidityLayer {
  const currentRatio = valuation.currentRatio ?? 0;
  const netDebtToEBITDA = valuation.netDebtToEBITDA ?? 0;
  const fcfYield = valuation.freeCashFlowYield ?? 0;

  let assessment = 'Unknown';
  let riskLevel: 'low' | 'moderate' | 'high' | 'critical' = 'moderate';

  // Assess based on current ratio and debt levels
  if (currentRatio >= 1.5 && netDebtToEBITDA < 2) {
    assessment = 'Strong - Excellent liquidity and low debt';
    riskLevel = 'low';
  } else if (currentRatio >= 1.0 && netDebtToEBITDA < 3) {
    assessment = 'Adequate - Sufficient liquidity, manageable debt';
    riskLevel = 'moderate';
  } else if (currentRatio >= 0.7 || netDebtToEBITDA < 4) {
    assessment = 'Strained - Tight liquidity or elevated debt';
    riskLevel = 'high';
  } else {
    assessment = 'Critical - Severe liquidity concerns';
    riskLevel = 'critical';
  }

  return {
    currentRatio: currentRatio ? parseFloat(currentRatio.toFixed(2)) : undefined,
    workingCapital: valuation.workingCapital,
    netDebtToEBITDA: netDebtToEBITDA ? parseFloat(netDebtToEBITDA.toFixed(2)) : undefined,
    freeCashFlowYield: fcfYield ? parseFloat(fcfYield.toFixed(2)) : undefined,
    assessment,
    riskLevel,
    summary: `Current Ratio: ${currentRatio ? currentRatio.toFixed(2) : 'N/A'} | Net Debt/EBITDA: ${netDebtToEBITDA ? netDebtToEBITDA.toFixed(2) : 'N/A'}x | FCF Yield: ${fcfYield != null ? Number(fcfYield).toFixed(2) : 'N/A'}%`
  };
}

function buildEfficiency(valuation: any): EfficiencyLayer {
  const dso = valuation.daysOfSalesOutstanding ?? 0;
  const dpo = valuation.daysOfPayablesOutstanding ?? 0;
  const dio = valuation.daysOfInventoryOutstanding ?? 0;
  const ccc = valuation.cashConversionCycle ?? 0;

  let assessment = 'Unknown';
  let trend: 'improving' | 'stable' | 'deteriorating' = 'stable';

  // Cash conversion cycle: lower is better, negative is best
  if (ccc < 0) {
    assessment = 'Excellent - Negative working capital cycle';
    trend = 'improving';
  } else if (ccc < 30) {
    assessment = 'Strong - Efficient working capital management';
    trend = 'improving';
  } else if (ccc < 60) {
    assessment = 'Adequate - Reasonable working capital efficiency';
    trend = 'stable';
  } else {
    assessment = 'Weak - Inefficient working capital management';
    trend = 'deteriorating';
  }

  return {
    daysOfSalesOutstanding: dso ? parseFloat(dso.toFixed(1)) : undefined,
    daysOfPayablesOutstanding: dpo ? parseFloat(dpo.toFixed(1)) : undefined,
    daysOfInventoryOutstanding: dio ? parseFloat(dio.toFixed(1)) : undefined,
    cashConversionCycle: ccc ? parseFloat(ccc.toFixed(1)) : undefined,
    assessment,
    trend,
    summary: `DSO: ${dso ? dso.toFixed(0) : 'N/A'} days | DPO: ${dpo ? dpo.toFixed(0) : 'N/A'} days | CCC: ${ccc ? ccc.toFixed(0) : 'N/A'} days`
  };
}

function buildExpectations(valuation: any, ratings: any, sp500: any): ExpectationsLayer {
  const peRatio = valuation.peRatio || 0;
  const sectorPE = valuation.sectorAveragePE || 20;
  const industryPE = valuation.industryAveragePE || 20;
  const sector = valuation.sector || 'Unknown';
  const industry = valuation.industry || 'Unknown';

  let impliedExpectations = 'Unable to determine';
  let valComparisonText = '';

  // Compare to sector/industry averages
  if (peRatio > 0 && sectorPE) {
    const diffFromSector = ((peRatio - sectorPE) / sectorPE * 100).toFixed(1);
    const sectorComparison = Math.abs(parseFloat(diffFromSector)) <= 5
      ? `inline with ${sector} sector`
      : parseFloat(diffFromSector) > 0
        ? `${diffFromSector}% above ${sector} sector average`
        : `${Math.abs(parseFloat(diffFromSector))}% below ${sector} sector average`;
    valComparisonText = ` (${sectorComparison} at ${sectorPE.toFixed(1)}x)`;
  }

  if (peRatio > 30) {
    impliedExpectations = `Market expects significant growth (elevated P/E of ${peRatio.toFixed(1)}x${valComparisonText} implies high expectations)`;
  } else if (peRatio > sectorPE + 10) {
    impliedExpectations = `Market expects above-sector growth (P/E of ${peRatio.toFixed(1)}x${valComparisonText})`;
  } else if (peRatio > 20) {
    impliedExpectations = `Market expects moderate growth (P/E of ${peRatio.toFixed(1)}x${valComparisonText})`;
  } else if (peRatio > 0) {
    impliedExpectations = `Market expects below-average growth or value opportunity (P/E of ${peRatio.toFixed(1)}x${valComparisonText})`;
  }

  return {
    currentMultiple: { metric: 'P/E Ratio', value: peRatio },
    historicalAverage: sectorPE || 20, // Sector average P/E
    expectedGrowth: { rate: 15, years: 3 },
    impliedExpectations,
    scenarios: {
      baseCase: `Company meets ${sector} sector expectations`,
      bestCase: `Outperforms ${sector} sector and gains market share`,
      riskCase: `Underperforms ${sector} sector or faces headwinds`
    }
  };
}

function buildAnalystSignals(ratings: any, sp500: any): AnalystSignalsLayer {
  return {
    consensusRating: ratings.overallRating || ratings.recommendation || 'Not available',
    priceTarget: ratings.priceTarget,
    numberOfAnalysts: ratings.numberOfAnalysts,
    buyCount: ratings.buyCount,
    holdCount: ratings.holdCount,
    sellCount: ratings.sellCount,
    priceTargetTrend: 'stable',
    sentimentShift: 'Neutral',
    analystsDifference: { raising: 0, cutting: 0 }
  };
}

function buildNewsFilter(newsUpdate: any): NewsFilterLayer {
  const headlines = Array.isArray(newsUpdate?.headlines) ? newsUpdate.headlines : (Array.isArray(newsUpdate) ? newsUpdate : [newsUpdate]);

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
    storyline: newsUpdate?.storyline,
    sentiment: dominantSentiment,
    recentHeadlines: categorized,
    summary: newsUpdate?.storyline ? `${categorized.length} headlines | ${dominantSentiment}` : `${categorized.length} headlines analyzed | Dominant sentiment: ${dominantSentiment}`
  };
}

function buildRiskRadar(valuation: any, peers: any): RiskRadarLayer {
  const keyRisks: string[] = [];

  // Valuation risks
  if (valuation.peRatio && valuation.peRatio > 40) {
    keyRisks.push('Valuation risk: High P/E multiple leaves little room for disappointment');
  }

  // Size risks
  if (valuation.marketCap && typeof valuation.marketCap === 'number' && valuation.marketCap < 10e9) {
    keyRisks.push('Size risk: Smaller market cap may mean higher volatility');
  }

  // Profitability risks (valuation returns ROE as percentage, e.g. 41.26)
  if (valuation.returnOnEquity != null && valuation.returnOnEquity < 5) {
    keyRisks.push('Profitability risk: Low ROE indicates poor capital efficiency');
  }

  // Liquidity risks
  if (valuation.currentRatio && valuation.currentRatio < 1.0) {
    keyRisks.push('Liquidity risk: Current ratio below 1.0 may indicate short-term solvency concerns');
  }

  if (valuation.netDebtToEBITDA && valuation.netDebtToEBITDA > 4) {
    keyRisks.push('Leverage risk: High net debt to EBITDA ratio indicates elevated financial risk');
  }

  // Efficiency risks
  if (valuation.cashConversionCycle && valuation.cashConversionCycle > 90) {
    keyRisks.push('Working capital risk: Long cash conversion cycle may tie up cash');
  }

  // Growth risks
  if (valuation.epsGrowth && valuation.epsGrowth < 0) {
    keyRisks.push('Growth risk: Negative EPS growth indicates declining earnings');
  }

  if (keyRisks.length === 0) {
    keyRisks.push('No major red flags identified - appears financially healthy');
  }

  return {
    keyRisks,
    cyclicalityExposure: valuation.sector ? `Depends on ${valuation.sector} sector cyclicality` : 'Unknown',
    leverageRisk: valuation.netDebtToEBITDA ? `Net Debt/EBITDA at ${valuation.netDebtToEBITDA.toFixed(2)}x` : 'Unknown',
    dependencyRisk: {
      customers: 'Requires diversification analysis',
      geography: valuation.industry ? `Varies by ${valuation.industry} business model` : 'Unknown'
    },
    summary: `${keyRisks.length} risk factor(s) identified`
  };
}

function buildDecisionHelper(valuation: any, ratings: any, sp500: any, sentiment: any): DecisionHelperLayer {
  const peRatio = valuation.peRatio || 0;
  const sectorPE = valuation.sectorAveragePE || 20;
  const sector = valuation.sector || 'Unknown';
  const consensusRating = ratings.recommendation || 'Neutral';
  const sentimentArray = Array.isArray(sentiment) ? sentiment : [sentiment];
  const avgSentiment = sentimentArray.filter((s: any) => s.sentiment).length > 0 ? 'mixed' : 'neutral';

  // Comprehensive business quality assessment
  const roe = valuation.returnOnEquity ?? 0;
  const roa = valuation.returnOnAssets ?? 0;
  const currentRatio = valuation.currentRatio ?? 0;
  const epsGrowth = valuation.epsGrowth ?? 0;

  let businessQuality = 'Unknown';
  if (roe > 15 && roa > 5 && currentRatio > 1.2) {
    businessQuality = 'Excellent - Strong profitability, healthy balance sheet';
  } else if (roe > 10 && roa > 3 && currentRatio > 1.0) {
    businessQuality = 'Good - Solid profitability and financial health';
  } else if (roe > 5 && currentRatio > 0.8) {
    businessQuality = 'Fair - Acceptable profitability and liquidity';
  } else if (roe > 0 && currentRatio > 0.5) {
    businessQuality = 'Weak - Below-average quality and concerns on strength';
  } else {
    businessQuality = 'Poor - Significant concerns about business quality';
  }

  // Valuation assessment
  let valuationLevel: string;
  if (sectorPE > 0) {
    const relativeMultiple = peRatio / sectorPE;
    if (relativeMultiple > 1.2) {
      valuationLevel = 'Expensive (vs sector)';
    } else if (relativeMultiple < 0.8) {
      valuationLevel = 'Cheap (vs sector)';
    } else {
      valuationLevel = 'Fair (vs sector)';
    }
  } else {
    valuationLevel = peRatio > 30 ? 'Expensive' : peRatio > 20 ? 'Fair' : 'Cheap';
  }

  let sentimentLevel = avgSentiment;
  let marketPosition = epsGrowth > 15 ? 'Growth leader' : epsGrowth > 5 ? 'Growing' : epsGrowth > 0 ? 'Stable' : 'Declining';

  const interpretation = `${businessQuality} | ${valuationLevel} valuation | Growth: ${marketPosition}`;

  const recommendations = [
    `Business Quality: ${businessQuality}`,
    `Valuation: ${valuationLevel} (P/E ${peRatio.toFixed(1)}x vs ${sector} avg ${sectorPE.toFixed(1)}x)`,
    `Financial Health: Current Ratio ${currentRatio.toFixed(2)}, ROE ${Number(roe).toFixed(1)}%`,
    `Analyst consensus: ${consensusRating.toLowerCase()}`,
    `Growth trajectory: ${marketPosition} (EPS growth ${epsGrowth?.toFixed(1)}%)`,
    `News sentiment: ${avgSentiment}`
  ];

  return {
    businessQuality,
    valuationLevel,
    sentimentLevel,
    marketPosition,
    overallInterpretation: interpretation,
    recommendations
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
