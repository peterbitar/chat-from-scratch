import { getNewsSentiment } from './src/tools/newsSentiment';

async function test() {
  console.log('=== Testing getNewsSentiment for PYPL ===\n');
  
  const headlines = await getNewsSentiment({ symbol: 'PYPL' });
  
  console.log(`\n=== Results ===`);
  console.log(`Got ${headlines.length} headlines:\n`);
  headlines.forEach((h, i) => {
    console.log(`${i+1}. ${h.title.substring(0, 60)}`);
    console.log(`   Sentiment: ${h.sentiment}`);
  });
}

test();
