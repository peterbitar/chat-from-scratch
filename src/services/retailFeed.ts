/**
 * Retail B2C Feed — Calm, clear, 60-second clarity.
 *
 * Cards are LLM-generated from structured data. No hardcoded templates.
 * North star: "Does this help a normal investor feel calmer and smarter in 60 seconds?"
 */

import { runDailyCheck } from './dailyCheck';
import { buildPrimaryCard } from './primaryCardBuilder';
import { generateFeedCard } from './feedCardGenerator';
import type { DailyCheckResult } from './dailyCheck';

export interface RetailCard {
  symbol: string;
  headline: string;
  title: string;
  content: string;
}

export interface RetailFeedResult {
  marketMood: string;
  cards: RetailCard[];
  allStable: boolean;
  timestamp: string;
}

const MAX_RETAIL_CARDS = 3;

/** One sentence. Answers: Is this normal? Unusual? Improving? */
function buildMarketMood(results: DailyCheckResult[], allStable: boolean): string {
  if (allStable || results.length === 0) {
    return 'Nothing unusual today; your holdings look stable.';
  }
  const improving = results.filter((r) => r.thesisStatus === 'Improving').length;
  const deteriorating = results.filter((r) => r.thesisStatus === 'Deteriorating').length;
  if (deteriorating > 0 && improving === 0) {
    return 'A few names are seeing more risk signals; worth a quick look.';
  }
  if (improving > 0 && deteriorating === 0) {
    return 'Earnings expectations are improving across your holdings.';
  }
  if (improving > 0 && deteriorating > 0) {
    return 'Mixed picture: some holdings show tension between price and analyst expectations.';
  }
  return 'A few notable moves in your holdings; nothing alarming.';
}

/** Minimal fallback when LLM fails — uses raw data only, no invented copy. */
function fallbackCard(symbol: string, summary: string, keyMetric: string): RetailCard {
  const title = `${symbol} — Update`;
  const content = `**Here's what happened** — ${summary}\n\n**Key metric** — ${keyMetric}`;
  return { symbol, headline: title, title, content };
}

/**
 * Generate the retail B2C feed: Market Mood + up to 3 LLM-generated cards.
 * No hardcoded templates; cards are generated from structured data.
 */
export async function generateRetailFeed(symbols: string[]): Promise<RetailFeedResult> {
  const results = await Promise.all(symbols.map((s) => runDailyCheck(s)));
  const cards: RetailCard[] = [];

  for (const result of results) {
    if (cards.length >= MAX_RETAIL_CARDS) break;
    const primary = buildPrimaryCard(result);
    if (!primary) continue;

    const generated = await generateFeedCard(result, primary);
    if (generated) {
      cards.push({
        symbol: result.symbol,
        headline: generated.title,
        title: generated.title,
        content: generated.content
      });
    } else {
      cards.push(fallbackCard(result.symbol, primary.summary, primary.keyMetric));
    }
  }

  return {
    marketMood: buildMarketMood(results, cards.length === 0),
    cards: cards.slice(0, MAX_RETAIL_CARDS),
    allStable: cards.length === 0,
    timestamp: new Date().toISOString()
  };
}
