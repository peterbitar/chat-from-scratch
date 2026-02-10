/**
 * Stock Snapshot API — Starter-safe
 * Returns clean JSON with 3 objective metrics per stock:
 * 1. vs S&P 500 (3Y total return) — historical-price-eod/light
 * 2. Valuation · Relative to sector — profile + ratios-ttm (+ optional screener)
 * 3. Fundamentals · Strong/Mixed/Weak — ratings-snapshot
 */

import axios from 'axios';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';
const GSPC = '^GSPC';

const p = (params: Record<string, unknown>) => ({
  params: { ...params, apikey: FMP_API_KEY },
  headers: { apikey: FMP_API_KEY } as Record<string, string>
});

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

// --- 1. vs S&P 500 (3Y total return) ---

interface EodPoint {
  date: string;
  price?: number;
  close?: number;
  adjClose?: number;
  adj_close?: number;
  [k: string]: unknown;
}

function formatYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getAdjClose(p: EodPoint): number | undefined {
  const c = p.adjClose ?? p.adj_close ?? p.price ?? p.close;
  return typeof c === 'number' && Number.isFinite(c) ? c : undefined;
}

function totalReturn(points: EodPoint[]): number | null {
  if (!points.length) return null;
  const sorted = [...points].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const latest = getAdjClose(sorted[0]);
  const oldest = getAdjClose(sorted[sorted.length - 1]);
  if (latest == null || oldest == null || oldest <= 0) return null;
  return ((latest - oldest) / oldest) * 100;
}

async function getVsSp500(symbol: string): Promise<StockSnapshot['vsSp500']> {
  const now = new Date();
  const threeYAgo = new Date(now);
  threeYAgo.setFullYear(threeYAgo.getFullYear() - 3);
  const from = formatYMD(threeYAgo);
  const to = formatYMD(now);

  try {
    const [stockRes, indexRes] = await Promise.all([
      axios.get<EodPoint[]>(`${BASE}/historical-price-eod/light`, {
        ...p({ symbol: symbol.toUpperCase(), from, to })
      }),
      axios.get<EodPoint[]>(`${BASE}/historical-price-eod/light`, {
        ...p({ symbol: GSPC, from, to })
      })
    ]);

    const stockPoints: EodPoint[] = Array.isArray(stockRes.data) ? stockRes.data : [];
    const indexPoints: EodPoint[] = Array.isArray(indexRes.data) ? indexRes.data : [];

    const stockRet = totalReturn(stockPoints);
    const indexRet = totalReturn(indexPoints);

    if (stockRet == null || indexRet == null) {
      return {
        label: 'In line',
        timeframe: '3Y',
        stockReturn3Y: stockRet,
        sp500Return3Y: indexRet,
        differencePct: null
      };
    }

    const diff = stockRet - indexRet;
    let label: VsSp500Label = 'In line';
    if (diff > 2) label = 'Outperformed';
    else if (diff < -2) label = 'Underperformed';

    return {
      label,
      timeframe: '3Y',
      stockReturn3Y: Math.round(stockRet * 100) / 100,
      sp500Return3Y: Math.round(indexRet * 100) / 100,
      differencePct: Math.round(diff * 100) / 100
    };
  } catch (err: unknown) {
    return {
      label: 'In line',
      timeframe: '3Y',
      stockReturn3Y: null,
      sp500Return3Y: null,
      differencePct: null
    };
  }
}

// --- 2. Valuation · Relative to sector (Starter-safe) ---
// Uses: profile (sector) + ratios-ttm (P/E). Optional: company-screener for sector peers.

interface RatiosTTM {
  priceToEarningsRatioTTM?: number;
  priceEarningsRatioTTM?: number;
}

async function getValuation(symbol: string): Promise<StockSnapshot['valuation']> {
  const sym = symbol.toUpperCase();

  try {
    const [profileRes, ratiosRes] = await Promise.all([
      axios.get<Array<{ sector?: string }>>(`${BASE}/profile`, p({ symbol: sym })),
      axios.get<Array<RatiosTTM>>(`${BASE}/ratios-ttm`, p({ symbol: sym }))
    ]);

    const profile = profileRes.data?.[0];
    const sector = (profile?.sector || '').trim() || null;

    const r = ratiosRes.data?.[0];
    const stockPE = r?.priceToEarningsRatioTTM ?? r?.priceEarningsRatioTTM ?? null;
    const stockPEVal = stockPE != null && Number.isFinite(stockPE) ? Math.round(stockPE * 100) / 100 : null;

    let peerPEs: number[] = [];
    if (sector) {
      const screenerRes = await axios.get<Array<{ symbol?: string; sector?: string }>>(`${BASE}/company-screener`, p({ sector, limit: 25 })).catch(() => ({ data: [] }));
      const screener = Array.isArray(screenerRes.data) ? screenerRes.data : [];
      const peerSymbols = screener
        .filter((c) => (c.symbol || '').toString().toUpperCase() !== sym)
        .map((c) => (c.symbol || '').toString())
        .filter(Boolean)
        .slice(0, 15);

      const peerRatios = await Promise.all(
        peerSymbols.map((s) => axios.get<Array<RatiosTTM>>(`${BASE}/ratios-ttm`, p({ symbol: s })).catch(() => ({ data: [] })))
      );
      peerPEs = peerRatios
        .map((pr) => pr.data?.[0]?.priceToEarningsRatioTTM ?? pr.data?.[0]?.priceEarningsRatioTTM)
        .filter((pe): pe is number => pe != null && pe > 0 && pe < 200 && Number.isFinite(pe));
    }

    const median = (arr: number[]) => {
      if (arr.length === 0) return null;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };

    const sectorPeersMedianPE = median(peerPEs);
    const medianVal = sectorPeersMedianPE != null ? Math.round(sectorPeersMedianPE * 100) / 100 : null;

    let label: ValuationLabel = 'Relative to sector';
    if (stockPEVal != null && medianVal != null && medianVal > 0) {
      const pctDiff = ((stockPEVal - medianVal) / medianVal) * 100;
      if (pctDiff > 12) label = 'Above sector peers';
      else if (pctDiff < -12) label = 'Below sector peers';
      else label = 'In line with sector peers';
    }

    return {
      label,
      stockPE: stockPEVal,
      sector,
      sectorPeersMedianPE: medianVal,
      peerCount: peerPEs.length
    };
  } catch {
    return {
      label: 'Relative to sector',
      stockPE: null,
      sector: null,
      sectorPeersMedianPE: null,
      peerCount: 0
    };
  }
}

// --- 3. Fundamentals · Strong/Mixed/Weak (ratings-snapshot) ---
// Starter-safe. Maps overallScore to label. No A-/B letters, no raw rating.

async function getFundamentals(symbol: string): Promise<StockSnapshot['fundamentals']> {
  try {
    const res = await axios.get<
      Array<{
        overallScore?: number;
        returnOnEquityScore?: number;
        returnOnAssetsScore?: number;
        debtToEquityScore?: number;
      }>
    >(`${BASE}/ratings-snapshot`, p({ symbol: symbol.toUpperCase() }));

    const s = res.data?.[0];
    if (!s) {
      return { label: 'Mixed', basedOn: 'Based on profitability, leverage, and valuation ratios', overallScore: null };
    }

    const overall = s.overallScore ?? 0;

    let label: FundamentalsLabel = 'Mixed';
    if (overall >= 4) label = 'Strong';
    else if (overall <= 2) label = 'Weak';

    return {
      label,
      basedOn: 'Based on profitability, leverage, and valuation ratios',
      overallScore: overall
    };
  } catch {
    return {
      label: 'Mixed',
      basedOn: 'Based on profitability, leverage, and valuation ratios',
      overallScore: null
    };
  }
}

// --- Main ---

export async function generateStockSnapshot(symbol: string): Promise<StockSnapshot> {
  const sym = symbol.toUpperCase();

  const [vsSp500, valuation, fundamentals] = await Promise.all([
    getVsSp500(sym),
    getValuation(sym),
    getFundamentals(sym)
  ]);

  return {
    symbol: sym,
    vsSp500,
    valuation,
    fundamentals,
    timestamp: new Date().toISOString()
  };
}
