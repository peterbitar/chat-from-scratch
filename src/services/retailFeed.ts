/**
 * Retail B2C Feed — Calm, clear, 60-second clarity.
 *
 * North star: "Does this help a normal investor feel calmer and smarter in 60 seconds?"
 * - Market Mood: one sentence
 * - What Changed: max 3 cards
 * - Each card: headline, plain explanation, what it means, risk (if needed)
 * - No jargon. No sensationalism. Slightly reassuring.
 */

import { SignalCategory } from './dominantSignalEngine';
import { generateDominantSignalFeed, isThemedCard } from './dominantSignalFeed';
import type { FeedCard, ThemedCardItem } from './dominantSignalFeed';
import type { PrimaryCard } from './primaryCardBuilder';
import { earningsRecapContextLine } from '../formatters/earningsRecapFormatter';

export interface RetailCard {
  symbol: string;
  headline: string;
  explanation: string;
  whatItMeans: string;
  riskNote?: string;
  /** One line only: "This follows yesterday's earnings call." */
  contextLine?: string;
  /** Card-style output: { title, content } matching /api/card format */
  title: string;
  content: string;
}

/** Build card-style content from RetailCard fields (Here's what happened / Why investors care / Risk note / Context). */
function buildCardContent(c: { explanation: string; whatItMeans: string; riskNote?: string; contextLine?: string }): string {
  const parts: string[] = [];
  parts.push(`**Here's what happened** — ${c.explanation}`);
  parts.push(`**Why investors care** — ${c.whatItMeans}`);
  if (c.riskNote) parts.push(`**Risk note** — ${c.riskNote}`);
  if (c.contextLine) parts.push(`**Context** — ${c.contextLine}`);
  return parts.join('\n\n');
}

export interface RetailFeedResult {
  marketMood: string;
  cards: RetailCard[];
  allStable: boolean;
  timestamp: string;
}

const MAX_RETAIL_CARDS = 3;

/** One sentence. Answers: Is this normal? Unusual? Improving? */
function buildMarketMood(cards: FeedCard[], allStable: boolean): string {
  if (allStable || cards.length === 0) {
    return 'Nothing unusual today; your holdings look stable.';
  }

  const categories = cards.flatMap((c) =>
    isThemedCard(c) ? (c.items.length > 0 ? [c.category] : []) : [(c as PrimaryCard).category]
  );
  const hasEstimateUp =
    categories.some((cat) => cat === SignalCategory.ESTIMATE_SHIFT) &&
    cards.some((c) => (isThemedCard(c) ? c.tone === 'Bullish' : (c as PrimaryCard).tone === 'Bullish'));
  const hasDivergence = categories.includes(SignalCategory.DIVERGENCE);
  const hasRisk = categories.includes(SignalCategory.RISK_CHANGE);

  if (hasRisk && cards.length > 0) {
    return 'A few names are seeing more risk signals; worth a quick look.';
  }
  if (hasDivergence && hasEstimateUp) {
    return 'Earnings expectations are improving in several names, but the market has not fully repriced yet.';
  }
  if (hasDivergence) {
    return 'Mixed picture: some holdings show tension between price and analyst expectations.';
  }
  if (hasEstimateUp) {
    return 'Earnings expectations are improving across your holdings.';
  }

  return 'A few notable moves in your holdings; nothing alarming.';
}

/** Convert a single PrimaryCard to retail-friendly copy. Calm, no jargon. */
function primaryToRetail(c: PrimaryCard): RetailCard {
  const symbol = c.symbol;
  const contextLine =
    c.earningsRecap?.shouldShow === true ? earningsRecapContextLine(c.earningsRecap.recap) : undefined;

  switch (c.category) {
    case SignalCategory.ESTIMATE_SHIFT: {
      const revUp = c.tone === 'Bullish';
      const headline = revUp
        ? `${symbol} — Analysts Are More Optimistic`
        : `${symbol} — Analysts Trimmed Expectations`;
      const explanation = revUp
        ? `Analysts raised earnings expectations for ${symbol} this week.`
        : `Analysts lowered earnings expectations for ${symbol} recently.`;
      const whatItMeans = revUp
        ? 'The Street is more positive on the company’s outlook than it was a week ago.'
        : 'The Street is a bit less positive than it was recently.';
      const riskNote = c.confidenceNote
        ? 'If new data disappoints, expectations could move back down.'
        : undefined;
      const card = { symbol, headline, explanation, whatItMeans, riskNote, contextLine };
      return { ...card, title: headline, content: buildCardContent(card) };
    }

    case SignalCategory.DIVERGENCE: {
      const headline = `${symbol} — Investors Not Fully Convinced`;
      const explanation = c.summary;
      const whatItMeans =
        'Earnings expectations improved, but the stock price didn’t follow. The market hasn’t fully accepted the improved outlook yet.';
      const riskNote = 'If expectations reverse, this signal fades.';
      const card = { symbol, headline, explanation, whatItMeans, riskNote, contextLine };
      return { ...card, title: headline, content: buildCardContent(card) };
    }

    case SignalCategory.FORCED_REPRICING: {
      const headline = `${symbol} — Price Moved Without a Clear Earnings Story`;
      const explanation = c.summary;
      const whatItMeans =
        'The move may reflect other factors (sector sentiment, flows, or news) rather than a change in earnings expectations.';
      const riskNote = 'Worth watching; no need to act unless your plan changes.';
      const card = { symbol, headline, explanation, whatItMeans, riskNote, contextLine };
      return { ...card, title: headline, content: buildCardContent(card) };
    }

    case SignalCategory.RISK_CHANGE: {
      const headline = `${symbol} — Risk Flags Are Up`;
      const explanation = c.summary;
      const whatItMeans = 'Several risk factors have appeared; it’s a good time to review this holding.';
      const riskNote = 'Consider whether your position size still matches your risk tolerance.';
      const card = { symbol, headline, explanation, whatItMeans, riskNote, contextLine };
      return { ...card, title: headline, content: buildCardContent(card) };
    }

    case SignalCategory.VALUATION_SHIFT: {
      const headline = `${symbol} — Valuation Shift`;
      const explanation = c.summary;
      const whatItMeans = 'How the market is valuing the company has shifted.';
      const card = { symbol, headline, explanation, whatItMeans, contextLine };
      return { ...card, title: headline, content: buildCardContent(card) };
    }

    default: {
      const headline = `${symbol} — Something Changed`;
      const explanation = c.summary;
      const whatItMeans = 'Worth a quick look when you have a moment.';
      const card = { symbol, headline, explanation, whatItMeans, contextLine };
      return { ...card, title: headline, content: buildCardContent(card) };
    }
  }
}

/** Expand themed card into one retail card per symbol (headline per symbol). Retail-friendly wording. */
function themedToRetailCards(theme: string, items: ThemedCardItem[], category: SignalCategory): RetailCard[] {
  const themeLabel =
    category === SignalCategory.ESTIMATE_SHIFT ? 'Analysts More Optimistic' :
    category === SignalCategory.DIVERGENCE ? 'Investors Not Fully Convinced' :
    theme.replace(/^[^\s]+\s/, '').replace(' Day', '');
  return items.slice(0, 3).map((item) => {
    const contextLine =
      item.earningsRecap?.shouldShow === true ? earningsRecapContextLine(item.earningsRecap.recap) : undefined;
    const headline = `${item.symbol} — ${themeLabel}`;
    const explanation =
      category === SignalCategory.ESTIMATE_SHIFT
        ? `Analysts raised earnings expectations for ${item.symbol} (${item.keyMetric}).`
        : category === SignalCategory.DIVERGENCE
          ? `Earnings expectations improved for ${item.symbol}, but the stock price fell.`
          : `${item.symbol}: ${item.keyMetric}.`;
    const whatItMeans =
      category === SignalCategory.ESTIMATE_SHIFT
        ? 'The Street is more positive on these names than it was recently.'
        : 'The market has not fully repriced the improved outlook yet.';
    const riskNote = category === SignalCategory.DIVERGENCE ? 'If expectations reverse, the signal fades.' : undefined;
    const card = { symbol: item.symbol, headline, explanation, whatItMeans, riskNote, contextLine };
    return { ...card, title: headline, content: buildCardContent(card) };
  });
}

/** Convert feed cards to retail format: max 3 cards, plain language. */
function feedToRetailCards(cards: FeedCard[]): RetailCard[] {
  const retail: RetailCard[] = [];
  const take = MAX_RETAIL_CARDS;

  for (const c of cards) {
    if (retail.length >= take) break;
    if (isThemedCard(c)) {
      const batch = themedToRetailCards(c.theme, c.items, c.category);
      for (const r of batch) {
        if (retail.length >= take) break;
        retail.push(r);
      }
    } else {
      retail.push(primaryToRetail(c as PrimaryCard));
    }
  }

  return retail.slice(0, take);
}

/**
 * Generate the retail B2C feed: Market Mood + up to 3 calm, clear cards.
 */
export async function generateRetailFeed(symbols: string[]): Promise<RetailFeedResult> {
  const feed = await generateDominantSignalFeed(symbols);
  const marketMood = buildMarketMood(feed.cards, feed.allStable);
  const cards = feedToRetailCards(feed.cards);

  return {
    marketMood,
    cards,
    allStable: feed.allStable,
    timestamp: feed.timestamp
  };
}
