import axios from 'axios';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

export interface AnalystRating {
  symbol: string;
  overallRating?: string;
  priceTarget?: number;
  numberOfAnalysts?: number;
  buyCount?: number;
  holdCount?: number;
  sellCount?: number;
  recommendation?: string;
  source?: string;
}

export async function getAnalystRatings({ symbol }: { symbol: string }): Promise<AnalystRating> {
  try {
    const sym = symbol.toUpperCase();
    // Ratings + grades from FMP; price target from Price Target Consensus API (see developer docs)
    const [snapshotRes, consensusRes, priceTargetRes] = await Promise.all([
      axios.get(`${BASE}/ratings-snapshot?symbol=${sym}&apikey=${FMP_API_KEY}`).catch(() => ({ data: [] })),
      axios.get(`${BASE}/grades-consensus?symbol=${sym}&apikey=${FMP_API_KEY}`).catch(() => ({ data: [] })),
      axios.get(`${BASE}/price-target-consensus?symbol=${sym}&apikey=${FMP_API_KEY}`).catch(() => ({ data: [] }))
    ]);

    const snapshot = snapshotRes.data?.[0];
    const consensus = consensusRes.data?.[0];
    const pt = priceTargetRes.data?.[0];

    // Get overall rating from snapshot or consensus
    let overallRating = snapshot?.rating || consensus?.consensus || 'Not available';

    // Get analyst counts from consensus
    const buyCount = consensus?.buy || 0;
    const holdCount = consensus?.hold || 0;
    const sellCount = consensus?.sell || 0;
    const strongBuyCount = consensus?.strongBuy || 0;
    const strongSellCount = consensus?.strongSell || 0;

    const numberOfAnalysts = buyCount + holdCount + sellCount + strongBuyCount + strongSellCount;

    // Determine recommendation based on consensus
    let recommendation = consensus?.consensus || overallRating;

    const priceTarget = pt?.targetConsensus ?? pt?.targetMedian ?? null;

    const rating: AnalystRating = {
      symbol: sym,
      overallRating,
      priceTarget: priceTarget != null ? Number(priceTarget) : undefined,
      numberOfAnalysts: numberOfAnalysts > 0 ? numberOfAnalysts : undefined,
      buyCount: buyCount > 0 ? buyCount : undefined,
      holdCount: holdCount > 0 ? holdCount : undefined,
      sellCount: sellCount > 0 ? sellCount : undefined,
      recommendation,
      source: 'FMP (ratings-snapshot, grades-consensus, price-target-consensus)'
    };

    return rating;
  } catch (err: any) {
    return {
      symbol: symbol.toUpperCase(),
      overallRating: 'Error',
      recommendation: `Failed to fetch ratings: ${err.message}`,
      source: 'Error'
    };
  }
}
