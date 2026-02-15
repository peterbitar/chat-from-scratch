/**
 * Feed CLI — Dominant signal feed or retail B2C feed.
 * Run: npx ts-node scripts/feed-cli.ts [SYMBOL ...] [--retail] [--json]
 * Example: npx ts-node scripts/feed-cli.ts AAPL MSFT TSLA --retail
 */
import 'dotenv/config';
import { generateDominantSignalFeed, isThemedCard } from '../src/services/dominantSignalFeed';
import { generateRetailFeed } from '../src/services/retailFeed';

async function main() {
  const rawArgs = process.argv.slice(2);
  const retail = rawArgs.includes('--retail');
  const withJson = rawArgs.includes('--json');
  const symbols = rawArgs
    .filter((a) => /^[A-Za-z]{1,5}$/.test(a))
    .map((s) => s.toUpperCase());
  const syms = symbols.length > 0 ? symbols : ['AAPL', 'MSFT', 'TSLA'];

  if (retail) {
    const feed = await generateRetailFeed(syms);
    console.log('\n🧠 Market Mood\n');
    console.log(`${feed.marketMood}\n`);
    if (feed.allStable) {
      console.log('Nothing to show. Your holdings look stable.\n');
      if (withJson) console.log(JSON.stringify(feed, null, 2));
      return;
    }
    console.log('📋 What Changed (max 3)\n');
    feed.cards.forEach((card, i) => {
      console.log(`${i + 1}. ${card.title}`);
      console.log(card.content.replace(/\*\*/g, '').replace(/\n/g, '\n   '));
      console.log('');
    });
    if (withJson) console.log(JSON.stringify(feed, null, 2));
    return;
  }

  console.log('\n📋 Dominant Signal Feed\n');
  console.log(`Symbols: ${syms.join(', ')}\n`);

  const feed = await generateDominantSignalFeed(syms);

  if (feed.allStable) {
    console.log('All holdings stable.\n');
    return;
  }

  feed.cards.forEach((item, i) => {
    if (isThemedCard(item)) {
      const icon = item.tone === 'Bullish' ? '🟢' : item.tone === 'Bearish' ? '🔴' : '🟡';
      console.log(`${i + 1}. ${item.theme} ${icon} [${item.category}] max ${item.maxSeverity}`);
      item.items.forEach((sub) => {
        console.log(`   ${sub.symbol} ${sub.keyMetric}`);
      });
      console.log('');
    } else {
      const icon = item.tone === 'Bullish' ? '🟢' : item.tone === 'Bearish' ? '🔴' : '🟡';
      console.log(`${i + 1}. ${item.symbol} ${icon} [${item.category}] ${item.severity}`);
      console.log(`   ${item.title}`);
      console.log(`   ${item.summary}`);
      console.log(`   Key: ${item.keyMetric}`);
      if (item.confidenceNote) console.log(`   ${item.confidenceNote}`);
      console.log('');
    }
  });

  if (withJson) {
    console.log(JSON.stringify(feed, null, 2));
  }
}

main();
