import 'dotenv/config';
import { generateStockCheckup } from './agents/stockCheckup';
import { formatStockCheckup } from './formatters/checkupFormatter';
import { formatNoobCheckup } from './formatters/noobCheckupFormatter';

const symbol = process.argv[2]?.toUpperCase();
const mode = process.argv[3]?.toLowerCase() || 'normal';
const showJson = process.argv.includes('--json');

if (!symbol) {
  console.log('\n📊 Stock Checkup Tool\n');
  console.log('Usage:');
  console.log('  npx ts-node src/checkup-cli.ts <SYMBOL> [mode] [--json]\n');
  console.log('Modes:');
  console.log('  normal (default) - Professional financial analysis');
  console.log('  noob             - Beginner-friendly (plain English)\n');
  console.log('Examples:');
  console.log('  npx ts-node src/checkup-cli.ts AAPL');
  console.log('  npx ts-node src/checkup-cli.ts TSLA noob');
  console.log('  npx ts-node src/checkup-cli.ts MSFT normal --json\n');
  process.exit(1);
}

if (mode !== 'normal' && mode !== 'noob') {
  console.error(`❌ Invalid mode: ${mode}. Use 'normal' or 'noob'\n`);
  process.exit(1);
}

async function runCheckup() {
  try {
    console.log(`\n⏳ Analyzing ${symbol}...\n`);
    const checkup = await generateStockCheckup(symbol);

    // Format based on mode
    const formatted = mode === 'noob' ? formatNoobCheckup(checkup) : formatStockCheckup(checkup);
    console.log(formatted);

    // Optionally output JSON
    if (showJson) {
      console.log('\n📋 Raw Data (JSON):\n');
      console.log(JSON.stringify(checkup, null, 2));
    }
  } catch (err: any) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

runCheckup();
