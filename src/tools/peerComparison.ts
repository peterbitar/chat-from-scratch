import axios from 'axios';
import { getValuation } from './valuationExtractor';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

export async function getPeerComparison({ symbol }: { symbol: string }) {
  try {
    const peersUrl = `${BASE}/stock-peers?symbol=${symbol}&apikey=${FMP_API_KEY}`;
    const { data } = await axios.get(peersUrl);

    const peerTickers: string[] = data?.peers || [];

    const valuations = await Promise.all(
      peerTickers.map(async (peer) => {
        const val = await getValuation({ symbol: peer });
        return val;
      })
    );

    const valid = valuations.filter(v => v.peRatio);
    const avg = (arr: number[]) =>
      arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null;

    return {
      symbol,
      peers: peerTickers,
      sectorAveragePE: avg(valid.map(v => v.peRatio!)),
      peerData: valid,
      source: 'FMP',
      error: null
    };
  } catch (err: any) {
    return {
      symbol,
      peers: [],
      error: `Peer comparison failed: ${err.message}`
    };
  }
}
