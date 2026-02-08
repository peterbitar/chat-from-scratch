import { runFinanceAgent } from './agents/financeAgent';

(async () => {
  const response = await runFinanceAgent('How does AMD compare to peers in valuation?');
  console.log('\n📊 GPT Response:\n', response);
})();
