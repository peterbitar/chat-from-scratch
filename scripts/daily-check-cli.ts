/**
 * Daily Check CLI — Re-rating monitor for each company.
 * Run: npx ts-node scripts/daily-check-cli.ts [SYMBOL ...] [--story] [--json]
 * Example: npx ts-node scripts/daily-check-cli.ts AAPL MSFT GOOGL --story
 */
import 'dotenv/config';
import { runDailyCheck } from '../src/services/dailyCheck';
import { formatDailyCheck } from '../src/formatters/dailyCheckFormatter';
import { generateRabbitStory } from '../src/services/rabbitStoryEngine';

async function main() {
  const rawArgs = process.argv.slice(2);
  const withStory = rawArgs.includes('--story');
  const withJson = rawArgs.includes('--json');
  const symbols = rawArgs
    .filter((a) => /^[A-Za-z]{1,5}$/.test(a))
    .map((s) => s.toUpperCase());
  const syms = symbols.length > 0 ? symbols : ['AAPL'];

  console.log('\n📊 Daily Check — Re-rating monitor\n');
  console.log(`Symbols: ${syms.join(', ')}${withStory ? ' (with Rabbit Story)' : ''}\n`);

  for (const symbol of syms) {
    try {
      const result = await runDailyCheck(symbol);
      console.log(formatDailyCheck(result));
      if (withStory) {
        console.log('\n🐰 Rabbit Story\n');
        const story = await generateRabbitStory(result);
        console.log(story);
        console.log('\n');
      }
      if (withJson) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error for ${symbol}:`, message);
    }
  }
}

main();
