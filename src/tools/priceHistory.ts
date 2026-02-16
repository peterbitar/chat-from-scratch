/**
 * Price history tool — single source of truth for historical EOD prices.
 * Used by: earningsRecap (market reaction), dailyCheck, stockSnapshot (via getSP500Comparison).
 */

import axios from 'axios';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

const fmpAuth = FMP_API_KEY
  ? { params: { apikey: FMP_API_KEY }, headers: { apikey: FMP_API_KEY } as Record<string, string> }
  : {};

export interface EodPoint {
  date: string;
  price?: number;
  close?: number;
  adjClose?: number;
  adj_close?: number;
  volume?: number;
  [k: string]: unknown;
}

function formatYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getClose(p: EodPoint): number | undefined {
  const c = p.adjClose ?? (p as { adj_close?: number }).adj_close ?? p.price ?? p.close;
  return typeof c === 'number' && Number.isFinite(c) ? c : undefined;
}

/**
 * Fetch historical end-of-day prices for a symbol.
 * @param symbol Ticker (e.g. AAPL, ^GSPC)
 * @param from Start date (YYYY-MM-DD)
 * @param to End date (YYYY-MM-DD)
 */
export async function getPriceHistory(
  symbol: string,
  from: string,
  to: string
): Promise<EodPoint[]> {
  try {
    const res = await axios.get<EodPoint[]>(`${BASE}/historical-price-eod/light`, {
      params: { symbol: symbol.toUpperCase(), from, to, ...fmpAuth.params },
      ...(fmpAuth.headers && { headers: fmpAuth.headers })
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

/**
 * Fetch price history by days back from today.
 */
export async function getPriceHistoryDays(symbol: string, days: number): Promise<EodPoint[]> {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return getPriceHistory(symbol, formatYMD(from), formatYMD(to));
}
