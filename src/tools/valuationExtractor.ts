import axios from 'axios';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

function num(val: unknown): number | null {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export async function getValuation({ symbol }: { symbol: string }) {
  try {
    // FMP Starter - NEW /stable/ endpoint (not deprecated v3/v4)
    const [quoteRes, metricsRes] = await Promise.all([
      axios.get(`${BASE}/quote?symbol=${symbol.toUpperCase()}&apikey=${FMP_API_KEY}`),
      axios.get(`${BASE}/key-metrics?symbol=${symbol.toUpperCase()}&apikey=${FMP_API_KEY}`)
    ]);

    const quoteData = quoteRes.data;
    if (!quoteData || quoteData.length === 0) {
      return { symbol, error: 'No data returned from API.' };
    }

    const quote = quoteData[0];
    const metricsData = metricsRes.data;
    const metrics = metricsData && metricsData.length > 0 ? metricsData[0] : {};

    // Extract PE ratio - try multiple field names
    const peRatio = num(quote.pe) ?? num(quote.priceEarningsRatio) ?? num(metrics.peRatio) ?? null;

    // Extract EPS - try multiple field names
    const eps = num(quote.eps) ?? num(quote.earningsPerShare) ?? num(metrics.epsPerShare) ?? null;

    // Extract market cap
    const marketCap = quote.marketCap ?? null;

    // Extract price change data
    const price = num(quote.price) ?? null;
    const change = num(quote.change) ?? null;
    const changePercent = num(quote.changePercentage) ?? null;
    const dayHigh = num(quote.dayHigh) ?? null;
    const dayLow = num(quote.dayLow) ?? null;
    const yearHigh = num(quote.yearHigh) ?? null;
    const yearLow = num(quote.yearLow) ?? null;

    return {
      symbol,
      price,
      change,
      changePercent,
      dayHigh,
      dayLow,
      yearHigh,
      yearLow,
      peRatio,
      eps,
      marketCap,
      source: 'FMP Starter',
      error: null
    };
  } catch (err: any) {
    return {
      symbol,
      error: `Valuation fetch failed: ${err.message}`
    };
  }
}
