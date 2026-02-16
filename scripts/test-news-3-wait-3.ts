/**
 * Test: run 3 news fetches in parallel, wait 1 minute, run 3 again.
 * Verifies FMP rate limit (13s between calls) and cache (second batch same symbols = cache hit).
 */
import 'dotenv/config';
import { getNewsUpdate } from '../src/tools/newsSentiment';

const BATCH1 = ['AAPL', 'JPM', 'AVGO'];
const BATCH2 = ['MSFT', 'NVDA', 'GOOGL']; // different symbols so we hit FMP again

function elapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function runBatch(symbols: string[], label: string): Promise<void> {
  const start = Date.now();
  console.log(`\n[${new Date().toISOString()}] ${label}: ${symbols.join(', ')} (parallel)`);
  const results = await Promise.all(
    symbols.map((sym) =>
      getNewsUpdate({ symbol: sym, limit: 5 }).then((r) => ({ sym, storylineLen: r.storyline.length, headlines: r.headlines.length }))
    )
  );
  const total = Date.now() - start;
  results.forEach((r) => console.log(`  ${r.sym}: storyline ${r.storylineLen} chars, ${r.headlines} headlines`));
  console.log(`  Total: ${elapsed(total)}\n`);
}

async function main(): Promise<void> {
  console.log('Test: 3 news fetches → wait 1 min → 3 news fetches');
  console.log('FMP rate limit: 13s between calls (first batch ~39s), then 60s wait, then second batch ~39s)\n');

  await runBatch(BATCH1, 'Batch 1');
  console.log('Waiting 60 seconds...');
  await new Promise((r) => setTimeout(r, 60_000));
  await runBatch(BATCH2, 'Batch 2');

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
