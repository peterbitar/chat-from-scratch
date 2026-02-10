/**
 * Quick test: finance agent with a news question.
 * Expect: getNewsUpdate + web_search called (in parallel), storyline response, no bullets.
 */
import 'dotenv/config';
import { runFinanceAgent } from '../src/agents/financeAgent';

const question = 'What is the most recent news for PYPL?';

async function main() {
  console.log('Question:', question);
  console.log('---');
  const start = Date.now();
  const { text, toolsUsed } = await runFinanceAgent(question, false);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('Tools used:', toolsUsed.join(', '));
  console.log('Time:', elapsed, 's');
  console.log('---\nResponse:\n');
  console.log(text || '(no response)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
