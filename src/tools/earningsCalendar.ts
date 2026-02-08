import axios from 'axios';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

export interface EarningsEvent {
  symbol: string;
  date: string;
  epsActual: number | null;
  epsEstimated: number | null;
  revenueActual: number | null;
  revenueEstimated: number | null;
  lastUpdated?: string;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getEarningsCalendar({ symbol }: { symbol: string }) {
  try {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 90);

    const url = `${BASE}/earnings-calendar?from=${formatDate(from)}&to=${formatDate(to)}&apikey=${FMP_API_KEY}`;
    const { data } = await axios.get(url);

    if (!Array.isArray(data)) {
      return { symbol, events: [], error: 'Invalid earnings calendar response.' };
    }

    const events: EarningsEvent[] = data
      .filter((row: { symbol?: string }) => String(row?.symbol).toUpperCase() === symbol.toUpperCase())
      .map((row: Record<string, unknown>) => ({
        symbol: row.symbol as string,
        date: row.date as string,
        epsActual: row.epsActual != null ? Number(row.epsActual) : null,
        epsEstimated: row.epsEstimated != null ? Number(row.epsEstimated) : null,
        revenueActual: row.revenueActual != null ? Number(row.revenueActual) : null,
        revenueEstimated: row.revenueEstimated != null ? Number(row.revenueEstimated) : null,
        lastUpdated: row.lastUpdated as string | undefined
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      symbol,
      events,
      source: 'FMP',
      error: null
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      symbol,
      events: [],
      error: `Earnings calendar fetch failed: ${message}`
    };
  }
}
