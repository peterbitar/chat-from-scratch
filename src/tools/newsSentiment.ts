import axios from 'axios';
import OpenAI from 'openai';

const FMP_API_KEY = process.env.FMP_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

/** FMP free tier is typically 5 req/min. Space calls to stay under that. */
const FMP_RATE_LIMIT_MS = 13_000;
let lastFmpCallMs = 0;

/** In-memory cache: same symbol within 5 min reuses result to avoid duplicate FMP calls. */
const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;
const newsCache = new Map<string, { data: NewsUpdate; expires: number }>();

/** Run one FMP GET with rate limiting and one retry on 429. */
async function fmpGet(url: string, retried = false): Promise<{ data: any; status: number }> {
  const now = Date.now();
  const wait = Math.max(0, lastFmpCallMs + FMP_RATE_LIMIT_MS - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFmpCallMs = Date.now();
  const res = await axios.get(url, { validateStatus: () => true });
  if (res.status === 429 && !retried) {
    await new Promise((r) => setTimeout(r, 5000));
    lastFmpCallMs = Date.now();
    const retry = await axios.get(url, { validateStatus: () => true });
    return { data: retry.data, status: retry.status };
  }
  return { data: res.data, status: res.status };
}

export interface Headline {
  title: string;
  url: string;
  sentiment: 'Positive' | 'Neutral' | 'Negative';
  publishedDate?: string; // ISO date or "YYYY-MM-DD HH:mm:ss"
}

export interface NewsUpdate {
  symbol: string;
  storyline: string;
  headlines: Headline[];
  from?: string;
  to?: string;
}

/** Format date as YYYY-MM-DD for FMP API */
function formatDateYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DEFAULT_NEWS_LIMIT = 10;
const MAX_NEWS_LIMIT = 20;

export async function getNewsUpdate({
  symbol,
  from,
  to,
  limit = DEFAULT_NEWS_LIMIT
}: {
  symbol: string;
  /** Optional: only include news on or after this date (YYYY-MM-DD or ISO). Default: 7 days ago. */
  from?: string;
  /** Optional: only include news on or before this date (YYYY-MM-DD or ISO). Default: today. */
  to?: string;
  /** Optional: max number of headlines to return (1–20). Default: 10. */
  limit?: number;
}): Promise<NewsUpdate> {
  const sym = symbol.toUpperCase();
  const cacheKey = sym;

  try {
    const cached = newsCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.data;

    // Default: last 7 days. FMP Search Stock News API supports from/to, page, limit (max 250, page max 100).
    const now = new Date();
    const defaultTo = formatDateYMD(now);
    const defaultFrom = formatDateYMD(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
    const fromParam = from ?? defaultFrom;
    const toParam = to ?? defaultTo;

    let articles: any[] = [];
    try {
      const { data: raw, status } = await fmpGet(
        `${BASE}/news/stock?symbols=${sym}&from=${fromParam}&to=${toParam}&page=0&limit=20&apikey=${FMP_API_KEY}`
      );
      if (status !== 200) {
        console.warn(`[getNewsUpdate] Stock news fetch failed for ${sym}: ${status}`);
      } else if (!Array.isArray(raw)) {
        console.warn(`[getNewsUpdate] FMP /news/stock returned non-array for ${sym}:`, typeof raw);
      } else {
        articles = raw;
      }
    } catch (err: any) {
      console.warn(`[getNewsUpdate] Stock news fetch failed for ${sym}:`, err?.response?.status || err?.message);
    }

    // Fallback: stock-latest with date range when Search Stock News returns nothing
    if (articles.length === 0) {
      try {
        const { data: raw, status } = await fmpGet(
          `${BASE}/news/stock-latest?page=0&limit=20&from=${fromParam}&to=${toParam}&apikey=${FMP_API_KEY}`
        );
        if (status === 200 && Array.isArray(raw)) {
          articles = raw.filter((a: any) => (a.symbol ?? a.ticker ?? '').toString().toUpperCase() === sym);
          if (articles.length === 0) articles = raw;
        }
      } catch (e) {
        console.warn(`[getNewsUpdate] stock-latest fallback failed for ${sym}`);
      }
    }

    // Fallback: general news when still empty
    if (articles.length === 0) {
      try {
        const { data: generalNewsRaw, status } = await fmpGet(`${BASE}/news/general-latest?limit=15&apikey=${FMP_API_KEY}`);
        const generalNews = Array.isArray(generalNewsRaw) ? generalNewsRaw : [];
        if (status === 200 && generalNews.length > 0) {
          articles = generalNews.filter((article: any) => {
            const title = (article.title || '').toUpperCase();
            const text = (article.text || '').toUpperCase();
            return title.includes(sym) || text.includes(sym);
          });
          if (articles.length === 0) articles = generalNews.slice(0, 5);
        }
      } catch (e) {
        console.warn(`Could not fetch general news for ${sym}`);
      }
    }

    if (!Array.isArray(articles) || articles.length === 0) {
      const noNews: NewsUpdate = {
        symbol: sym,
        storyline: `No recent news found for ${sym} in this period.`,
        headlines: [{ title: `No recent news found for ${sym}.`, url: '', sentiment: 'Neutral' }],
        from: fromParam,
        to: toParam
      };
      newsCache.set(cacheKey, { data: noNews, expires: Date.now() + NEWS_CACHE_TTL_MS });
      return noNews;
    }

    const cap = Math.min(Math.max(1, limit ?? DEFAULT_NEWS_LIMIT), MAX_NEWS_LIMIT);
    const headlinesRaw = articles
      .slice(0, cap)
      .map((article: any) => ({
        title: article.title || '',
        url: article.link || article.url || article.website || '',
        originalSentiment: article.sentiment,
        publishedDate: article.publishedDate ?? article.published ?? article.date
      }))
      .filter((h: any) => h.title);

    // Classify sentiment if FMP didn't provide it
    let headlines: Headline[];
    const needsSentimentAnalysis = headlinesRaw.some((h: any) => !h.originalSentiment);

    if (needsSentimentAnalysis && OPENAI_KEY && headlinesRaw.length > 0) {
      try {
        const openai = new OpenAI({ apiKey: OPENAI_KEY });
        const titles = headlinesRaw.map((h: any) => h.title).join('\n');
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: `Classify each headline as Positive, Negative, or Neutral in context of stock ${sym}. Reply with only the sentiment for each headline, one per line.` },
            { role: 'user', content: titles }
          ]
        });
        const sentiments = (completion.choices[0].message?.content || '')
          .split('\n')
          .map((line: string) => {
            const match = line.match(/(Positive|Negative|Neutral)/i);
            return (match?.[1] || 'Neutral') as 'Positive' | 'Negative' | 'Neutral';
          });
        headlines = headlinesRaw.map((h: any, i: number) => ({
          title: h.title,
          url: h.url,
          sentiment: h.originalSentiment || sentiments[i] || 'Neutral',
          publishedDate: h.publishedDate
        }));
      } catch (openaiErr: any) {
        console.warn(`[getNewsUpdate] OpenAI sentiment failed for ${sym}, using Neutral:`, openaiErr?.message);
        headlines = headlinesRaw.map((h: any) => ({
          title: h.title,
          url: h.url,
          sentiment: (h.originalSentiment as 'Positive' | 'Negative' | 'Neutral') || 'Neutral',
          publishedDate: h.publishedDate
        }));
      }
    } else {
      headlines = headlinesRaw.map((h: any) => ({
        title: h.title,
        url: h.url,
        sentiment: h.originalSentiment ? (h.originalSentiment.toLowerCase().includes('positive') ? 'Positive' : h.originalSentiment.toLowerCase().includes('negative') ? 'Negative' : 'Neutral') : 'Neutral',
        publishedDate: h.publishedDate
      }));
    }

    // Generate storyline: what's happening with this stock (2-4 short paragraphs)
    let storyline = '';
    if (OPENAI_KEY && headlines.length > 0) {
      try {
        const openai = new OpenAI({ apiKey: OPENAI_KEY });
        const input = headlines.map((h, i) => `${i + 1}. [${h.sentiment}] ${h.title}`).join('\n');
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a financial news summarizer. Given a list of recent headlines for a stock (with sentiment), write a short storyline in 2-4 clear paragraphs: what is happening with this company, key themes (e.g. earnings, analyst views, legal/regulatory, competition), and overall narrative. Write in present tense, neutral tone. No bullet points—flowing prose only.`
            },
            {
              role: 'user',
              content: `Stock: ${sym}\nHeadlines:\n${input}`
            }
          ]
        });
        storyline = (completion.choices[0].message?.content || '').trim() || `Recent headlines for ${sym}: ${headlines.length} items. See headlines for details.`;
      } catch (err: any) {
        console.warn(`[getNewsUpdate] Storyline generation failed for ${sym}:`, err?.message);
        storyline = `Recent coverage of ${sym}: ${headlines.filter(h => h.sentiment === 'Positive').length} positive, ${headlines.filter(h => h.sentiment === 'Negative').length} negative, ${headlines.filter(h => h.sentiment === 'Neutral').length} neutral headlines in this period.`;
      }
    } else {
      const p = headlines.filter(h => h.sentiment === 'Positive').length;
      const n = headlines.filter(h => h.sentiment === 'Negative').length;
      const u = headlines.filter(h => h.sentiment === 'Neutral').length;
      storyline = `Recent coverage of ${sym}: ${p} positive, ${n} negative, ${u} neutral headlines. See headlines for details.`;
    }

    const result: NewsUpdate = { symbol: sym, storyline, headlines, from: fromParam, to: toParam };
    newsCache.set(cacheKey, { data: result, expires: Date.now() + NEWS_CACHE_TTL_MS });
    return result;
  } catch (err: any) {
    console.error(`[getNewsUpdate] Error for ${symbol}:`, err?.message || err);
    const fallback: NewsUpdate = {
      symbol: sym,
      storyline: `Unable to load news for ${sym}.`,
      headlines: [{ title: `No news available for ${symbol}`, url: '', sentiment: 'Neutral' }]
    };
    newsCache.set(cacheKey, { data: fallback, expires: Date.now() + NEWS_CACHE_TTL_MS });
    return fallback;
  }
}

/** Returns only the headlines array (for backward compatibility with checkup layer). */
export async function getNewsSentiment(
  params: Parameters<typeof getNewsUpdate>[0]
): Promise<Headline[]> {
  const out = await getNewsUpdate(params);
  return out.headlines;
}
