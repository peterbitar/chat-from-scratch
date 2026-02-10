import 'dotenv/config';
import { runFinanceAgent } from './src/agents/financeAgent';

const ratingQuestions = [
  "What do analysts think about Apple (AAPL)?",
  "Should I buy Microsoft? What's the price target?",
  "Compare analyst sentiment for Tesla vs Ford",
  "Is Google (GOOGL) trading above or below analyst targets?"
];

async function runTests() {
  console.log('🎯 Testing FinanceGPT Analyst Ratings Tool\n');
  console.log('='.repeat(80));

  for (const question of ratingQuestions) {
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
