/**
 * Finance NOOB Mode
 * Translates financial jargon into plain English
 * Adds explanations and simplifies concepts
 */

export interface NoobTranslation {
  simple: string;
  explanation: string;
  example?: string;
}

export const NOOB_GLOSSARY: Record<string, NoobTranslation> = {
  peRatio: {
    simple: 'Price-to-Earnings (how much you pay per dollar of profit)',
    explanation:
      'If a company earns $1 profit and its stock costs $20, the P/E is 20. Lower = cheaper, Higher = you expect more growth.',
    example: 'Apple P/E of 34 means you pay $34 for every $1 of profit. That\'s expensive unless you think profits will grow a lot.'
  },
  marketCap: {
    simple: 'Total value of the company',
    explanation: 'Stock price × number of shares = how much the whole company is "worth" in dollars.',
    example: 'If Apple stock is $278 and there are 15 billion shares, the company is worth ~$4.1 trillion.'
  },
  eps: {
    simple: 'Earnings Per Share (profit divided by shares)',
    explanation: 'How much profit the company made per share of stock you own.',
    example: 'If a company makes $7.49 per share and you own 10 shares, you "own" $74.90 of their profit.'
  },
  revenueGrowth: {
    simple: 'How fast the company is making more money',
    explanation: 'YoY = compared to last year. 15% growth means they make 15% more money than a year ago.',
    example: 'If a company had $100B in revenue last year and now has $115B, that\'s 15% growth.'
  },
  freeCashFlow: {
    simple: 'Actual cash the company has left after paying bills',
    explanation:
      'Not the same as profit! A company can be profitable but not have cash. Free cash flow = real money in the bank.',
    example: 'A software company might show $1B in "profit" but only has $200M in actual cash after paying employees & servers.'
  },
  valuation: {
    simple: 'Whether the stock price is fair, cheap, or expensive',
    explanation: 'Based on profits, growth, and risk. A cheap stock might be a bargain or a trap.',
    example: 'Stock A: P/E 15 (cheap) | Stock B: P/E 50 (expensive). But if B grows 2x faster, B might be the better deal.'
  },
  sp500: {
    simple: 'The average performance of 500 big US companies',
    explanation:
      'If your stock beats the S&P 500, you beat the market average. If it loses, the market beat you (even a boring index fund would do better).',
    example:
      'S&P 500 up 10% this year but your stock only up 5%? You\'re underperforming. Better off buying SPY (S&P 500 ETF).'
  },
  analystRating: {
    simple: 'What financial experts recommend',
    explanation: 'Buy = think it goes up, Hold = okay to own but not excited, Sell = think it will go down.',
    example: 'If 20 analysts say "Buy" and 3 say "Hold", consensus is strongly bullish.'
  },
  sentiment: {
    simple: 'Whether recent news about the stock is good, bad, or neutral',
    explanation:
      'Positive = headlines are encouraging. Negative = headlines are concerning. Neutral = no clear bias.',
    example: 'News: "Company beats earnings, raises guidance" = Positive | "CEO steps down" = Negative'
  },
  healthScore: {
    simple: 'Grade A-F for how financially healthy the company is',
    explanation: 'A = great shape (strong profits, growing, reasonable price) | F = in trouble (losing money or overpriced)',
    example: 'Health Score B = solid business, not perfect but you\'re not buying a dumpster fire.'
  },
  outperforming: {
    simple: 'Stock is doing better than the overall market',
    explanation:
      'If the S&P 500 is up 8% this year but your stock is up 12%, you\'re outperforming (beating the market).',
    example: 'Stock gaining 5% while market gains 10% = you\'re underperforming (lagging).'
  }
};

export function simplifyText(text: string, mode: 'noob' | 'normal' = 'normal'): string {
  if (mode === 'normal') return text;

  let simplified = text;

  // Replace common jargon
  simplified = simplified.replace(/P\/E ratio/gi, 'Price-to-Earnings');
  simplified = simplified.replace(/\bEPS\b/gi, 'earnings per share');
  simplified = simplified.replace(/market cap/gi, 'company value');
  simplified = simplified.replace(/free cash flow/gi, 'actual cash left over');
  simplified = simplified.replace(/valuation/gi, 'price fairness');
  simplified = simplified.replace(/consensus/gi, 'agreement');
  simplified = simplified.replace(/sentiment/gi, 'mood');
  simplified = simplified.replace(/outperform/gi, 'beating');
  simplified = simplified.replace(/underperform/gi, 'losing to');
  simplified = simplified.replace(/multiple/gi, 'multiplier');
  simplified = simplified.replace(/dividend/gi, 'cash payment to shareholders');
  simplified = simplified.replace(/volatility/gi, 'price swings');
  simplified = simplified.replace(/bullish/gi, 'expecting up');
  simplified = simplified.replace(/bearish/gi, 'expecting down');
  simplified = simplified.replace(/YoY/gi, 'year over year');
  simplified = simplified.replace(/hedge/gi, 'protect');

  return simplified;
}

export function getNoobExplanation(term: string): NoobTranslation | null {
  const key = Object.keys(NOOB_GLOSSARY).find((k) => k.toLowerCase() === term.toLowerCase());
  return key ? NOOB_GLOSSARY[key] : null;
}

export function formatNoobHealthScore(score: number): { label: string; explanation: string } {
  if (score >= 85)
    return {
      label: 'Excellent ⭐⭐⭐⭐⭐',
      explanation: 'This company is in great shape. Strong finances, growing, reasonably priced.'
    };
  if (score >= 70)
    return {
      label: 'Good ⭐⭐⭐⭐',
      explanation: 'Solid company. Nothing alarming, reasonable fundamentals.'
    };
  if (score >= 50)
    return {
      label: 'Okay ⭐⭐⭐',
      explanation: 'Mixed bag. Some good, some concerning. Do more research before buying.'
    };
  if (score >= 30)
    return {
      label: 'Risky ⭐⭐',
      explanation: 'Red flags present. Either overpriced or weak fundamentals. Higher risk.'
    };
  return {
    label: 'Avoid 🚩',
    explanation: 'Significant problems. Either lose money or very overpriced. Not for beginners.'
  };
}

export function formatNoobValuation(peRatio: number): { assessment: string; explanation: string } {
  if (peRatio <= 0)
    return {
      assessment: 'Unknown',
      explanation: 'Can\'t assess. Company might not be profitable.'
    };
  if (peRatio < 15)
    return {
      assessment: '💰 Cheap',
      explanation:
        'Stock is inexpensive relative to profits. Could be a bargain OR there\'s a reason it\'s cheap. Investigate why.'
    };
  if (peRatio < 25)
    return {
      assessment: '✅ Fair',
      explanation: 'Reasonable price. Not a steal, but not overpriced either. This is the sweet spot for most stocks.'
    };
  if (peRatio < 40)
    return {
      assessment: '📈 Expensive',
      explanation:
        'Stock is pricey. Market is betting on strong future growth. If growth slows, stock could fall. Higher risk.'
    };
  return {
    assessment: '🎢 Very Expensive',
    explanation:
      'Stock is VERY pricey. Market expects huge growth. Small disappointment = big stock drop. Very risky.'
  };
}

export function formatNoobSentiment(sentiment: string): { vibe: string; meaning: string } {
  if (sentiment === 'positive')
    return {
      vibe: '👍 Good Vibes',
      meaning: 'Recent news is encouraging. People are talking positively about this stock.'
    };
  if (sentiment === 'negative')
    return {
      vibe: '👎 Bad Vibes',
      meaning: 'Recent news is concerning. People are worried about this stock.'
    };
  return {
    vibe: '😐 No Clear Vibe',
    meaning: 'Mixed signals. Some good, some bad news. No strong sentiment either way.'
  };
}

export function formatNoobAnalystConsensus(rating: string): { recommendation: string; meaning: string } {
  const lower = rating.toLowerCase();

  if (lower.includes('strong buy') || lower.includes('buy'))
    return {
      recommendation: '🟢 Analysts Like It',
      meaning: 'Most experts think this will go up. But experts are wrong sometimes!'
    };
  if (lower.includes('hold'))
    return {
      recommendation: '🟡 Analysts Are Okay With It',
      meaning: 'Experts don\'t hate it, but they\'re not excited. Not a strong recommendation either way.'
    };
  if (lower.includes('sell'))
    return {
      recommendation: '🔴 Analysts Dislike It',
      meaning: 'Experts think this will go down or there are better options. Avoid unless you have strong conviction.'
    };
  return {
    recommendation: '❓ Unclear',
    meaning: 'Not enough data or mixed opinions from experts.'
  };
}

export function getNoobDreamOrDanger(valuation: string, sentiment: string, rating: string): {
  headline: string;
  meaning: string;
} {
  const val = valuation.toLowerCase();
  const sent = sentiment.toLowerCase();
  const rat = rating.toLowerCase();

  // Dream scenarios
  if ((val.includes('cheap') || val.includes('fair')) && (sent.includes('good') || sent.includes('positive')) && (rat.includes('buy') || rat.includes('like')))
    return {
      headline: '💎 Potential Goldmine',
      meaning: 'Cheap price + good news + experts agree. This could be a great entry point. (But do your own research!)'
    };

  // Danger scenarios
  if (val.includes('very expensive') && sent.includes('bad') && rat.includes('sell'))
    return {
      headline: '🚩 Avoid',
      meaning:
        'Overpriced + bad news + experts say sell. This is a value trap. Better options exist.'
    };

  if (val.includes('expensive') && sent.includes('bad'))
    return {
      headline: '⚠️ Risky',
      meaning: 'Expensive stock + negative sentiment. You\'re paying a premium while sentiment is turning negative. Bad combo.'
    };

  if ((val.includes('cheap') || val.includes('fair')) && (rat.includes('buy') || rat.includes('like')))
    return {
      headline: '📊 Reasonable Setup',
      meaning: 'Price is fair and experts like it. Decent opportunity, especially if sentiment improves.'
    };

  return {
    headline: '🤷 Mixed Signals',
    meaning: 'Not a clear buy or sell. Need more time or information to decide.'
  };
}
