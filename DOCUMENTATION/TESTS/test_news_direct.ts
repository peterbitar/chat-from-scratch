import axios from 'axios';

const FMP_API_KEY = 'jNisFefw4uRwNUwQ5Ox2PZKAIl9RvAGL';
const BASE = 'https://financialmodelingprep.com/stable';

async function testNews() {
  try {
    console.log('Testing /news/stock endpoint...\n');
    
    const response = await axios.get(
      `${BASE}/news/stock?symbols=PYPL&limit=10&apikey=${FMP_API_KEY}`
    );
    
    console.log('✅ Got response');
    console.log('Number of articles:', response.data.length);
    console.log('\nFirst 3 articles:');
    response.data.slice(0, 3).forEach((article: any, i: number) => {
      console.log(`\n${i+1}. ${article.title}`);
      console.log(`   Publisher: ${article.publisher}`);
      console.log(`   Date: ${article.publishedDate}`);
    });
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

testNews();
