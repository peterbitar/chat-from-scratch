/**
 * Industry comparison automation for each company (FMP reference).
 * Run: npx ts-node scripts/industry-comparison-cli.ts [SYMBOL ...]
 * Example: npx ts-node scripts/industry-comparison-cli.ts AAPL MSFT GOOGL
 */
import 'dotenv/config';
import { runIndustryComparison } from '../src/services/industryComparison';
import { formatIndustryComparison } from '../src/formatters/industryComparisonFormatter';

async function main() {
  const args = process.argv.slice(2).filter((a) => /^[A-Za-z]{1,5}$/.test(a));
  const symbols = args.length > 0 ? args.map((s) => s.toUpperCase()) : ['AAPL'];

  console.log('\n📊 Industry comparison (FMP reference automation)\n');
  console.log(`Symbols: ${symbols.join(', ')}\n`);

  for (const symbol of symbols) {
    try {
      const result = await runIndustryComparison(symbol);
      console.log(formatIndustryComparison(result));
      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (err: any) {
      console.error(`Error for ${symbol}:`, err.message);
    }
  }
}

main();
