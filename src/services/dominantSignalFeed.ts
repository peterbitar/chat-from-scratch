/**
 * Dominant Signal Feed — One card per stock (or thematic group), top signals only.
 *
 * - Same-type clustering: 2+ stocks with ESTIMATE_SHIFT → "🔥 Estimate Shock Day"
 * - Mega-cap severity cap: 100 is rare
 * - If none → "All holdings stable"
 */

import { SignalCategory } from './dominantSignalEngine';
import { runDailyCheck } from './dailyCheck';
import { buildPrimaryCard } from './primaryCardBuilder';
import type { PrimaryCard } from './primaryCardBuilder';
import type { EarningsRecapWithRelevance } from './earningsRecap';

export interface ThemedCardItem {
  symbol: string;
  keyMetric: string;
  severity: number;
  earningsRecap?: EarningsRecapWithRelevance;
}

export interface ThemedCard {
  type: 'themed';
  theme: string;
  category: SignalCategory;
  items: ThemedCardItem[];
  tone: 'Bullish' | 'Bearish' | 'Neutral';
  maxSeverity: number;
}

export type FeedCard = PrimaryCard | ThemedCard;

export function isThemedCard(c: FeedCard): c is ThemedCard {
  return (c as ThemedCard).type === 'themed';
}

export interface DominantSignalFeedResult {
  cards: FeedCard[];
  allStable: boolean;
  timestamp: string;
}

const MAX_CARDS = 5;

const THEME_BY_CATEGORY: Partial<Record<SignalCategory, string>> = {
  [SignalCategory.ESTIMATE_SHIFT]: '🔥 Estimate Shock Day',
  [SignalCategory.DIVERGENCE]: '⚡ Price vs Fundamentals Divergence',
  [SignalCategory.FORCED_REPRICING]: '🔻 Forced Repricing',
  [SignalCategory.RISK_CHANGE]: '⚠️ Risk Cluster'
};

/**
 * Group cards by category. If 2+ share a category with a theme, create ThemedCard.
 */
function clusterCards(cards: PrimaryCard[]): FeedCard[] {
  const byCategory = new Map<SignalCategory, PrimaryCard[]>();
  for (const c of cards) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }

  const out: FeedCard[] = [];
  for (const [category, list] of byCategory) {
    const theme = THEME_BY_CATEGORY[category];
    if (theme && list.length >= 2) {
      const items: ThemedCardItem[] = list.map((c) => ({
        symbol: c.symbol,
        keyMetric: c.keyMetric,
        severity: c.severity,
        ...(c.earningsRecap && { earningsRecap: c.earningsRecap })
      }));
      const maxSeverity = Math.max(...list.map((c) => c.severity));
      const dominantTone = list[0]!.tone;
      out.push({
        type: 'themed',
        theme,
        category,
        items: items.sort((a, b) => b.severity - a.severity),
        tone: dominantTone,
        maxSeverity
      });
    } else {
      out.push(...list);
    }
  }

  out.sort((a, b) => {
    const sevA = isThemedCard(a) ? a.maxSeverity : a.severity;
    const sevB = isThemedCard(b) ? b.maxSeverity : b.severity;
    return sevB - sevA;
  });
  return out.slice(0, MAX_CARDS);
}

/**
 * Generate the dominant signal feed for a list of symbols.
 * Same-type signals cluster into thematic cards.
 */
export async function generateDominantSignalFeed(symbols: string[]): Promise<DominantSignalFeedResult> {
  const results = await Promise.all(symbols.map((s) => runDailyCheck(s)));
  const cards: PrimaryCard[] = [];

  for (const result of results) {
    const card = buildPrimaryCard(result);
    if (card) cards.push(card);
  }

  const clustered = clusterCards(cards);

  return {
    cards: clustered,
    allStable: clustered.length === 0,
    timestamp: new Date().toISOString()
  };
}
