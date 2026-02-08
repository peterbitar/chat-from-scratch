import 'dotenv/config';
import OpenAI from 'openai';
import { tools } from '../tools/tools';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function runFinanceAgent(userInput: string): Promise<string | undefined> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are FinanceGPT, a financial analysis assistant.' },
      { role: 'user', content: userInput }
    ],
    tools: tools.map(({ name, description, parameters }) => ({
      type: 'function' as const,
      function: { name, description, parameters }
    })),
    tool_choice: 'auto'
  });

  const response = completion.choices[0]?.message;

  if (response?.tool_calls?.length) {
    const toolCall = response.tool_calls[0];
    const name = toolCall.function?.name ?? '';
    const argsJson = toolCall.function?.arguments ?? '{}';
    const tool = tools.find((t) => t.name === name);
    const args = JSON.parse(argsJson) as { symbol: string };
    const result = await tool!.func(args);

    const followup = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are FinanceGPT, a financial analysis assistant.' },
        { role: 'user', content: userInput },
        { role: 'assistant', content: response.content ?? null, tool_calls: response.tool_calls },
        {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        }
      ]
    });

    return followup.choices[0]?.message?.content ?? undefined;
  }

  return response?.content ?? undefined;
}
