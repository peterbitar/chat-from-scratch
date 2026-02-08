import axios from 'axios';
import OpenAI from 'openai';

const FMP_API_KEY = process.env.FMP_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const FMP_BASE = 'https://financialmodelingprep.com/stable';

export interface NewsDigest {
  date: string;
  marketOverview: MarketOverview;
  stockNews: StockNewsItem[];
  sectorNews: SectorNewsItem[];
  economicNews: EconomicNewsItem[];
  keyTakeaways: string[];
}

interface MarketOverview {
  sp500: { price: number; change: number; changePercent: number };
  nasdaq: { price: number; change: number; changePercent: number };
  topGainers: Array<{ symbol: string; price: number; changePercent: number }>;
  topLosers: Array<{ symbol: string; price: number; changePercent: number }>;
}

interface StockNewsItem {
  symbol: string;
  title: string;
  sentiment: 'Positive' | 'Negative' | 'Neutral';
  importance: 'High' | 'Medium' | 'Low';
}

interface SectorNewsItem {
  sector: string;
  title: string;
  sentiment: 'Positive' | 'Negative' | 'Neutral';
}

interface EconomicNewsItem {
  event: string;
  impact: string;
  sentiment: 'Positive' | 'Negative' | 'Neutral';
}

export async function generateDailyNewsDigest(watchlistSymbols: string[] = []): Promise<NewsDigest> {
  try {
    console.log('📰 Gathering news from FMP...');

    // Fetch market data and news in parallel
    const [marketData, stockNewsData, generalNews] = await Promise.all([
      fetchMarketOverview(),
      watchlistSymbols.length > 0 ? fetchStockNews(watchlistSymbols) : Promise.resolve([]),
      fetchGeneralNews()
    ]);

    // Parse economic and sector news from general news
    const sectorNews = parseSectorNews(generalNews);
    const economicNews = parseEconomicNews(generalNews);

    // Generate key takeaways
    const keyTakeaways = generateTakeaways(marketData, stockNewsData, sectorNews, economicNews);

    return {
      date: new Date().toISOString().split('T')[0],
      marketOverview: marketData,
      stockNews: stockNewsData,
      sectorNews,
      economicNews,
      keyTakeaways
    };
  } catch (err: any) {
    console.error('Error generating digest:', err.message);
    throw err;
  }
}

async function fetchMarketOverview(): Promise<MarketOverview> {
  try {
    const [sp500, nasdaq] = await Promise.all([
      axios.get(`${FMP_BASE}/quote?symbol=%5EGSPC&apikey=${FMP_API_KEY}`),
      axios.get(`${FMP_BASE}/quote?symbol=%5EIXIC&apikey=${FMP_API_KEY}`)
    ]);

    const sp500Data = sp500.data[0] || {};
    const nasdaqData = nasdaq.data[0] || {};

    return {
      sp500: {
        price: sp500Data.price || 0,
        change: sp500Data.change || 0,
        changePercent: sp500Data.changePercent || 0
      },
      nasdaq: {
        price: nasdaqData.price || 0,
        change: nasdaqData.change || 0,
        changePercent: nasdaqData.changePercent || 0
      },
      topGainers: [],
      topLosers: []
    };
  } catch (err) {
    console.warn('Could not fetch market overview');
    return {
      sp500: { price: 0, change: 0, changePercent: 0 },
      nasdaq: { price: 0, change: 0, changePercent: 0 },
      topGainers: [],
      topLosers: []
    };
  }
}

async function fetchStockNews(symbols: string[]): Promise<StockNewsItem[]> {
  try {
    const newsPromises = symbols.map(async (symbol) => {
      try {
        const res = await axios.get(`${FMP_BASE}/news/stock-latest?symbol=${symbol}&limit=2&apikey=${FMP_API_KEY}`);
        const articles = res.data || [];

        if (articles.length === 0) return null;

        const article = articles[0];
        const sentiment = classifySentiment(article.title);
        const importance = classifyImportance(article.title);

        return {
          symbol,
          title: article.title || '',
          sentiment,
          importance
        };
      } catch (err) {
        return null;
      }
    });

    const results = await Promise.all(newsPromises);
    return results.filter((item): item is StockNewsItem => item !== null);
  } catch (err) {
    console.warn('Could not fetch stock news');
    return [];
  }
}

async function fetchGeneralNews(): Promise<any[]> {
  try {
    const res = await axios.get(`${FMP_BASE}/news/general-latest?limit=10&apikey=${FMP_API_KEY}`);
    return res.data || [];
  } catch (err) {
    return [];
  }
}

function parseSectorNews(news: any[]): SectorNewsItem[] {
  const sectors = ['Tech', 'Finance', 'Healthcare', 'Energy', 'Retail', 'Manufacturing'];
  const sectorNews: SectorNewsItem[] = [];

  news.forEach((article) => {
    const title = article.title || '';
    sectors.forEach((sector) => {
      if (title.toLowerCase().includes(sector.toLowerCase())) {
        sectorNews.push({
          sector,
          title: title.substring(0, 80),
          sentiment: classifySentiment(title)
        });
      }
    });
  });

  return sectorNews.slice(0, 3); // Top 3 sectors
}

function parseEconomicNews(news: any[]): EconomicNewsItem[] {
  const economicEvents = ['Fed', 'inflation', 'unemployment', 'GDP', 'earnings', 'tariff', 'interest rate'];
  const economicNews: EconomicNewsItem[] = [];

  news.forEach((article) => {
    const title = article.title || '';
    economicEvents.forEach((event) => {
      if (title.toLowerCase().includes(event.toLowerCase())) {
        economicNews.push({
          event,
          impact: title.substring(0, 100),
          sentiment: classifySentiment(title)
        });
      }
    });
  });

  return economicNews.slice(0, 3); // Top 3 economic news
}

function classifySentiment(text: string): 'Positive' | 'Negative' | 'Neutral' {
  const positiveWords = ['beat', 'surge', 'rally', 'gain', 'profit', 'growth', 'strong', 'boost', 'rise'];
  const negativeWords = ['fall', 'crash', 'decline', 'loss', 'weak', 'drop', 'down', 'cuts', 'warns'];

  const lowerText = text.toLowerCase();
  const posCount = positiveWords.filter((word) => lowerText.includes(word)).length;
  const negCount = negativeWords.filter((word) => lowerText.includes(word)).length;

  if (posCount > negCount) return 'Positive';
  if (negCount > posCount) return 'Negative';
  return 'Neutral';
}

function classifyImportance(text: string): 'High' | 'Medium' | 'Low' {
  const highImpactWords = ['earnings', 'acquisition', 'bankruptcy', 'ceo', 'scandal', 'record', 'ipo'];
  const lowerText = text.toLowerCase();

  const hasHighImpact = highImpactWords.some((word) => lowerText.includes(word));
  return hasHighImpact ? 'High' : 'Medium';
}

function generateTakeaways(
  market: MarketOverview,
  stocks: StockNewsItem[],
  sectors: SectorNewsItem[],
  economic: EconomicNewsItem[]
): string[] {
  const takeaways: string[] = [];

  // Market takeaway
  const sp500Direction = market.sp500.changePercent > 0 ? 'up' : 'down';
  takeaways.push(`📈 S&P 500 is ${sp500Direction} ${Math.abs(market.sp500.changePercent).toFixed(2)}%`);

  // Stock takeaway
  if (stocks.length > 0) {
    const positiveStocks = stocks.filter((s) => s.sentiment === 'Positive').length;
    takeaways.push(`📊 ${positiveStocks}/${stocks.length} of your stocks have positive news`);
  }

  // Sector takeaway
  if (sectors.length > 0) {
    const topSector = sectors[0];
    takeaways.push(`🏭 ${topSector.sector} sector is trending ${topSector.sentiment.toLowerCase()}`);
  }

  // Economic takeaway
  if (economic.length > 0) {
    takeaways.push(`💰 Key economic event: ${economic[0].event}`);
  }

  return takeaways;
}
