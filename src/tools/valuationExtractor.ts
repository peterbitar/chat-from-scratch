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
    const [quoteRes, metricsRes, incomeRes] = await Promise.all([
      axios.get(`${BASE}/quote?symbol=${symbol.toUpperCase()}&apikey=${FMP_API_KEY}`),
      axios.get(`${BASE}/key-metrics?symbol=${symbol.toUpperCase()}&apikey=${FMP_API_KEY}`),
      axios.get(`${BASE}/income-statement?symbol=${symbol.toUpperCase()}&period=quarter&limit=1&apikey=${FMP_API_KEY}`)
    ]);

    const quoteData = quoteRes.data;
    if (!quoteData || quoteData.length === 0) {
      return { symbol, error: 'No data returned from API.' };
    }

    const quote = quoteData[0];
    const metricsData = metricsRes.data;
    const metrics = metricsData && metricsData.length > 0 ? metricsData[0] : {};
    const incomeData = incomeRes.data;
    const income = incomeData && incomeData.length > 0 ? incomeData[0] : {};

    // Extract market cap
    const marketCap = quote.marketCap ?? null;
    const price = num(quote.price) ?? null;

    // Calculate P/E ratio from market cap and net income
    let peRatio = num(quote.pe) ?? num(quote.priceEarningsRatio) ?? num(metrics.peRatio) ?? null;
    if (!peRatio && marketCap && income.netIncome) {
      // P/E = Market Cap / Net Income
      const annualizedNetIncome = income.netIncome * 4; // Annualize quarterly earnings
      peRatio = marketCap / annualizedNetIncome;
    }

    // Calculate EPS from earnings and shares outstanding
    let eps = num(quote.eps) ?? num(quote.earningsPerShare) ?? num(metrics.epsPerShare) ?? null;
    if (!eps && income.netIncome && quote.sharesOutstanding) {
      // EPS = Net Income / Shares Outstanding
      eps = (income.netIncome * 4) / quote.sharesOutstanding; // Annualize quarterly
    }

    // Extract price change data
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
      peRatio: peRatio ? parseFloat(peRatio.toFixed(2)) : null,
      eps: eps ? parseFloat(eps.toFixed(2)) : null,
      marketCap,
      source: 'FMP Starter (with calculated metrics)',
      error: null
    };
  } catch (err: any) {
    return {
      symbol,
      error: `Valuation fetch failed: ${err.message}`
    };
  }
}
