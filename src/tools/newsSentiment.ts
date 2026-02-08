import axios from 'axios';

export interface Headline {
  title: string;
  url: string;
  sentiment: 'Positive' | 'Neutral' | 'Negative';
}

export async function getNewsSentiment(symbol: string): Promise<Headline[]> {
  // Step 1: Search for recent news
  const query = `${symbol} stock site:finance.yahoo.com OR site:marketwatch.com`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;

  const headers = {
    'User-Agent': 'Mozilla/5.0'
  };

  try {
    const { data } = await axios.get(url, { headers });
    // For now, mock results — we'll replace this later with real parsing or API

    const mockHeadlines: Headline[] = [
      {
        title: `AMD launches new AI chip to compete with Nvidia`,
        url: `https://finance.yahoo.com/...`,
        sentiment: 'Positive'
      },
      {
        title: `AMD faces challenges in data center growth`,
        url: `https://www.marketwatch.com/...`,
        sentiment: 'Negative'
      }
    ];

    return mockHeadlines;
  } catch (err) {
    console.error(err);
    return [];
  }
}
