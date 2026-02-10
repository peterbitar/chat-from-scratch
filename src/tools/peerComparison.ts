import axios from 'axios';
import { getValuation } from './valuationExtractor';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

/** FMP auth: docs say use apikey in header or query. We send both for compatibility. */
const fmpAuth = FMP_API_KEY
  ? { params: { apikey: FMP_API_KEY }, headers: { apikey: FMP_API_KEY } as Record<string, string> }
  : {};

export async function getPeerComparison({ symbol }: { symbol: string }) {
  try {
    const { data } = await axios.get(`${BASE}/stock-peers`, {
      params: { symbol, ...(fmpAuth.params || {}) },
      ...(fmpAuth.headers && { headers: fmpAuth.headers })
    });

    // FMP returns an array of { symbol, companyName, price, mktCap } (not { peers: [...] })
    const rawPeers = Array.isArray(data) ? data : data?.peers ?? [];
    const peerTickers: string[] = rawPeers.map((p: { symbol?: string }) => p?.symbol).filter(Boolean);

    const valuations = await Promise.all(
      peerTickers.map(async (peer) => {
        const val = await getValuation({ symbol: peer });
        return val;
      })
    );

    const valid = valuations.filter(v => v.peRatio);
    const avg = (arr: number[]) =>
      arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null;

    const peerAveragePE = avg(valid.map(v => v.peRatio!));
    return {
      symbol,
      peers: peerTickers,
      sectorAveragePE: peerAveragePE,
      peerAveragePE, // same value; use for industry comparison when sector/industry snapshot unavailable
      peerData: valid,
      source: 'FMP',
      error: null
    };
  } catch (err: any) {
    const status = err.response?.status;
    const message = status === 401
      ? 'Peer comparison not available (API key may not have access to this endpoint).'
      : `Peer comparison failed: ${err.message}`;
    return {
      symbol,
      peers: [],
      sectorAveragePE: null,
      peerAveragePE: null,
      peerData: [],
      source: 'FMP',
      error: message
    };
  }
}
