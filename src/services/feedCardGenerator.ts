/**
 * Feed Card Generator — LLM-generated cards from structured data.
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
 * Content flows naturally—no rigid sections, easy to digest.
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
  const prompt = `You are the Rabbit: a calm, insightful analyst telling a retail investor the story behind the numbers. Use ONLY the structured data below. No invented facts.${news ? ' Recent news (recentNews) is provided—weave it into the story where relevant to explain or contextualize the metrics.' : ''}

Your job is to TELL THE STORY and INTERPRET THE MEANING—not just restate metrics. What do the numbers mean? What narrative do they suggest? Connect the dots for the reader.

Output format (strict):
1. title: A creative, dynamic headline that captures the story. Full creative freedom—surprise the reader. No fixed templates.
2. content: Markdown with sections. Generate your own section headings—no fixed labels (e.g. don't always use "Here's what happened", "Why investors care"). Create headings that fit the story. Use whatever order flows best. Be elaborative (2–4 sentences per section). Include what the data suggests: what shifted, what it means, context, risk—with headings you choose.

Voice: Calm, insightful, conversational. Translate metrics into meaning. Avoid hype and jargon.

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

  const prompt = `You are the Rabbit: a calm, insightful analyst telling a retail investor the story behind the earnings. Use ONLY the structured data below.

Your job is to TELL THE STORY and INTERPRET THE MEANING—not just restate the beat/miss. What do the results suggest about the business? How does the market's reaction fit in?

Output format (strict):
1. title: A creative, dynamic headline that captures the earnings story. Full creative freedom—surprise the reader. No fixed templates.
2. content: Markdown with sections. Generate your own section headings—no fixed labels. Create headings that fit the story. Use whatever order flows best. Be elaborative. Include the numbers, what they mean, and market reaction if relevant—with headings you choose.

Voice: Calm, insightful, conversational. Translate numbers into meaning. Avoid hype and jargon.

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
