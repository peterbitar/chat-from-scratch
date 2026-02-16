/**
 * Stock Snapshot API — Starter-safe
 * Returns clean JSON with 3 objective metrics per stock:
 * 1. vs S&P 500 (3Y total return)
 * 2. Valuation · Relative to industry (from FMP industry-pe-snapshot / sector-pe-snapshot)
 * 3. Fundamentals · 4 Pillars of Structural Quality (0–8 score)
 *
 * 4 Pillars: ROIC/ROE, Net Debt/EBITDA, FCF Stability, Revenue CAGR.
 * Each pillar: Strong=2, Balanced=1, Weak=0. Total 0–8.
 */

import { getSP500Comparison } from '../tools/sp500Comparison';
import { getValuation } from '../tools/valuationExtractor';

// --- Types ---

export type VsSp500Label = 'Outperformed' | 'In line' | 'Underperformed';
export type ValuationLabel = 'Above industry peers' | 'In line with industry peers' | 'Below industry peers' | 'Relative to industry';
export type PillarGrade = 'Strong' | 'Balanced' | 'Weak';

export interface StructuralPillar {
  name: string;
  grade: PillarGrade;
  points: number;
  value: number | null;
  unit: string;
}

export interface StockSnapshot {
  symbol: string;
  vsSp500: {
    label: VsSp500Label;
    timeframe: '3Y';
    stockReturn3Y: number | null;
    sp500Return3Y: number | null;
    differencePct: number | null;
  };
  valuation: {
    label: ValuationLabel;
    stockPE: number | null;
    industry: string | null;
    industryPE: number | null;
  };
  fundamentals: {
    label: PillarGrade;
    score: number;
    maxScore: number;
    pillars: StructuralPillar[];
    basedOn: string;
  };
  timestamp: string;
}

// --- 4 Pillars of Structural Quality ---

function pillar1ReturnOnCapital(roic: number | null, roe: number | null): StructuralPillar {
  const val = roic ?? roe;
  let grade: PillarGrade = 'Weak';
  let points = 0;
  if (val != null && Number.isFinite(val)) {
    if (val >= 15) {
      grade = 'Strong';
      points = 2;
    } else if (val >= 8) {
      grade = 'Balanced';
      points = 1;
    }
  }
  return {
    name: 'Return on Capital',
    grade,
    points,
    value: val ?? null,
    unit: '%'
  };
}

function pillar2BalanceSheet(ndToEbitda: number | null): StructuralPillar {
  let grade: PillarGrade = 'Weak';
  let points = 0;
  if (ndToEbitda != null && Number.isFinite(ndToEbitda)) {
    if (ndToEbitda <= 1.5 || ndToEbitda < 0) {
      grade = 'Strong';
      points = 2;
    } else if (ndToEbitda <= 3) {
      grade = 'Balanced';
      points = 1;
    }
  }
  return {
    name: 'Balance Sheet (ND/EBITDA)',
    grade,
    points,
    value: ndToEbitda ?? null,
    unit: 'x'
  };
}

function pillar3FcfStability(fcfYield: number | null): StructuralPillar {
  let grade: PillarGrade = 'Weak';
  let points = 0;
  if (fcfYield != null && Number.isFinite(fcfYield)) {
    if (fcfYield > 3) {
      grade = 'Strong';
      points = 2;
    } else if (fcfYield > 0) {
      grade = 'Balanced';
      points = 1;
    }
  }
  return {
    name: 'Free Cash Flow',
    grade,
    points,
    value: fcfYield ?? null,
    unit: '%'
  };
}

function pillar4RevenueCagr(revenueGrowth: number | null): StructuralPillar {
  let grade: PillarGrade = 'Weak';
  let points = 0;
  if (revenueGrowth != null && Number.isFinite(revenueGrowth)) {
    if (revenueGrowth >= 10) {
      grade = 'Strong';
      points = 2;
    } else if (revenueGrowth >= 3) {
      grade = 'Balanced';
      points = 1;
    }
  }
  return {
    name: 'Revenue Growth (CAGR)',
    grade,
    points,
    value: revenueGrowth ?? null,
    unit: '%'
  };
}

function computeStructuralQuality(v: {
  returnOnInvestedCapital: number | null;
  returnOnEquity: number | null;
  netDebtToEBITDA: number | null;
  freeCashFlowYield: number | null;
  revenueGrowth: number | null;
}): { pillars: StructuralPillar[]; score: number; label: PillarGrade } {
  const p1 = pillar1ReturnOnCapital(v.returnOnInvestedCapital, v.returnOnEquity);
  const p2 = pillar2BalanceSheet(v.netDebtToEBITDA);
  const p3 = pillar3FcfStability(v.freeCashFlowYield);
  const p4 = pillar4RevenueCagr(v.revenueGrowth);
  const pillars = [p1, p2, p3, p4];
  const score = pillars.reduce((sum, p) => sum + p.points, 0);
  let label: PillarGrade = 'Weak';
  if (score >= 6) label = 'Strong';
  else if (score >= 3) label = 'Balanced';
  return { pillars, score, label };
}

// --- Main ---

export async function generateStockSnapshot(symbol: string): Promise<StockSnapshot> {
  const sym = symbol.toUpperCase();

  // 1. vs S&P 500 (3Y) — use getSP500Comparison
  const sp500 = await getSP500Comparison({ symbol: sym });
  const stockReturn3Y = sp500.threeYearPerformance ?? null;
  const sp500Return3Y = sp500.sp500ThreeYear ?? null;
  const diff = stockReturn3Y != null && sp500Return3Y != null ? stockReturn3Y - sp500Return3Y : null;
  let vsLabel: VsSp500Label = 'In line';
  if (diff != null) {
    if (diff > 2) vsLabel = 'Outperformed';
    else if (diff < -2) vsLabel = 'Underperformed';
  }
  const vsSp500 = {
    label: vsLabel,
    timeframe: '3Y' as const,
    stockReturn3Y,
    sp500Return3Y,
    differencePct: diff != null ? Math.round(diff * 100) / 100 : null
  };

  // 2. Valuation — use FMP industry-pe-snapshot / sector-pe-snapshot (getValuation returns industryAveragePE, sectorAveragePE)
  const valuationData = await getValuation({ symbol: sym });
  const industry = valuationData.industry ?? null;
  const sector = valuationData.sector ?? null;
  const stockPE = valuationData.peRatio ?? null;
  const stockPEVal = stockPE != null && Number.isFinite(stockPE) ? Math.round(stockPE * 100) / 100 : null;

  // Prefer industry P/E from API; fallback to sector P/E when industry unavailable
  const industryPE =
    (industry ? valuationData.industryAveragePE : null) ?? valuationData.sectorAveragePE ?? null;
  const industryPERounded =
    industryPE != null && Number.isFinite(industryPE) ? Math.round(industryPE * 100) / 100 : null;

  let valLabel: ValuationLabel = 'Relative to industry';
  if (stockPEVal != null && industryPERounded != null && industryPERounded > 0) {
    const pctDiff = ((stockPEVal - industryPERounded) / industryPERounded) * 100;
    if (pctDiff > 12) valLabel = 'Above industry peers';
    else if (pctDiff < -12) valLabel = 'Below industry peers';
    else valLabel = 'In line with industry peers';
  }

  const valuation = {
    label: valLabel,
    stockPE: stockPEVal,
    industry: industry ?? sector,
    industryPE: industryPERounded
  };

  // 3. Fundamentals — 4 Pillars of Structural Quality (ROIC/ROE, ND/EBITDA, FCF, Revenue CAGR)
  const quality = computeStructuralQuality({
    returnOnInvestedCapital: valuationData.returnOnInvestedCapital ?? null,
    returnOnEquity: valuationData.returnOnEquity ?? null,
    netDebtToEBITDA: valuationData.netDebtToEBITDA ?? null,
    freeCashFlowYield: valuationData.freeCashFlowYield ?? null,
    revenueGrowth: valuationData.revenueGrowth ?? null
  });

  const fundamentals = {
    label: quality.label,
    score: quality.score,
    maxScore: 8,
    pillars: quality.pillars,
    basedOn: '4 pillars: ROIC/ROE, Net Debt/EBITDA, FCF Stability, Revenue CAGR'
  };

  return {
    symbol: sym,
    vsSp500,
    valuation,
    fundamentals,
    timestamp: new Date().toISOString()
  };
}
