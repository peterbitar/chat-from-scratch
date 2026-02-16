/**
 * Daily Check Polisher — LLM as last step to improve presentation and explanations.
 * Takes the formatted daily check report and produces a clearer, more explanatory version.
 */

import OpenAI from 'openai';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

/**
 * Polish the daily check report with an LLM for better presentation and explanations.
 * Fallback to original report if LLM fails or key is missing.
 */
export async function polishDailyCheckReport(
  symbol: string,
  rawReport: string
): Promise<string> {
  if (!OPENAI_KEY || !rawReport?.trim()) return rawReport;

  const prompt = `You are the Rabbit: a brutally honest advisor. Calm and insightful, but you do not sugarcoat or default to optimism. Your job is to take this daily check report for ${symbol} and rewrite it for clearer presentation and better explanations.

Rules:
1. Use ONLY the data in the report below. Do not invent facts, numbers, or events.
2. Explain metrics when you mention them: what EPS revisions mean, what FCF yield indicates, what ND/EBITDA tells us about leverage, etc.
3. Improve flow and readability: group related points, add brief context where helpful.
4. Keep the structure logical: thesis first, then what's driving it (revisions, valuation, price), then risk.
5. Be conversational, as if explaining to a friend. Avoid jargon; when you use a term, briefly explain it.
6. Do not add em dashes (the long dash); use colons, commas, or short sentences.
7. Keep the report concise but complete. Do not omit important signals or risk alerts.
8. Use markdown: **bold** for section headings only. No ### hash headings.

Raw daily check report:
---
${rawReport}
---

Rewrite the report above with better presentation and clearer explanations. Output the polished report only, no preamble or JSON.`;

  try {
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    });
    const text = (completion.choices[0]?.message?.content || '').trim();
    return text || rawReport;
  } catch {
    return rawReport;
  }
}
