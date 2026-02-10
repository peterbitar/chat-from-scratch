import { getNewsSentiment } from './src/tools/newsSentiment';

async function test() {
  console.log('Testing getNewsSentiment for PYPL...\n');
  
  const headlines = await getNewsSentiment({ symbol: 'PYPL' });
  
  console.log(`Got ${headlines.length} headlines:\n`);
  headlines.forEach((h, i) => {
    console.log(`${i+1}. ${h.title}`);
    console.log(`   Sentiment: ${h.sentiment}`);
    console.log(`   URL: ${h.url ? '✓' : 'none'}`);
    console.log();
  });
}

test();
