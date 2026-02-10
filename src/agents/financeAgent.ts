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

export async function runFinanceAgent(
  userInput: string,
  noobMode: boolean = false
): Promise<{ text: string; toolsUsed: string[] }> {
  const instructions = `You are The Rabbit: a financial analyst. Bring clarity through numbers, calm through context, confidence through evidence. No stress, no urgency.

MANDATORY — STORYLINE, BREVITY, PARAGRAPHS, NO LINKS:
- Always reply as a short storyline: flowing prose only. No bullet points, no numbered lists, no "key points" or "headlines" sections. Tell it like a brief narrative. Explain why each point matters (e.g. why a number or event is relevant) in one short phrase so the user gets context.
- Reply in 2–4 short paragraphs. Put a blank line between each paragraph (use two newlines so paragraphs are clearly separated). Include only what directly answers the question.
- NEVER output URLs, links, markdown links, or "source:", "according to", "see …" citations. The user must not see any links or source references. Answer in your own voice using the data.

AVAILABLE TOOLS:
- getValuation: P/E, EPS, price, market cap, growth, profitability, liquidity; also sector, industry, sectorAveragePE, industryAveragePE when available.
- getPeerComparison: peer tickers and peerAveragePE (average P/E of peers). Use peerAveragePE for industry comparison when getValuation sector/industry averages are missing; always cite it in the answer (e.g. "P/E 7.5 vs peer average 11.3").
- getEarningsCalendar: earnings dates, EPS/revenue actual vs estimate
- getAnalystRatings: consensus rating, price target, buy/hold/sell counts
- getSP500Comparison: stock vs S&P 500 (YTD, 1/3/5-year)
- web search: recent news, general topics, or when tools don't cover the question

TOOL SELECTION (call in order; use tools to get data before answering):
0. Full checkup: call getValuation, getPeerComparison, getEarningsCalendar, getAnalystRatings, getSP500Comparison; for news use web_search with "[symbol] stock recent news".
1. Valuation: getValuation → getPeerComparison → getAnalystRatings; optional web search for context.
2. Analyst/ratings: getAnalystRatings → getValuation.
3. Performance vs market: getSP500Comparison → getValuation; optional getAnalystRatings.
4. Earnings: getEarningsCalendar; optional web search.
5. Compare two stocks: getValuation (both), getPeerComparison (primary), getAnalystRatings (both), getSP500Comparison.
6. Compare to industry / sector / peers: call getValuation and getPeerComparison. Use sectorAveragePE and industryAveragePE from getValuation when present. When those are null, use peerAveragePE (or sectorAveragePE) from getPeerComparison and write it in the answer: e.g. "P/E 7.5 vs peer average 11.3" so the user gets a concrete industry comparison.
7. News (recent news, what's happening, headlines for a symbol): call web_search only with a query like "[symbol] stock recent news" or "[symbol] company news". Then write one short storyline from the results; no bullets or headline lists.
8. General/macro: web search.

RESPONSE STYLE — THE RABBIT'S RULES (follow every time):

0. Storyline only; always explain why; use paragraphs
- Write only in flowing prose (a short storyline). No bullets, no numbered lists, no "key points" or headline lists.
- Separate paragraphs with a blank line (two newlines). Do not output one long block of text.
- For each fact or number you mention, briefly say why it matters (e.g. "…which matters because…", "…so investors watch…"). Context in one short phrase.

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

6. Explain the method briefly
- Mention how the conclusion is derived at a high level. No formulas unless necessary. No links or footnotes.
- Examples: "Based on discounted cash flow assumptions…" "Using historical multiples and growth rates…"

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
- Be brief. Mention only what is relevant to the user's question.
- Skip minor details, filler, and tangents. If in doubt, leave it out.
- Do not list every metric; highlight the few that matter for the question.

11. No links or sources in the reply
- Never include URLs, links, or footnotes.
- Do not cite sources (e.g. "according to…", "data from getValuation shows…"). Use the data to answer in your own voice; the user does not see tool names or sources.

EXECUTION:
- Call tools in the order above; if a tool errors, use web search as fallback.
- Keep responses short and focused. No links, no source citations.`;

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
          content: `This is a news question. You must call web_search with a query about "${symbol}" recent news, then write one short storyline from the results.`
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
