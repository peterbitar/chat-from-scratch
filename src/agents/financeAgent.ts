import OpenAI from 'openai';
import dotenv from 'dotenv';
import { tools } from '../tools/tools';

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Build Responses API tools: web_search + our function tools (exclude getNewsUpdate — news uses web_search only, no FMP).
const apiTools = [
  { type: 'web_search_preview' as const },
  ...tools
    .filter((t): t is typeof t & { function: object; func: (args: unknown) => unknown } => 'function' in t && !!t.function && (t as { name?: string }).name !== 'getNewsUpdate')
    .map((t) => ({
      type: 'function' as const,
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
      strict: false as const
    }))
];

/** Detect if the user is asking for news/headlines about a stock. */
function isNewsQuestion(input: string): boolean {
  const lower = input.toLowerCase().trim();
  const newsPhrases = ['news', 'headlines', "what's happening", 'whats happening', 'recent', 'latest', 'updates', 'current events'];
  const hasNewsIntent = newsPhrases.some((p) => lower.includes(p));
  if (!hasNewsIntent) return false;
  // Optional: require something that looks like a symbol or "for X"
  const hasSymbolHint = /\b[A-Z]{1,5}\b/.test(input) || /\b(for|about)\s+\w+/.test(lower);
  return hasSymbolHint || hasNewsIntent; // treat "recent news" as news even without symbol
}

/** Extract a likely ticker from the question (e.g. "news for PYPL" -> PYPL). */
function extractSymbolFromNewsQuestion(input: string): string | null {
  const match = input.match(/\b(for|about)\s+([A-Z]{1,5})\b/i) || input.match(/\b([A-Z]{2,5})\b/);
  return match ? (match[2] || match[1]).toUpperCase() : null;
}

/** Response tier: Tier 3 = ultra-short (25–50w), Tier 2 = deep dive (200–350w), Tier 1 = default (60–120w). */
function detectResponseTier(input: string): 'tier1' | 'tier2' | 'tier3' {
  const lower = input.toLowerCase().trim();
  // Tier 3 — Ultra Short: alerts, pulse, risk notification, earnings reaction
  const tier3Phrases = [
    'alert', 'pulse', 'risk notification', 'earnings reaction', 'quick take', 'brief', 'one sentence',
    'tl;dr', 'tldr', 'summarize in', 'in a sentence', 'at a glance', 'just the headline'
  ];
  if (tier3Phrases.some((p) => lower.includes(p))) return 'tier3';
  // Tier 2 — Deep Dive: only when user explicitly asks for breakdown, strategy, explanation
  const tier2Phrases = [
    'breakdown', 'strategy', 'explain in detail', 'full explanation', 'structural analysis',
    'detailed analysis', 'walk me through', 'step by step', 'how does it work', 'deep dive'
  ];
  if (tier2Phrases.some((p) => lower.includes(p))) return 'tier2';
  return 'tier1';
}

function getTierLengthInstructions(tier: 'tier1' | 'tier2' | 'tier3'): string {
  switch (tier) {
    case 'tier3':
      return `LENGTH (Tier 3 — Ultra Short): 25–50 words. One or two sentences. The one-line story only.`;
    case 'tier2':
      return `LENGTH (Tier 2 — Deep Dive): 200–350 words. Only when user explicitly asked for breakdown, strategy, or step-by-step. Tell it as a short story with a clear arc; no long lists.`;
    default:
      return `LENGTH (Tier 1 — Default): 60–120 words. Short and scannable. One clear story in 2–3 short paragraphs. Put a blank line between paragraphs.`;
  }
}

export async function runFinanceAgent(
  userInput: string,
  noobMode: boolean = false
): Promise<{ text: string; toolsUsed: string[] }> {
  const tier = detectResponseTier(userInput);
  const lengthInstructions = getTierLengthInstructions(tier);

  const instructions = `You are The Rabbit: a financial analyst. Short, clear, story-driven answers. Bring clarity through numbers and calm through context. No stress, no urgency.

MANDATORY — LENGTH TIER (follow strictly):
${lengthInstructions}

MANDATORY — STORY-DRIVEN, SIMPLE, NO LINKS:
- Lead with the story: in one sentence, what’s going on and why it matters. Then explain simply in plain language. No bullet points, no numbered lists, no "key points" sections.
- Use a narrative: "Here’s what happened… So the picture is…" Keep it explanatory—for each number or fact, one short "why it matters" so the user gets the story.
- NEVER output URLs, links, markdown links, or "source:", "according to", "see …" citations. Answer in your own voice using the data.

AVAILABLE TOOLS (prefer service-backed when question matches):
- getStockCheckup: Full checkup (same as /api/checkup). Health score, valuation, profitability, liquidity, analyst signals, S&P 500, news, risk. Use for "deep dive", "full analysis", "checkup", broad questions.
- getStockSnapshot: Quick 3-metric snapshot (same as stockSnapshot service). Vs S&P 500, valuation vs sector, fundamentals. Use for "quick take", "at a glance", brief overview.
- getIndustryComparison: Industry comparison (same as /api/industry-comparison). Verdict: Premium justified / Fair / Premium stretched / Discount.
- getDailyCheck: Daily re-rating monitor (same as /api/daily-check). Thesis status, what changed today, risk alerts.
- getEarningsRecap: Last quarter earnings (same as earningsRecap service). Revenue/EPS vs estimates, guidance, margins, market reaction.
- getEarningsCalendar: Upcoming/past earnings dates, EPS/revenue actual vs estimate.
- getValuation: P/E, EPS, price, market cap, growth, profitability, liquidity; sector, industry, sectorAveragePE, industryAveragePE.
- getPeerComparison: peer tickers and peerAveragePE. Use when sector/industry averages missing; cite "P/E 7.5 vs peer average 11.3".
- getAnalystRatings: consensus rating, price target, buy/hold/sell counts.
- getSP500Comparison: stock vs S&P 500 (YTD, 1/3/5-year).
- web search: recent news, general topics, or when tools don't cover the question.

TOOL SELECTION (prefer service-backed for matching intents; use tools to get data before answering):
0. Full checkup / deep dive / broad analysis: getStockCheckup (single call, same data as API).
1. Quick overview / snapshot / at a glance: getStockSnapshot.
2. Last quarter earnings / "how did they do": getEarningsRecap. Upcoming earnings dates: getEarningsCalendar.
3. Cheap/expensive vs industry or peers: getIndustryComparison.
4. Daily monitoring / thesis status / what changed: getDailyCheck.
5. Valuation only: getValuation → getPeerComparison → getAnalystRatings; optional web search.
6. Analyst/ratings: getAnalystRatings → getValuation.
7. Performance vs market: getSP500Comparison → getValuation; optional getAnalystRatings.
8. Compare two stocks: getValuation (both), getPeerComparison (primary), getAnalystRatings (both), getSP500Comparison.
9. Compare to industry / peers (granular): getValuation and getPeerComparison; use sectorAveragePE, industryAveragePE, or peerAveragePE in answer.
10. News (recent news, headlines): web_search with "[symbol] stock recent news". One short storyline from results; no bullets.
11. General/macro: web search.

RESPONSE STYLE — THE RABBIT'S RULES (follow every time):

0. Story first; simple and explanatory; short paragraphs
- Lead with the one-sentence story, then explain in plain language. No bullets, no numbered lists, no "key points" sections.
- Separate paragraphs with a blank line. Keep paragraphs short (2–4 sentences max).
- For each fact or number, one short "why it matters" so the story is clear. Prefer simple words over jargon.
- Stay within the word count. Tier 1: 60–120 words. Tier 2: 200–350 words. Tier 3: 25–50 words.

1. Evidence before emotion
- Use numbers, ratios, ranges, and historical comparisons whenever available.
- Prefer facts over opinions. Present data as information, not signals.
- Good: "Historically, this range has occurred X% of the time." "Over the last N years…" "Compared to its own history, this is…"
- Numbers are grounding. Use them to stabilize, not excite.

2. Scientific framing, not predictions
- Use probabilistic language only; never certainty.
- Frame outcomes as scenarios, not forecasts. Emphasize distributions, not single-point outcomes.
- Good: "This increases the probability of…" "The data suggests a higher likelihood…" "Within a normal historical range…"
- Never say: "This means the stock will…" "A crash is coming." "Guaranteed upside."

3. Use numbers calmly
- Never highlight numbers dramatically. No exclamation marks on metrics. No shock-value statistics.
- Bad: "EPS collapsed by 40%!!!"
- Good: "EPS declined by roughly 40%; similar declines have occurred X times in the past Y years."

4. Contextualize every metric
- No standalone numbers. Anchor every figure to: historical averages, industry norms, company baselines, or long-term trends.
- Template: "X is currently Y, compared to its long-term average of Z."

5. Prefer ranges over point estimates
- Use bands, intervals, and tolerances. Highlight uncertainty explicitly.
- Examples: "Estimated range: 8–12%." "Valuation multiples typically fall between A and B."

6. Explain simply when needed
- If the story depends on "how we know," one short phrase is enough. No formulas or footnotes.
- Example: "The numbers suggest…" "Compared to history…"

7. Statistical humility
- Acknowledge data limitations: short time windows, regime changes, one-off events.
- Examples: "Sample size is limited." "This period includes unusual conditions." "Results are sensitive to assumptions."

8. Calm interpretation layer
- After presenting numbers, translate into plain meaning. Emphasize what does not change. Reduce emotional impact.
- Example: "Even with this decline, the company remains within its normal profitability range."

9. No calls to action
- Never conclude with "buy", "sell", or "act now." Never imply timing pressure. Let the user decide, informed and calm.
- Closing tone: "This is information to consider, not a signal to react."

10. Only the important stuff
- Be brief. One main story; only the details that support it. Skip filler and tangents.
- Do not list every metric. Pick the one or two that drive the story and explain them simply.

11. No links or sources in the reply
- Never include URLs, links, or footnotes.
- Do not cite sources (e.g. "according to…", "data from getValuation shows…"). Use the data to answer in your own voice; the user does not see tool names or sources.

EXECUTION:
- Call tools in the order above; if a tool errors, use web search as fallback.
- Respect the length tier. No links, no source citations.`;

  let input: OpenAI.Responses.ResponseInput = [{ role: 'user', content: userInput, type: 'message' }];
  const toolsUsed: string[] = [];
  let turns = 0;
  const MAX_TURNS = 10;

  while (turns++ < MAX_TURNS) {
    const response = await openai.responses.create({
      model: 'gpt-4o',
      instructions,
      input,
      tools: apiTools,
      tool_choice: 'auto'
    });

    // Track which tools were used
    for (const item of response.output as { type?: string; name?: string }[]) {
      if (item.type === 'function_call') toolsUsed.push(item.name!);
      if (item.type === 'web_search_call') toolsUsed.push('web_search');
    }

    // Add model output to input for next turn
    input = [...input, ...response.output];

    // Execute any function calls and append outputs
    const functionCalls = response.output.filter((item) => (item as { type?: string }).type === 'function_call');
    if (functionCalls.length === 0) {
      const newsQuestion = isNewsQuestion(userInput);
      const hasWeb = toolsUsed.includes('web_search');
      if (newsQuestion && !hasWeb) {
        const symbol = extractSymbolFromNewsQuestion(userInput) ?? 'the stock';
        input.push({
          type: 'message',
          role: 'user',
          content: `This is a news question. Call web_search for "${symbol}" recent news, then reply with one short story (60–120 words): what happened and why it matters. No bullets, no links.`
        });
        continue;
      }
      let finalText = response.output_text ?? '';
      finalText = stripLinksAndSources(finalText);
      finalText = normalizeParagraphBreaks(finalText);
      if (noobMode) {
        finalText = simplifyFinanceResponse(finalText);
      }
      return { text: finalText, toolsUsed: [...new Set(toolsUsed)] };
    }

    // Execute all function calls in parallel.
    const results = await Promise.all(
      (functionCalls as { call_id: string; name: string; arguments: string }[]).map(async (call) => {
        const tool = tools.find((t) => (t as { name?: string }).name === call.name) as { func?: (args: unknown) => unknown };
        if (!tool?.func) {
          return {
            call_id: call.call_id,
            output: JSON.stringify({ error: `Tool "${call.name}" not found` })
          };
        }
        try {
          const args = JSON.parse(call.arguments || '{}');
          const result = await tool.func(args);
          return {
            call_id: call.call_id,
            output: JSON.stringify(result)
          };
        } catch (err: any) {
          return {
            call_id: call.call_id,
            output: JSON.stringify({ error: `Tool execution failed: ${err.message}` })
          };
        }
      })
    );

    // Add all results to input
    for (const { call_id, output } of results) {
      input.push({
        type: 'function_call_output',
        call_id,
        output
      });
    }
  }

  // Max turns exceeded
  return { text: 'Max tool calls exceeded. Please refine your question.', toolsUsed: [...new Set(toolsUsed)] };
}

/**
 * Ensure paragraph breaks for chat: collapse 3+ newlines to \n\n.
 * If the model returns one long block (no \n\n), insert \n\n every 2–3 sentences so chat shows separate paragraphs.
 */
function normalizeParagraphBreaks(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let out = text.replace(/\n{3,}/g, '\n\n').trim();
  if (out.includes('\n\n')) return out;
  if (out.length < 200) return out;
  const sentences = out.split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1) return out;
  const paragraphs: string[] = [];
  const perParagraph = Math.max(1, Math.ceil(sentences.length / 3));
  for (let i = 0; i < sentences.length; i += perParagraph) {
    paragraphs.push(sentences.slice(i, i + perParagraph).join(' '));
  }
  return paragraphs.join('\n\n');
}

/**
 * Remove all URLs and source citations from the reply. User must not see links or sources.
 */
function stripLinksAndSources(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let out = text;
  // Replace markdown links [label](url) with just the label (no URL)
  out = out.replace(/\[([^\]]*)\]\(https?:\/\/[^)]+\)/g, '$1');
  // Remove any remaining raw URLs
  out = out.replace(/https?:\/\/[^\s\]\)"]+/g, '');
  // Remove "Source:", "According to ...", "See ...", "From ..." citation lines/phrases
  out = out.replace(/\n?\s*(Source|Sources|According to|See|From|Cited from|Reference[s]?):[^\n]*(?=\n|$)/gi, '\n');
  out = out.replace(/\b(according to|see|from)\s+[^.]*\./gi, '');
  // Remove parenthetical source refs e.g. (tipranks.com), (economictimes.indiatimes.com)
  out = out.replace(/\s*\([a-z0-9][-a-z0-9.]*\.[a-z]{2,}(?:\/[^)]*)?\)\s*/gi, ' ');
  // Remove standalone "Highlighted Headlines" / "Headlines:" bullet blocks that were only link lists (optional cleanup)
  out = out.replace(/\n\s*\*\*Highlighted Headlines\*\*:\s*\n([\s\S]*?)(?=\n\n|\nOverall|$)/gi, '\n');
  // Collapse multiple newlines and trim
  out = out.replace(/\n{3,}/g, '\n\n').replace(/\s+$/gm, '').trim();
  return out;
}

/**
 * Simplifies financial jargon for NOOB mode
 * Replaces complex terms with plain English
 */
function simplifyFinanceResponse(text: string): string {
  let simplified = text;

  // Replace complex terms with plain English
  const replacements: Record<string, string> = {
    'P/E ratio': 'Price-to-Earnings (how much you pay per dollar of profit)',
    'P/E Ratio': 'Price-to-Earnings (how much you pay per dollar of profit)',
    'market cap': 'company value',
    'Market Cap': 'Company Value',
    'EPS': 'earnings per share',
    'free cash flow': 'actual cash left over after bills',
    'Free Cash Flow': 'Actual Cash Left Over After Bills',
    'valuation': 'price fairness',
    'consensus': 'agreement',
    'sentiment': 'mood',
    'outperform': 'beating the market',
    'underperform': 'losing to the market',
    'multiple': 'price multiplier',
    'dividend': 'cash payment to shareholders',
    'volatility': 'price swings',
    'bullish': 'expecting prices to go up',
    'bearish': 'expecting prices to go down',
    'YoY': 'year over year',
    'hedge': 'protect your investment',
    'sector': 'industry',
    'analyst': 'financial expert',
    'trailing': 'looking back at',
    'forward': 'looking ahead to',
    'catalyst': 'something that could make the stock move'
  };

  // Apply replacements
  for (const [complex, simple] of Object.entries(replacements)) {
    const regex = new RegExp(`\\b${complex}\\b`, 'gi');
    simplified = simplified.replace(regex, simple);
  }

  // Add calm closing (Rabbit-style: no pressure, inform don't urge)
  if (!simplified.toLowerCase().includes('information to consider')) {
    simplified += '\n\nThis is information to consider, not a signal to react.';
  }

  // Add quick glossary for key terms if present
  const mentionedTerms = [];
  if (simplified.toLowerCase().includes('overvalued')) {
    mentionedTerms.push('📌 Overvalued = Stock costs more than what the company is worth');
  }
  if (simplified.toLowerCase().includes('undervalued')) {
    mentionedTerms.push('📌 Undervalued = Stock costs less than what the company is worth');
  }

  if (mentionedTerms.length > 0) {
    simplified += '\n\n' + mentionedTerms.join('\n');
  }

  return simplified;
}
