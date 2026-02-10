import 'dotenv/config';
import { runFinanceAgent } from './src/agents/financeAgent';

const benchmarkQuestions = [
  "Is AAPL beating the S&P 500?",
  "How is Tesla performing vs the market?",
  "Should I buy Microsoft or just invest in SPY (S&P 500)?",
  "Compare Google's performance to the S&P 500"
];

async function runTests() {
  console.log('📈 Testing S&P 500 Comparison Tool\n');
  console.log('='.repeat(80));

  for (const question of benchmarkQuestions) {
    console.log(`\n📊 Question: ${question}`);
    console.log('-'.repeat(80));

    try {
      const startTime = Date.now();
      const { text, toolsUsed } = await runFinanceAgent(question);
      const duration = Date.now() - startTime;

      console.log(`\n💬 Response:\n${text}`);
      console.log(`\n📎 Tools Used: ${toolsUsed.join(', ') || 'None'}`);
      console.log(`⏱️  Duration: ${(duration / 1000).toFixed(1)}s`);
    } catch (err: any) {
      console.log(`❌ Error: ${err.message}`);
    }

    console.log('\n' + '='.repeat(80));
  }
}

runTests().catch(console.error);
