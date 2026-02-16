/**
 * Industry peers tool — single source of truth for sector/industry peer symbols.
 * Uses FMP company-screener. Metrics come from getValuation.
 */

import axios from 'axios';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

const p = (params: Record<string, unknown>) => ({
  params: { ...params, apikey: FMP_API_KEY },
  headers: { apikey: FMP_API_KEY } as Record<string, string>
});

/**
 * Get peer symbols from company-screener by sector and/or industry.
 * Used by industryComparison and stockSnapshot for sector/industry peer sets.
 */
export async function getIndustryPeerSymbols(
  sector: string | null,
  industry: string | null,
  excludeSymbol: string
): Promise<string[]> {
  const sym = excludeSymbol.toUpperCase();
  if (!sector && !industry) return [];

  const params: Record<string, unknown> = { limit: 25 };
  if (sector) params.sector = sector;
  if (industry) params.industry = industry;

  try {
    const res = await axios.get<Array<{ symbol?: string }>>(`${BASE}/company-screener`, p(params));
    const list = Array.isArray(res.data) ? res.data : [];
    return list
      .map((c) => (c.symbol || '').toString().toUpperCase())
      .filter((s) => s && s !== sym)
      .slice(0, 18);
  } catch {
    return [];
  }
}
