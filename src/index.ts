import 'dotenv/config';
import * as readline from 'readline';
import { runFinanceAgent } from './agents/financeAgent';

const interactive = process.argv.includes('--interactive') || process.argv.includes('-i');
const noobMode = process.argv.includes('--noob');

if (interactive) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const modeLabel = noobMode ? '🌱 Finance NOOB Mode' : '💼 Professional Mode';

  const prompt = () => rl.question('\nYou: ', async (line) => {
    const input = line?.trim();
    if (!input || /^(exit|quit|q)$/i.test(input)) {
      rl.close();
      return;
    }

    // Check for mode toggle commands
    if (input.toLowerCase() === '/noob') {
      console.log('✅ Switched to NOOB mode (simple explanations)');
      process.argv.push('--noob');
      prompt();
      return;
    }
    if (input.toLowerCase() === '/pro') {
      console.log('✅ Switched to PROFESSIONAL mode (technical)');
      process.argv = process.argv.filter(a => a !== '--noob');
      prompt();
      return;
    }

    process.stdout.write('\n🧠 Thinking...');
    const { text, toolsUsed } = await runFinanceAgent(input, noobMode);
    console.log('\r\n🧠 FinanceGPT:', text || '(no response)');
    if (toolsUsed.length > 0) console.log('\n📎 Sources:', toolsUsed.join(', '));
    prompt();
  });

  const modeHint = noobMode ? '(Use /pro to switch to professional mode)' : '(Use /noob to switch to beginner mode)';
  console.log(`${modeLabel} — type a question, or exit/quit to end ${modeHint}\n`);
  prompt();
} else {
  (async () => {
    const { text, toolsUsed } = await runFinanceAgent('Is AAPL overvalued?', noobMode);
    console.log('\n🧠 GPT Response:\n', text);
    if (toolsUsed.length > 0) console.log('\n📎 Sources:', toolsUsed.join(', '));
  })();
}
