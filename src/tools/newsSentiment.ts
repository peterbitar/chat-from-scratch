import axios from 'axios';
import OpenAI from 'openai';

const FMP_API_KEY = process.env.FMP_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

export interface Headline {
  title: string;
  url: string;
  sentiment: 'Positive' | 'Neutral' | 'Negative';
}

export async function getNewsSentiment({ symbol }: { symbol: string }): Promise<Headline[]> {
  try {
    // Try stock-specific endpoint first
    let articles = [];
    try {
      const response = await axios.get(
        `${BASE}/news/stock-latest?symbol=${symbol.toUpperCase()}&limit=10&apikey=${FMP_API_KEY}`
      );
      articles = (response.data || []).filter((article: any) => {
        // Filter to only include articles that mention the symbol
        const title = (article.title || '').toUpperCase();
        const text = (article.text || '').toUpperCase();
        return title.includes(symbol.toUpperCase()) || text.includes(symbol.toUpperCase());
      });
    } catch (err) {
      console.warn(`Could not fetch stock-specific news for ${symbol}, using general news`);
    }

    // If no symbol-specific articles, fall back to general news
    if (articles.length === 0) {
      try {
        const generalRes = await axios.get(`${BASE}/news/general-latest?limit=15&apikey=${FMP_API_KEY}`);
        const generalNews = generalRes.data || [];
        // Try to find articles mentioning the symbol
        articles = generalNews.filter((article: any) => {
          const title = (article.title || '').toUpperCase();
          const text = (article.text || '').toUpperCase();
          return title.includes(symbol.toUpperCase()) || text.includes(symbol.toUpperCase());
        });

        // If still no match, use first few general articles
        if (articles.length === 0) {
          articles = generalNews.slice(0, 5);
        }
      } catch (err) {
        console.warn(`Could not fetch general news for ${symbol}`);
      }
    }

    if (!Array.isArray(articles) || articles.length === 0) {
      return [{
        title: `No recent news found for ${symbol}.`,
        url: '',
        sentiment: 'Neutral'
      }];
    }

    // Use OpenAI to classify sentiment on headlines
    const headlines = articles
      .slice(0, 5)
      .map((article: any) => ({
        title: article.title || '',
        url: article.link || article.url || article.website || '',
        originalSentiment: article.sentiment // FMP sometimes includes sentiment
      }))
      .filter((h: any) => h.title);

    // Batch classify sentiment if FMP didn't provide it
    const needsSentimentAnalysis = headlines.some((h: any) => !h.originalSentiment);

    if (needsSentimentAnalysis && OPENAI_KEY && headlines.length > 0) {
      const openai = new OpenAI({ apiKey: OPENAI_KEY });
      const titles = headlines.map((h: any) => h.title).join('\n');

      const completion = await openai.chat.completions.create({
        model: 'gpt-4-mini',
        messages: [
          {
            role: 'system',
            content: `Classify each headline as Positive, Negative, or Neutral in context of stock ${symbol}. Reply with only the sentiment for each headline, one per line.`
          },
          {
            role: 'user',
            content: titles
          }
        ]
      });

      const sentiments = (completion.choices[0].message?.content || '')
        .split('\n')
        .map((line: string) => {
          const match = line.match(/(Positive|Negative|Neutral)/i);
          return (match?.[1] || 'Neutral') as 'Positive' | 'Negative' | 'Neutral';
        });

      return headlines.map((h: any, i: number) => ({
        title: h.title,
        url: h.url,
        sentiment: h.originalSentiment || sentiments[i] || 'Neutral'
      }));
    }

    // Use FMP's provided sentiment or default to Neutral
    return headlines.map((h: any) => ({
      title: h.title,
      url: h.url,
      sentiment: h.originalSentiment ? (h.originalSentiment.toLowerCase().includes('positive') ? 'Positive' :
                                         h.originalSentiment.toLowerCase().includes('negative') ? 'Negative' : 'Neutral') : 'Neutral'
    }));
  } catch (err: any) {
    return [{
      title: `No news available for ${symbol}`,
      url: '',
      sentiment: 'Neutral'
    }];
  }
}
