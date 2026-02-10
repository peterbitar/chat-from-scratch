import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

async function test() {
  try {
    console.log('Testing /news/stock with axios (from env)...');
    console.log('API Key (first 10):', FMP_API_KEY?.substring(0, 10));
    
    const url = `${BASE}/news/stock?symbols=PYPL&limit=10&apikey=${FMP_API_KEY}`;
    const response = await axios.get(url);
    
    console.log('✅ Success! Status:', response.status);
    console.log('Articles received:', response.data.length);
  } catch (err: any) {
    console.error('❌ Error! Status:', err.response?.status);
    console.error('Message:', err.message);
  }
}

test();
