import dotenv from 'dotenv';
dotenv.config();

console.log('FMP_API_KEY:', process.env.FMP_API_KEY ? '✓ SET' : '❌ NOT SET');
console.log('Value (first 10 chars):', process.env.FMP_API_KEY?.substring(0, 10));
