import axios from 'axios';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';
const GSPC_SYMBOL = '^GSPC'; // S&P 500 index (FMP accepts ^ unencoded in params)

const fmpAuth = FMP_API_KEY
  ? { params: { apikey: FMP_API_KEY }, headers: { apikey: FMP_API_KEY } as Record<string, string> }
  : {};

export interface PerformanceComparison {
  symbol: string;
  stockName?: string;
  ytdPerformance?: number;
  oneYearPerformance?: number;
  threeYearPerformance?: number;
  fiveYearPerformance?: number;
  sp500YTD?: number;
  sp500OneYear?: number;
  sp500ThreeYear?: number;
  sp500FiveYear?: number;
  outperforming?: boolean;
  outperformanceAmount?: number;
  timeframe?: string;
  summary?: string;
  excerpt?: string;
}

interface EodPoint {
  date: string;
  price?: number;
  close?: number;
  adjClose?: number;
  [k: string]: unknown;
}

function toDate(s: string): Date {
  return new Date(s);
}

function formatYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getClose(p: EodPoint): number | undefined {
  const c = p.price ?? p.close ?? p.adjClose ?? (p as any).adj_close;
  return typeof c === 'number' && Number.isFinite(c) ? c : undefined;
}

/** Get price on or nearest before target from sorted EOD list (newest first). */
function priceAtOrBefore(points: EodPoint[], target: Date): number | undefined {
  const sorted = [...points].sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
  for (const p of sorted) {
    const close = getClose(p);
    if (close != null && toDate(p.date) <= target) return close;
  }
  return undefined;
}

/** Latest close in the series. */
function latestClose(points: EodPoint[]): number | undefined {
  const sorted = [...points].sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
  for (const p of sorted) {
    const close = getClose(p);
    if (close != null) return close;
  }
  return undefined;
}

function pctReturn(start: number, end: number): number {
  if (start <= 0) return 0;
  return Math.round((100 * (end - start) / start) * 100) / 100;
}

export async function getSP500Comparison({ symbol }: { symbol: string }): Promise<PerformanceComparison> {
  const sym = symbol.toUpperCase();
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const oneY = new Date(now);
  oneY.setFullYear(oneY.getFullYear() - 1);
  const threeY = new Date(now);
  threeY.setFullYear(threeY.getFullYear() - 3);
  const fiveY = new Date(now);
  fiveY.setFullYear(fiveY.getFullYear() - 5);
  const from = formatYMD(fiveY);

  const to = formatYMD(now);

  try {
    const p = (symParam: string) => ({ params: { symbol: symParam, from, to, ...fmpAuth.params }, ...(fmpAuth.headers && { headers: fmpAuth.headers }) });
    const [stockRes, indexRes] = await Promise.all([
      axios.get<EodPoint[]>(`${BASE}/historical-price-eod/light`, p(sym)).catch(() => ({ data: [] })),
      axios.get<EodPoint[]>(`${BASE}/historical-price-eod/light`, p(GSPC_SYMBOL)).catch(() => ({ data: [] }))
    ]);

    const stockPoints: EodPoint[] = Array.isArray(stockRes.data) ? stockRes.data : [];
    const indexPoints: EodPoint[] = Array.isArray(indexRes.data) ? indexRes.data : [];

    const stockLatest = latestClose(stockPoints);
    const indexLatest = latestClose(indexPoints);
    const stockYtdStart = priceAtOrBefore(stockPoints, startOfYear);
    const indexYtdStart = priceAtOrBefore(indexPoints, startOfYear);
    const stock1Y = priceAtOrBefore(stockPoints, oneY);
    const index1Y = priceAtOrBefore(indexPoints, oneY);
    const stock3Y = priceAtOrBefore(stockPoints, threeY);
    const index3Y = priceAtOrBefore(indexPoints, threeY);
    const stock5Y = priceAtOrBefore(stockPoints, fiveY);
    const index5Y = priceAtOrBefore(indexPoints, fiveY);

    const ytdStock = stockLatest != null && stockYtdStart != null ? pctReturn(stockYtdStart, stockLatest) : undefined;
    const ytdSp500 = indexLatest != null && indexYtdStart != null ? pctReturn(indexYtdStart, indexLatest) : undefined;
    const oneYStock = stockLatest != null && stock1Y != null ? pctReturn(stock1Y, stockLatest) : undefined;
    const oneYSp500 = indexLatest != null && index1Y != null ? pctReturn(index1Y, indexLatest) : undefined;
    const threeYStock = stockLatest != null && stock3Y != null ? pctReturn(stock3Y, stockLatest) : undefined;
    const threeYSp500 = indexLatest != null && index3Y != null ? pctReturn(index3Y, indexLatest) : undefined;
    const fiveYStock = stockLatest != null && stock5Y != null ? pctReturn(stock5Y, stockLatest) : undefined;
    const fiveYSp500 = indexLatest != null && index5Y != null ? pctReturn(index5Y, indexLatest) : undefined;

    const ytdOutperform = (ytdStock != null && ytdSp500 != null) ? ytdStock - ytdSp500 : undefined;
    const outperforming = ytdOutperform != null ? ytdOutperform > 0 : undefined;
    const outperformanceAmount = ytdOutperform ?? 0;

    const summary =
      ytdOutperform != null
        ? `${sym} is ${outperforming ? 'OUTPERFORMING' : 'UNDERPERFORMING'} the S&P 500 by ${Math.abs(ytdOutperform).toFixed(2)}% (YTD)`
        : stockLatest != null && indexLatest != null
          ? `Data: ${sym} YTD ${ytdStock ?? '?'}%, 1Y ${oneYStock ?? '?'}%, 5Y ${fiveYStock ?? '?'}% | S&P 500 (^GSPC) YTD ${ytdSp500 ?? '?'}%, 1Y ${oneYSp500 ?? '?'}%, 5Y ${fiveYSp500 ?? '?'}%.`
          : 'Unable to fetch S&P 500 or stock history from FMP.';

    return {
      symbol: sym,
      ytdPerformance: ytdStock,
      oneYearPerformance: oneYStock,
      threeYearPerformance: threeYStock,
      fiveYearPerformance: fiveYStock,
      sp500YTD: ytdSp500,
      sp500OneYear: oneYSp500,
      sp500ThreeYear: threeYSp500,
      sp500FiveYear: fiveYSp500,
      outperforming,
      outperformanceAmount,
      timeframe: 'YTD',
      summary
    };
  } catch (err: any) {
    return {
      symbol: sym,
      summary: `Error fetching S&P 500 comparison: ${err.message}`
    };
  }
}
