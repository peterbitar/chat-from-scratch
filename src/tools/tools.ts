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
import { generateStockCheckup } from '../agents/stockCheckup';
import { formatStockCheckup } from '../formatters/checkupFormatter';
import { getEarningsRecap } from '../services/earningsRecap';
import { formatEarningsRecap } from '../formatters/earningsRecapFormatter';
import { generateStockSnapshot } from '../services/stockSnapshot';

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
  {
    name: 'getStockCheckup',
    type: 'function',
    function: {
      name: 'getStockCheckup',
      description: 'Full stock checkup: health score, valuation, profitability, liquidity, analyst signals, S&P 500 comparison, news, risk radar. Same data as /api/checkup. Use for "deep dive", "full analysis", "checkup", or broad questions about a stock.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol (e.g., AAPL)' }
        },
        required: ['symbol']
      }
    },
    func: async ({ symbol }: { symbol: string }) => {
      const checkup = await generateStockCheckup(symbol);
      return { report: formatStockCheckup(checkup), symbol: checkup.symbol, timestamp: checkup.timestamp, layers: checkup.layers } as Record<string, unknown>;
    }
  },
  {
    name: 'getEarningsRecap',
    type: 'function',
    function: {
      name: 'getEarningsRecap',
      description: 'Last quarter earnings recap: revenue/EPS vs estimates, guidance, margins, market reaction. Same data as earningsRecap service. Use when user asks about "last earnings", "earnings report", "how did they do last quarter", or post-earnings analysis.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol (e.g., AAPL)' }
        },
        required: ['symbol']
      }
    },
    func: async ({ symbol }: { symbol: string }) => {
      const recap = await getEarningsRecap(symbol);
      if (!recap) return { symbol: symbol.toUpperCase(), recap: null, report: 'No recent earnings data available.' };
      return { recap, report: formatEarningsRecap(recap) };
    }
  },
  {
    name: 'getStockSnapshot',
    type: 'function',
    function: {
      name: 'getStockSnapshot',
      description: 'Quick 3-metric snapshot: vs S&P 500 (3Y), valuation vs sector peers, fundamentals strength. Same data as stockSnapshot service. Use for "quick take", "snapshot", "at a glance", or when user wants a brief overview without full checkup.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol (e.g., AAPL)' }
        },
        required: ['symbol']
      }
    },
    func: async ({ symbol }: { symbol: string }) => {
      const snapshot = await generateStockSnapshot(symbol);
      const vs = snapshot.vsSp500;
      const val = snapshot.valuation;
      const fund = snapshot.fundamentals;
      const report =
        `${snapshot.symbol} Snapshot\n\n` +
        `vs S&P 500 (3Y): ${vs?.label ?? 'N/A'} (stock ${vs?.stockReturn3Y != null ? vs.stockReturn3Y.toFixed(1) + '%' : 'N/A'}, S&P 500 ${vs?.sp500Return3Y != null ? vs.sp500Return3Y.toFixed(1) + '%' : 'N/A'})\n` +
        `Valuation: ${val?.label ?? 'N/A'} (P/E ${val?.stockPE ?? 'N/A'}, sector peers median ${val?.sectorPeersMedianPE ?? 'N/A'})\n` +
        `Fundamentals: ${fund?.label ?? 'N/A'} (${fund?.basedOn ?? 'N/A'})`;
      return { ...snapshot, report };
    }
  },
  // ✅ Native web search tool
  {
    type: 'web_search',
    name: 'web-search',
    description: 'Search the web for recent information about a stock or topic'
  }
];
