/**
 * Analyst estimates tool — single source of truth for FMP analyst-estimates.
 */

import axios from 'axios';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

const p = (params: Record<string, unknown>) => ({
  params: { ...params, apikey: FMP_API_KEY },
  headers: { apikey: FMP_API_KEY } as Record<string, string>
});

export interface AnalystEstimateRow {
  date?: string;
  epsAvg?: number;
  epsHigh?: number;
  epsLow?: number;
  revenueAvg?: number;
  [k: string]: unknown;
}

/**
 * Fetch analyst estimates (annual or quarter).
 */
export async function getAnalystEstimates(
  symbol: string,
  opts?: { period?: 'annual' | 'quarter'; limit?: number }
): Promise<AnalystEstimateRow[]> {
  try {
    const res = await axios.get<AnalystEstimateRow[]>(`${BASE}/analyst-estimates`, p({
      symbol: symbol.toUpperCase(),
      period: opts?.period ?? 'annual',
      limit: opts?.limit ?? 4
    }));
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}
