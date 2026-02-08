import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
}

export async function getSP500Comparison({ symbol }: { symbol: string }): Promise<PerformanceComparison> {
  try {
    const response = await openai.responses.create({
      model: 'gpt-4o',
      instructions: `You are a financial performance analyst. Search for the performance comparison between a stock and the S&P 500 index. Extract:
1. Stock YTD (Year-to-Date) performance percentage
2. Stock 1-year performance percentage
3. Stock 3-year performance percentage (if available)
4. Stock 5-year performance percentage (if available)
5. S&P 500 YTD performance
6. S&P 500 1-year performance
7. S&P 500 3-year performance (if available)
8. S&P 500 5-year performance (if available)
9. Whether the stock is outperforming or underperforming the S&P 500
10. By how much

Return performance numbers as percentages (e.g., 15.5 for 15.5%).`,
      input: [
        {
          role: 'user',
          content: `Compare ${symbol.toUpperCase()} stock performance to S&P 500 (SPY/^GSPC). Show YTD, 1-year, 3-year, and 5-year returns and tell me if ${symbol} is outperforming or underperforming the market.`,
          type: 'message'
        }
      ],
      tools: [{ type: 'web_search_preview' as const }],
      tool_choice: 'auto'
    });

    const content = response.output_text || '';

    // Parse performance data using regex
    const parsePercentage = (text: string, pattern: RegExp): number | undefined => {
      const match = text.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        return isNaN(value) ? undefined : value;
      }
      return undefined;
    };

    // Extract performance numbers (looking for patterns like "15.5%", "-10.2%", "15.5 percent", etc.)
    const performanceData = {
      stock: {
        ytd: parsePercentage(content, /(?:AAPL|MSFT|TSLA|GOOGL|AMZN|SPY|ticker)\s+YTD[:\s]+(-?\d+\.?\d*)%?/i) ||
              parsePercentage(content, /YTD.*?(-?\d+\.?\d*)%/i),
        oneYear: parsePercentage(content, /1[-\s]?year[:\s]+(-?\d+\.?\d*)%/i),
        threeYear: parsePercentage(content, /3[-\s]?year[:\s]+(-?\d+\.?\d*)%/i),
        fiveYear: parsePercentage(content, /5[-\s]?year[:\s]+(-?\d+\.?\d*)%/i)
      },
      sp500: {
        ytd: parsePercentage(content, /S&P 500.*?YTD[:\s]+(-?\d+\.?\d*)%/i) ||
             parsePercentage(content, /(?:SPY|market|index).*?YTD[:\s]+(-?\d+\.?\d*)%/i),
        oneYear: parsePercentage(content, /S&P 500.*?1[-\s]?year[:\s]+(-?\d+\.?\d*)%/i),
        threeYear: parsePercentage(content, /S&P 500.*?3[-\s]?year[:\s]+(-?\d+\.?\d*)%/i),
        fiveYear: parsePercentage(content, /S&P 500.*?5[-\s]?year[:\s]+(-?\d+\.?\d*)%/i)
      }
    };

    // Determine outperformance if we have YTD data for both
    let outperforming = false;
    let outperformanceAmount = 0;
    if (performanceData.stock.ytd !== undefined && performanceData.sp500.ytd !== undefined) {
      outperformanceAmount = performanceData.stock.ytd - performanceData.sp500.ytd;
      outperforming = outperformanceAmount > 0;
    }

    const summary =
      outperformanceAmount !== 0
        ? `${symbol.toUpperCase()} is ${outperforming ? 'OUTPERFORMING' : 'UNDERPERFORMING'} the S&P 500 by ${Math.abs(outperformanceAmount).toFixed(2)}%`
        : 'Unable to determine performance comparison';

    return {
      symbol: symbol.toUpperCase(),
      ytdPerformance: performanceData.stock.ytd,
      oneYearPerformance: performanceData.stock.oneYear,
      threeYearPerformance: performanceData.stock.threeYear,
      fiveYearPerformance: performanceData.stock.fiveYear,
      sp500YTD: performanceData.sp500.ytd,
      sp500OneYear: performanceData.sp500.oneYear,
      sp500ThreeYear: performanceData.sp500.threeYear,
      sp500FiveYear: performanceData.sp500.fiveYear,
      outperforming,
      outperformanceAmount,
      timeframe: 'YTD',
      summary
    };
  } catch (err: any) {
    return {
      symbol: symbol.toUpperCase(),
      summary: `Error fetching S&P 500 comparison: ${err.message}`
    };
  }
}
