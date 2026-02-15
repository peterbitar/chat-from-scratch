/**
 * Rabbit Story Engine — LLM interpretation of Daily Check structured output.
 *
 * Uses the institutional analyst prompt to produce a concise narrative
 * on whether the investment thesis has materially changed.
 *
 * News: Rabbit does NOT read news by default. News is only fetched when
 * a trigger fires (estimate shift, price shock, risk cluster, vol regime).
 */

import OpenAI from 'openai';
import type { DailyCheckResult } from './dailyCheck';
import { formatDailyCheck } from '../formatters/dailyCheckFormatter';
import { RABBIT_STORY_ENGINE_SYSTEM_PROMPT } from '../prompts/rabbitStoryEngine';
import { shouldTriggerNewsScan } from './newsTriggerDetection';
import { getNewsUpdate } from '../tools/newsSentiment';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

/**
 * Generate a Rabbit Story narrative from Daily Check structured output.
 * If a catalyst trigger fired, fetches news and adds a 📰 Catalyst Check section.
 */
export async function generateRabbitStory(result: DailyCheckResult): Promise<string> {
  if (!OPENAI_KEY) {
    return 'Rabbit Story requires OPENAI_API_KEY. Provide it in .env to enable LLM interpretation.';
  }

  const structuredInput = formatDailyCheck(result);
  const triggerResult = shouldTriggerNewsScan(result);
  let newsContext = '';
  if (triggerResult.triggered) {
    try {
      const news = await getNewsUpdate({
        symbol: result.symbol,
        limit: 12
      });
      newsContext = `

CATALYST SCAN TRIGGERED (${triggerResult.reasons.join('; ')})

Recent news for ${result.symbol}:
Storyline: ${news.storyline}

Headlines:
${news.headlines.slice(0, 8).map((h) => `• ${h.title} [${h.sentiment}]`).join('\n')}

You MUST add a "📰 Catalyst Check" section. Answer:
A. Did news explain the metric change?
B. Is this fundamental or sentiment-driven?
C. Is reaction proportional?
Do NOT summarize headlines. Be brief. If no clear catalyst, say so.`;
    } catch {
      newsContext = `

CATALYST SCAN TRIGGERED but news fetch failed. Add brief "📰 Catalyst Check" noting: trigger reasons (${triggerResult.reasons.join('; ')}), but news unavailable.`;
    }
  }

  const userContent = `Interpret the following Daily Check output for ${result.symbol}. Produce a Rabbit Story response following the required format.${newsContext}

${structuredInput}`;

  try {
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: RABBIT_STORY_ENGINE_SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ]
    });
    return (completion.choices[0]?.message?.content || '').trim() || 'No narrative generated.';
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return `Rabbit Story generation failed: ${message}`;
  }
}
