import { getValuation } from './valuationExtractor';
import { getNewsSentiment } from './newsSentiment';
import { getPeerComparison } from './peerComparison';

export const tools = [
  {
    name: 'getValuation',
    description: 'Fetches valuation metrics for a stock: price, PE, PEG, EPS, etc.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol, e.g., AAPL or TSLA'
        }
      },
      required: ['symbol']
    },
    func: async ({ symbol }: { symbol: string }) => {
      return await getValuation(symbol);
    }
  },
  {
    name: 'getNewsSentiment',
    description: 'Gets recent news headlines and tags each with sentiment for the given stock symbol.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol (e.g., AMD, AAPL)'
        }
      },
      required: ['symbol']
    },
    func: async ({ symbol }: { symbol: string }) => {
      return await getNewsSentiment(symbol);
    }
  },
  {
    name: 'getPeerComparison',
    description: 'Compares a stock to its peers and gives industry average P/E and PEG ratios.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol (e.g., AMD, AAPL)'
        }
      },
      required: ['symbol']
    },
    func: async ({ symbol }: { symbol: string }) => {
      return await getPeerComparison(symbol);
    }
  }
];
