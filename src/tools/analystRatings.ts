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
    // Get analyst ratings from FMP Starter - NEW /stable/ endpoints
    const [gradesRes, targetRes] = await Promise.all([
      axios.get(`${BASE}/grades?symbol=${symbol.toUpperCase()}&apikey=${FMP_API_KEY}`).catch(() => ({ data: [] })),
      axios.get(`${BASE}/price-target-consensus?symbol=${symbol.toUpperCase()}&apikey=${FMP_API_KEY}`).catch(() => ({ data: [] }))
    ]);

    const grades = gradesRes.data?.[0];
    const target = targetRes.data?.[0];

    // Determine overall rating from latest grade
    let overallRating = 'Not available';
    if (grades?.ratingScore) {
      const score = grades.ratingScore;
      if (score >= 4.5) overallRating = 'Strong Buy';
      else if (score >= 3.5) overallRating = 'Buy';
      else if (score >= 2.5) overallRating = 'Hold';
      else if (score >= 1.5) overallRating = 'Sell';
      else overallRating = 'Strong Sell';
    }

    // Extract recommendation from grade
    let recommendation = overallRating;
    if (grades?.ratingRecommendation) {
      recommendation = grades.ratingRecommendation;
    }

    // Parse buy/hold/sell counts from grade change info if available
    let buyCount: number | undefined;
    let holdCount: number | undefined;
    let sellCount: number | undefined;

    if (grades?.ratingDetails) {
      buyCount = grades.ratingDetails.RatingDetailsBuy?.length || 0;
      holdCount = grades.ratingDetails.RatingDetailsHold?.length || 0;
      sellCount = grades.ratingDetails.RatingDetailsSell?.length || 0;
    }

    const numberOfAnalysts =
      buyCount && holdCount && sellCount ? buyCount + holdCount + sellCount : undefined;

    const rating: AnalystRating = {
      symbol: symbol.toUpperCase(),
      overallRating,
      priceTarget: target?.priceTarget ? parseFloat(target.priceTarget) : undefined,
      numberOfAnalysts,
      buyCount,
      holdCount,
      sellCount,
      recommendation,
      source: 'FMP Starter'
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
