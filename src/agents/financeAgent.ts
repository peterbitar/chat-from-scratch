import OpenAI from 'openai';
import dotenv from 'dotenv';
import { tools } from '../tools/tools';

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Build Responses API tools: web_search + our function tools
const apiTools = [
  { type: 'web_search_preview' as const },
  ...tools
    .filter((t): t is typeof t & { function: object; func: (args: unknown) => unknown } => 'function' in t && !!t.function)
    .map((t) => ({
      type: 'function' as const,
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
      strict: false as const
    }))
];

export async function runFinanceAgent(
  userInput: string,
  noobMode: boolean = false
): Promise<{ text: string; toolsUsed: string[] }> {
  const instructions = `You are FinanceGPT, an expert financial analyst. Follow these rules strictly:

TOOL SELECTION STRATEGY:
1. For valuation questions ("Is X overvalued?", "What's the P/E?", "Fair value?"):
   - FIRST: Call getValuation to get current metrics (P/E, EPS, price, market cap)
   - SECOND: Call getPeerComparison to see how it compares to industry average
   - THIRD: Call getAnalystRatings to see what analysts think about valuation
   - OPTIONAL: Call getNewsSentiment for recent market sentiment

2. For analyst/rating questions ("What do analysts think?", "Should I buy?", "Price target?"):
   - FIRST: Call getAnalystRatings for consensus ratings and price targets
   - SECOND: Call getValuation to see if stock is trading near analyst targets
   - OPTIONAL: Web search for specific analyst reports or recent rating changes

3. For performance/market comparison ("Is X beating S&P 500?", "How does X compare to market?", "Should I buy this or SPY?"):
   - FIRST: Call getSP500Comparison to see YTD and historical performance vs benchmark
   - SECOND: Call getValuation to compare valuations
   - OPTIONAL: Call getAnalystRatings for consensus view

4. For earnings/timing questions ("When does X report earnings?", "Beat expectations?"):
   - FIRST: Call getEarningsCalendar to get earnings dates and historical EPS data
   - OPTIONAL: Web search for very recent earnings surprises not yet in the calendar

5. For competitive analysis ("How does X compare to Y?"):
   - Call getValuation for both stocks
   - Call getPeerComparison for the primary stock
   - Call getAnalystRatings for both stocks to compare analyst sentiment
   - Call getSP500Comparison to see which beats the market
   - Compare metrics directly

6. For news/sentiment questions ("What's the market saying about X?"):
   - FIRST: Call getNewsSentiment
   - OPTIONAL: Web search for additional recent breaking news

7. For topics unrelated to specific stocks (market trends, economic data, general finance):
   - Use web search as your primary tool

EXECUTION RULES:
- Call tools in the order specified above - don't skip steps
- If a tool returns an error, don't retry the same tool - use web search as fallback
- Always cite which tool provided each data point
- Prefer our specialized tools over web search for accuracy on financial metrics
- Be concise in your response - summarize key findings`;

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
      let finalText = response.output_text ?? '';
      if (noobMode) {
        finalText = simplifyFinanceResponse(finalText);
      }
      return { text: finalText, toolsUsed: [...new Set(toolsUsed)] };
    }

    // Execute all function calls in parallel
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

  // Add helpful context after financial recommendations
  if (
    simplified.toLowerCase().includes('buy') ||
    simplified.toLowerCase().includes('sell') ||
    simplified.toLowerCase().includes('hold')
  ) {
    if (!simplified.toLowerCase().includes('do your own research')) {
      simplified += '\n\n💡 Remember: Do your own research and only invest money you can afford to lose.';
    }
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
