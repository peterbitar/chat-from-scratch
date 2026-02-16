/**
 * Income statement tool — single source of truth for FMP income-statement.
 */

import axios from 'axios';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

const p = (params: Record<string, unknown>) => ({
  params: { ...params, apikey: FMP_API_KEY },
  headers: { apikey: FMP_API_KEY } as Record<string, string>
});

export interface IncomeStatementRow {
  date?: string;
  revenue?: number;
  operatingIncome?: number;
  netIncome?: number;
  [k: string]: unknown;
}

/**
 * Fetch income statement (annual or quarter).
 */
export async function getIncomeStatement(
  symbol: string,
  opts?: { period?: 'annual' | 'quarter'; limit?: number }
): Promise<IncomeStatementRow[]> {
  try {
    const res = await axios.get<IncomeStatementRow[]>(`${BASE}/income-statement`, p({
      symbol: symbol.toUpperCase(),
      period: opts?.period ?? 'annual',
      limit: opts?.limit ?? 4
    }));
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}
