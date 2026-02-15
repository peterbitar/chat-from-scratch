import 'dotenv/config';
import { runDailyCheck } from '../src/services/dailyCheck';
import { getDominantSignal } from '../src/services/dominantSignalEngine';
import { buildPrimaryCard } from '../src/services/primaryCardBuilder';

async function main() {
  const symbol = process.argv[2] || 'TSLA';
  const r = await runDailyCheck(symbol);
  const sig = getDominantSignal(r);
  const card = buildPrimaryCard(r);
  console.log('Symbol:', symbol);
  console.log('Revisions:', r.revisions.eps7d, r.revisions.eps30d, 'stdDev7d:', r.revisions.stdDev7d, 'stdDev30d:', r.revisions.stdDev30d);
  console.log('Dominant signal:', sig ? `${sig.category} severity=${sig.severity}` : null);
  console.log('Card:', card ? JSON.stringify(card, null, 2) : null);
}

main().catch((e) => console.error(e));
