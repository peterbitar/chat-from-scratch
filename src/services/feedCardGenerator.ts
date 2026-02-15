/**
 * Feed Card Generator — LLM-generated cards from structured data.
 *
 * No hardcoded templates. The LLM writes title and content based on the info.
 */

import OpenAI from 'openai';
import type { DailyCheckResult } from './dailyCheck';
import type { PrimaryCard } from './primaryCardBuilder';
import type { EarningsRecap } from './earningsRecap';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

export interface GeneratedCard {
  title: string;
  content: string;
}

function buildDataPayload(result: DailyCheckResult, card: PrimaryCard): string {
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
  return JSON.stringify(payload, null, 2);
}

/**
 * Generate a feed card (title, content) from DailyCheckResult + PrimaryCard using the LLM.
 * Content uses sections: **Here's what happened**, **Why investors care**, optional **Context**.
 */
export async function generateFeedCard(
  result: DailyCheckResult,
  card: PrimaryCard
): Promise<GeneratedCard | null> {
  if (!OPENAI_KEY) return null;

  const data = buildDataPayload(result, card);
  const prompt = `You are writing a short feed card for retail investors. Use ONLY the structured data below. No invented facts.

Output format (strict):
1. title: One headline, e.g. "PYPL — Analysts Are More Optimistic"
2. content: Markdown with these sections (only include sections that apply):
   - **Here's what happened** — One or two sentences with the key numbers from the data.
   - **Why investors care** — One sentence on what it means.
   - **Key metric** — The main number (e.g. "+12.5% EPS (7d)") if relevant.
   - **Context** — Only if earnings recap exists: one line about the last earnings report.
   - **Risk note** — Only if risk alerts or confidence note apply.

Write in plain English. Calm, no jargon. Be specific: use the actual numbers from the data (EPS %, price %, revenue %, etc). Do not repeat the same info in multiple sections.

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

  const prompt = `You are writing a short earnings recap card for retail investors. Use ONLY the structured data below.

Output format (strict):
1. title: One headline, e.g. "TSLA — Q1 FY2026 Earnings Recap"
2. content: Markdown with these sections (include only what applies):
   - **Here's what happened** — One or two sentences with the key numbers (revenue, EPS, beat/miss).
   - **Why investors care** — One sentence on what it means.
   - **Market reaction** — Only if marketReaction1to3DaysPct exists.

Write in plain English. Calm, no jargon. Be specific: use the actual numbers from the data.

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
