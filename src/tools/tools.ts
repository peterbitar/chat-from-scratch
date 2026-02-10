import { getValuation } from './valuationExtractor';
import { getPeerComparison } from './peerComparison';
import { getNewsUpdate } from './newsSentiment';
import { getEarningsCalendar } from './earningsCalendar';
import { getAnalystRatings } from './analystRatings';
import { getSP500Comparison } from './sp500Comparison';

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
  // ✅ Native web search tool
  {
    type: 'web_search',
    name: 'web-search',
    description: 'Search the web for recent information about a stock or topic'
  }
];
