import 'dotenv/config';
import { runFinanceAgent } from './src/agents/financeAgent';

const testQuestions = [
  "Is AAPL overvalued?",
  "When does Tesla report earnings?",
  "How does Microsoft compare to Google in terms of valuation?",
  "What's the market saying about Amazon?",
  "Is now a good time to buy tech stocks?"
];

async function runTests() {
  console.log('🚀 Testing FinanceGPT with common investor questions\n');
  console.log('='.repeat(80));

  for (const question of testQuestions) {
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
