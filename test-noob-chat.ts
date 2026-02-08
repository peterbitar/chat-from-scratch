import 'dotenv/config';
import { runFinanceAgent } from './src/agents/financeAgent';

const testQuestions = ['Is AAPL overvalued?', 'What do analysts think about Microsoft?', 'Is Tesla beating the S&P 500?'];

async function compareMode(question: string) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`❓ Question: ${question}`);
  console.log('═'.repeat(80));

  console.log('\n💼 PROFESSIONAL MODE (Technical):\n' + '─'.repeat(80));
  try {
    const { text: proText } = await runFinanceAgent(question, false);
    console.log(proText.substring(0, 400) + '...\n');
  } catch (err) {
    console.log('Error\n');
  }

  console.log('\n🌱 NOOB MODE (Simple English):\n' + '─'.repeat(80));
  try {
    const { text: noobText } = await runFinanceAgent(question, true);
    console.log(noobText.substring(0, 400) + '...\n');
  } catch (err) {
    console.log('Error\n');
  }
}

async function runComparison() {
  console.log('\n🎯 Finance Chat: Professional vs NOOB Mode\n');

  for (const question of testQuestions) {
    await compareMode(question);
  }

  console.log('\n' + '═'.repeat(80));
  console.log('\n✨ Key Differences:');
  console.log('   • PROFESSIONAL: Technical jargon, detailed metrics');
  console.log('   • NOOB: Plain English, easy-to-understand context\n');
}

runComparison().catch(console.error);
