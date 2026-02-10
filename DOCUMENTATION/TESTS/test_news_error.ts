import axios from 'axios';

const FMP_API_KEY = 'jNisFefw4uRwNUwQ5Ox2PZKAIl9RvAGL';
const BASE = 'https://financialmodelingprep.com/stable';

async function test() {
  try {
    console.log('Testing axios call directly...\n');
    console.log(`URL: ${BASE}/news/stock?symbols=PYPL&limit=10&apikey=${FMP_API_KEY.substring(0,10)}...`);
    
    const response = await axios.get(
      `${BASE}/news/stock?symbols=PYPL&limit=10&apikey=${FMP_API_KEY}`
    );
    
    console.log('\n✅ Success!');
    console.log('Status:', response.status);
    console.log('Data type:', typeof response.data);
    console.log('Is array:', Array.isArray(response.data));
    console.log('Length:', response.data.length);
    
    if (response.data.length > 0) {
      console.log('\nFirst article keys:', Object.keys(response.data[0]));
    }
  } catch (err: any) {
    console.error('\n❌ Error caught:');
    console.error('Message:', err.message);
    console.error('Code:', err.code);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', err.response.data);
    }
  }
}

test();
