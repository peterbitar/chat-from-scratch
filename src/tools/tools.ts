import { getValuation } from './valuationExtractor';
import { getPeerComparison } from './peerComparison';
import { getNewsUpdate } from './newsSentiment';
import { getEarningsCalendar } from './earningsCalendar';
import { getAnalystRatings } from './analystRatings';
import { getSP500Comparison } from './sp500Comparison';
import { runIndustryComparison } from '../services/industryComparison';
import { formatIndustryComparison } from '../formatters/industryComparisonFormatter';
import { runDailyCheck } from '../services/dailyCheck';
import { formatDailyCheck } from '../formatters/dailyCheckFormatter';

export const tools = [
  {
    name: 'getValuation',
    type: 'function',
    function: {
      name: 'getValuation',
      description: 'Get key valuation metrics for a stock',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol (e.g., AAPL)' }
        },
        required: ['symbol']
      }
    },
    func: getValuation
  },
  {
    name: 'getPeerComparison',
    type: 'function',
    function: {
      name: 'getPeerComparison',
      description: 'Compare valuation of a stock to its peers',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol (e.g., MSFT)' }
        },
        required: ['symbol']
      }
    },
    func: getPeerComparison
  },
  {
    name: 'getNewsUpdate',
    type: 'function',
    function: {
      name: 'getNewsUpdate',
      description: 'Get a news update for a stock: returns a storyline summary of what is happening (narrative) plus recent headlines with sentiment. Optional: from/to (YYYY-MM-DD), limit (1–20).',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol (e.g., TSLA)' },
          from: { type: 'string', description: 'Optional: only news on or after this date (YYYY-MM-DD)' },
          to: { type: 'string', description: 'Optional: only news on or before this date (YYYY-MM-DD)' },
          limit: { type: 'number', description: 'Optional: max headlines to return (1–20, default 10)' }
        },
        required: ['symbol']
      }
    },
    func: getNewsUpdate
  },
  {
    name: 'getEarningsCalendar',
    type: 'function',
    function: {
      name: 'getEarningsCalendar',
      description: 'Get upcoming earnings date for a stock',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol (e.g., NFLX)' }
        },
        required: ['symbol']
      }
    },
    func: getEarningsCalendar
  },
  {
    name: 'getAnalystRatings',
    type: 'function',
    function: {
      name: 'getAnalystRatings',
      description: 'Get analyst consensus ratings and price targets for a stock',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol (e.g., AAPL)' }
        },
        required: ['symbol']
      }
    },
    func: getAnalystRatings
  },
  {
    name: 'getSP500Comparison',
    type: 'function',
    function: {
      name: 'getSP500Comparison',
      description: 'Compare stock performance to S&P 500 benchmark (YTD, 1-year, 3-year, 5-year returns)',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol (e.g., AAPL)' }
        },
        required: ['symbol']
      }
    },
    func: getSP500Comparison
  },
  {
    name: 'getIndustryComparison',
    type: 'function',
    function: {
      name: 'getIndustryComparison',
      description: 'Institutional-style industry comparison: industry snapshot (median P/E, growth, ROE, debt), stock vs industry, and verdict (Premium justified / Fair / Premium stretched / Discount). Use when user asks if a stock is cheap/expensive vs peers or about valuation relative to industry.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol (e.g., AAPL)' }
        },
        required: ['symbol']
      }
    },
    func: async ({ symbol }: { symbol: string }) => {
      const result = await runIndustryComparison(symbol);
      return { ...result, report: formatIndustryComparison(result) };
    }
  },
  {
    name: 'getDailyCheck',
    type: 'function',
    function: {
      name: 'getDailyCheck',
      description: 'Daily re-rating monitor: thesis status (Improving/Stable/Deteriorating), what changed today, risk alerts. Uses EPS/revenue revisions, price vs fundamentals divergence, valuation compression, and risk signals. Best for tracking portfolio positions daily.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol (e.g., AAPL)' }
        },
        required: ['symbol']
      }
    },
    func: async ({ symbol }: { symbol: string }) => {
      const result = await runDailyCheck(symbol);
      return { ...result, report: formatDailyCheck(result) };
    }
  },
  // ✅ Native web search tool
  {
    type: 'web_search',
    name: 'web-search',
    description: 'Search the web for recent information about a stock or topic'
  }
];
