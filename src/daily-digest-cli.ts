import 'dotenv/config';
import { generateDailyNewsDigest } from './agents/dailyNewsDigest';
import { formatDailyDigest } from './formatters/dailyDigestFormatter';

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args.includes('--noob') ? 'noob' : 'professional';
const watchlistArg = args.find((arg) => arg.startsWith('--symbols='));
const watchlist = watchlistArg ? watchlistArg.split('=')[1].split(',').map((s) => s.toUpperCase()) : [];

async function main() {
  try {
    console.log('\n⏳ Generating daily digest...\n');

    const digest = await generateDailyNewsDigest(watchlist);
    const formatted = formatDailyDigest(digest, mode as 'noob' | 'professional');

    console.log(formatted);

    // Optional: Output raw JSON
    if (args.includes('--json')) {
      console.log('\n📋 Raw Data (JSON):\n');
      console.log(JSON.stringify(digest, null, 2));
    }
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

// Show usage if no valid args
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
📰 Daily Market Digest

Usage:
  npx ts-node src/daily-digest-cli.ts [options]

Options:
  --noob              Use beginner-friendly format (default: professional)
  --symbols=AAPL,TSLA Specify stocks to watch (comma-separated, no spaces)
  --json              Also output raw JSON data
  --help, -h          Show this help message

Examples:
  npx ts-node src/daily-digest-cli.ts
  npx ts-node src/daily-digest-cli.ts --noob
  npx ts-node src/daily-digest-cli.ts --symbols=AAPL,MSFT,TSLA
  npx ts-node src/daily-digest-cli.ts --noob --symbols=AAPL,MSFT
  npx ts-node src/daily-digest-cli.ts --json
`);
  process.exit(0);
}

main();
