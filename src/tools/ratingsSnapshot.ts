/**
 * Ratings snapshot tool — single source of truth for FMP ratings-snapshot (overallScore).
 * Used by stockSnapshot for fundamentals Strong/Mixed/Weak label.
 */

import axios from 'axios';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

const p = (params: Record<string, unknown>) => ({
  params: { ...params, apikey: FMP_API_KEY },
  headers: { apikey: FMP_API_KEY } as Record<string, string>
});

export interface RatingsSnapshotResult {
  symbol: string;
  overallScore: number | null;
}

/**
 * Fetch ratings-snapshot overallScore (0-5 scale, used for fundamentals label).
 */
export async function getRatingsSnapshot(symbol: string): Promise<RatingsSnapshotResult> {
  try {
    const res = await axios.get<
      Array<{ overallScore?: number; returnOnEquityScore?: number; returnOnAssetsScore?: number; debtToEquityScore?: number }>
    >(`${BASE}/ratings-snapshot`, p({ symbol: symbol.toUpperCase() }));

    const s = res.data?.[0];
    const overall = s?.overallScore ?? null;

    return {
      symbol: symbol.toUpperCase(),
      overallScore: overall != null && Number.isFinite(overall) ? overall : null
    };
  } catch {
    return { symbol: symbol.toUpperCase(), overallScore: null };
  }
}
