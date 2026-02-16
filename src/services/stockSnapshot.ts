/**
 * Stock Snapshot API — Starter-safe
 * Returns clean JSON with 3 objective metrics per stock:
 * 1. vs S&P 500 (3Y total return)
 * 2. Valuation · Relative to sector
 * 3. Fundamentals · Strong/Mixed/Weak
 *
 * Uses tools as single source of truth: getSP500Comparison, getValuation, getIndustryPeerSymbols, getRatingsSnapshot.
 */

import { getSP500Comparison } from '../tools/sp500Comparison';
import { getValuation } from '../tools/valuationExtractor';
import { getIndustryPeerSymbols } from '../tools/industryPeers';
import { getRatingsSnapshot } from '../tools/ratingsSnapshot';

// --- Types ---

export type VsSp500Label = 'Outperformed' | 'In line' | 'Underperformed';
export type ValuationLabel = 'Above sector peers' | 'In line with sector peers' | 'Below sector peers' | 'Relative to sector';
export type FundamentalsLabel = 'Strong' | 'Mixed' | 'Weak';

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
    sector: string | null;
    sectorPeersMedianPE: number | null;
    peerCount: number;
  };
  fundamentals: {
    label: FundamentalsLabel;
    basedOn: string;
    overallScore: number | null;
  };
  timestamp: string;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
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

  // 2. Valuation — use getValuation + getIndustryPeerSymbols + getValuation for peers
  const valuationData = await getValuation({ symbol: sym });
  const sector = valuationData.sector ?? null;
  const industry = valuationData.industry ?? null;
  const stockPE = valuationData.peRatio ?? null;
  const stockPEVal = stockPE != null && Number.isFinite(stockPE) ? Math.round(stockPE * 100) / 100 : null;

  let sectorPeersMedianPE: number | null = null;
  let peerCount = 0;

  const peerSymbols = await getIndustryPeerSymbols(sector, industry, sym);
  if (peerSymbols.length > 0) {
    const peerVals = await Promise.all(peerSymbols.map((s) => getValuation({ symbol: s })));
    const peerPEs = peerVals
      .map((v) => v.peRatio)
      .filter((pe): pe is number => pe != null && pe > 0 && pe < 200 && Number.isFinite(pe));
    sectorPeersMedianPE = median(peerPEs);
    if (sectorPeersMedianPE != null) sectorPeersMedianPE = Math.round(sectorPeersMedianPE * 100) / 100;
    peerCount = peerPEs.length;
  }

  let valLabel: ValuationLabel = 'Relative to sector';
  if (stockPEVal != null && sectorPeersMedianPE != null && sectorPeersMedianPE > 0) {
    const pctDiff = ((stockPEVal - sectorPeersMedianPE) / sectorPeersMedianPE) * 100;
    if (pctDiff > 12) valLabel = 'Above sector peers';
    else if (pctDiff < -12) valLabel = 'Below sector peers';
    else valLabel = 'In line with sector peers';
  }

  const valuation = {
    label: valLabel,
    stockPE: stockPEVal,
    sector,
    sectorPeersMedianPE,
    peerCount
  };

  // 3. Fundamentals — use getRatingsSnapshot
  const ratings = await getRatingsSnapshot(sym);
  const overall = ratings.overallScore ?? 0;
  let fundLabel: FundamentalsLabel = 'Mixed';
  if (overall >= 4) fundLabel = 'Strong';
  else if (overall <= 2) fundLabel = 'Weak';

  const fundamentals = {
    label: fundLabel,
    basedOn: 'Based on profitability, leverage, and valuation ratios',
    overallScore: overall || null
  };

  return {
    symbol: sym,
    vsSp500,
    valuation,
    fundamentals,
    timestamp: new Date().toISOString()
  };
}
