/**
 * Feed Card Generator: LLM-generated cards from structured data.
 *
 * No hardcoded templates. The LLM writes title and content based on the info.
 */

import OpenAI from 'openai';
import type { DailyCheckResult } from './dailyCheck';
import type { PrimaryCard } from './primaryCardBuilder';
import type { EarningsRecap } from './earningsRecap';
import { shouldTriggerNewsScan } from './newsTriggerDetection';
import { getNewsUpdate } from '../tools/newsSentiment';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

export interface GeneratedCard {
  title: string;
  content: string;
}

function buildDataPayload(
  result: DailyCheckResult,
  card: PrimaryCard,
  news?: { storyline: string; headlines: Array<{ title: string; sentiment: string }> }
): string {
  const payload: Record<string, unknown> = {
    symbol: result.symbol,
    thesisStatus: result.thesisStatus,
    setupType: result.setupType,
    positioning: result.positioning,
    signal: result.signal,
    revisions: result.revisions,
    price: result.price,
    valuation: result.valuation,
    riskAlerts: result.riskAlerts.map((a) => a.message),
    flowRisk: result.flowRisk.items.map((i) => i.label),
    structuralRisk: result.structuralRisk.ndToEbitda != null ? `ND/EBITDA ${result.structuralRisk.ndToEbitda.toFixed(1)}x` : null,
    dominantSignal: {
      category: card.category,
      keyMetric: card.keyMetric,
      summary: card.summary,
      tone: card.tone
    }
  };
  if (result.earningsRecap?.shouldShow) {
    payload.earningsRecap = {
      quarter: result.earningsRecap.recap.quarter,
      reportedDate: result.earningsRecap.recap.reportedDate,
      revenue: result.earningsRecap.recap.revenue,
      eps: result.earningsRecap.recap.eps,
      narrativeSummary: result.earningsRecap.recap.narrativeSummary
    };
  }
  if (news) {
    payload.recentNews = {
      storyline: news.storyline,
      headlines: news.headlines.slice(0, 8).map((h) => ({ title: h.title, sentiment: h.sentiment }))
    };
  }
  return JSON.stringify(payload, null, 2);
}

/**
 * Generate a feed card (title, content) from DailyCheckResult + PrimaryCard using the LLM.
 * Content flows naturally; no rigid sections, easy to digest.
 */
export async function generateFeedCard(
  result: DailyCheckResult,
  card: PrimaryCard
): Promise<GeneratedCard | null> {
  if (!OPENAI_KEY) return null;

  let news: { storyline: string; headlines: Array<{ title: string; sentiment: string }> } | undefined;
  const trigger = shouldTriggerNewsScan(result);
  if (trigger.triggered) {
    try {
      const newsUpdate = await getNewsUpdate({ symbol: result.symbol, limit: 12 });
      news = {
        storyline: newsUpdate.storyline,
        headlines: newsUpdate.headlines.map((h) => ({ title: h.title, sentiment: h.sentiment }))
      };
    } catch {
      // News fetch failed; proceed without it
    }
  }

  const data = buildDataPayload(result, card, news);
  const prompt = `You are the Rabbit: a brutally honest advisor. Calm and insightful, but you do not sugarcoat or default to optimism. If the data is bad (price down, estimates cut, risks), say so clearly. If the setup is weak or deteriorating, say so. Do not try to find silver linings when the story is negative. Tell the story behind the numbers. Use ONLY the structured data below. No invented facts.${news ? ' Recent news (recentNews) is provided. Weave it into the story where it helps explain or contextualize the metrics.' : ''}

Your job is to TELL THE STORY and INTERPRET THE MEANING, not just restate metrics. Explain as you go: when you mention a metric (e.g. EPS, revenue, price change), briefly say what it is and what a move in it means (e.g. "EPS is earnings per share; when analysts raise it, they're more optimistic about profitability"). If price dropped or rose, interpret it: what might investors be reacting to, or what does the move suggest? Connect the dots. Be conversational, as if you're explaining to a friend. Do not repeat the same point in different words across sections.

Output format (strict):
1. title: A creative, dynamic headline that captures the story. Full creative freedom. No fixed templates.
2. content: Markdown with sections. Section headings must be flexible and story-specific. Do not use generic headings like "What happened", "Here's what happened", or "Why investors care". Invent headings that fit this story (e.g. "Where the estimate moved", "What the market is pricing in", "The risk in the setup"). Use whatever order flows best. Be elaborative (2 to 4 sentences per section).

Voice: Calm, brutally honest. Call out bad news when the data shows it. Do not spin negatives into positives. When you cite a number, add what it is and what the move means. If price or estimates moved, give a short interpretation. Avoid hype and jargon. Do not use em dashes (the long dash) in the title or content; use colons, commas, or short sentences instead.

Structured data:
${data}

Respond with valid JSON only: {"title":"...","content":"..."}`;

  try {
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });
    const text = (completion.choices[0]?.message?.content || '').trim();
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim()) as { title?: string; content?: string };
    if (parsed?.title && parsed?.content) {
      return { title: parsed.title, content: parsed.content };
    }
    return null;
  } catch {
    return null;
  }
}

/** Generate earnings recap card from structured data (no hardcoded templates). */
export async function generateEarningsRecapCard(recap: EarningsRecap): Promise<GeneratedCard | null> {
  if (!OPENAI_KEY) return null;

  const data = JSON.stringify(
    {
      symbol: recap.symbol,
      quarter: recap.quarter,
      reportedDate: recap.reportedDate,
      revenue: recap.revenue,
      eps: recap.eps,
      narrativeSummary: recap.narrativeSummary,
      marketReaction1to3DaysPct: recap.marketReaction1to3DaysPct
    },
    null,
    2
  );

  const prompt = `You are the Rabbit: a brutally honest advisor. Calm and insightful, but you do not sugarcoat or default to optimism. If earnings missed, guidance was weak, or the stock sold off, say so clearly. Do not try to find silver linings when the story is negative. Tell the story behind the earnings. Use ONLY the structured data below.

Your job is to TELL THE STORY and INTERPRET THE MEANING, not just restate the beat/miss. Explain as you go: when you mention EPS, revenue, or a price move, briefly say what it is and what it means (e.g. "EPS is earnings per share; a beat means the company did better than analysts expected"). If the stock moved after earnings, interpret it: what might the market be pricing in, or what does the move suggest about sentiment? Be conversational, as if you're explaining to a friend. Do not repeat the same point in different words across sections.

Output format (strict):
1. title: A creative, dynamic headline that captures the earnings story. Full creative freedom. No fixed templates.
2. content: Markdown with sections. Section headings must be flexible and story-specific. Do not use generic headings like "What happened", "Here's what happened", or "Why investors care". Invent headings that fit this earnings story (e.g. "What the quarter showed", "How the street reacted", "Where the debate is"). Use whatever order flows best. Be elaborative.

Voice: Calm, brutally honest. Call out misses, weak guidance, or a bad reaction when the data shows it. Do not spin negatives into positives. When you cite a number, add what it is and what the move means. If the stock moved after earnings, give a short interpretation. Avoid hype and jargon. Do not use em dashes (the long dash) in the title or content; use colons, commas, or short sentences instead.

Structured data:
${data}

Respond with valid JSON only: {"title":"...","content":"..."}`;

  try {
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    });
    const text = (completion.choices[0]?.message?.content || '').trim();
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim()) as { title?: string; content?: string };
    if (parsed?.title && parsed?.content) {
      return { title: parsed.title, content: parsed.content };
    }
    return null;
  } catch {
    return null;
  }
}
