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
    // Get real news from FMP Starter - NEW /stable/ endpoint
    const response = await axios.get(
      `${BASE}/news/stock-latest?symbol=${symbol.toUpperCase()}&limit=5&apikey=${FMP_API_KEY}`
    );

    const articles = response.data || [];

    if (!Array.isArray(articles) || articles.length === 0) {
      return [{
        title: `No recent news found for ${symbol}.`,
        url: '',
        sentiment: 'Neutral'
      }];
    }

    // Use OpenAI to classify sentiment on real headlines
    const headlines = articles
      .slice(0, 5)
      .map((article: any) => ({
        title: article.title || '',
        url: article.link || article.url || '',
        originalSentiment: article.sentiment // FMP sometimes includes sentiment
      }))
      .filter((h: any) => h.title);

    // Batch classify sentiment if FMP didn't provide it
    const needsSentimentAnalysis = headlines.some((h: any) => !h.originalSentiment);

    if (needsSentimentAnalysis && OPENAI_KEY && headlines.length > 0) {
      const openai = new OpenAI({ apiKey: OPENAI_KEY });
      const titles = headlines.map((h: any) => h.title).join('\n');

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Classify each headline as Positive, Negative, or Neutral. Reply with only the sentiment for each headline, one per line.'
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
      title: `Error fetching news sentiment: ${err.message}`,
      url: '',
      sentiment: 'Neutral'
    }];
  }
}
