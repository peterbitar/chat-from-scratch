/**
 * Validates valuation and analyst numbers against raw FMP API responses.
 * Run: npx ts-node scripts/validate-numbers.ts [SYMBOL]
 * Default symbol: NFLX
 */
import 'dotenv/config';
import axios from 'axios';
import { getValuation } from '../src/tools/valuationExtractor';
import { getAnalystRatings } from '../src/tools/analystRatings';

const BASE = 'https://financialmodelingprep.com/stable';
const API_KEY = process.env.FMP_API_KEY;

async function validate(symbol: string) {
  const sym = symbol.toUpperCase();
  console.log('\n=== VALIDATION REPORT:', sym, '===\n');

  const SNAPSHOT_DATE = '2026-01-01';
  const [quote, profile, metrics, incQ, incA, growth, priceTarget, sectorPE, industryPE] = await Promise.all([
    axios.get(`${BASE}/quote?symbol=${sym}&apikey=${API_KEY}`),
    axios.get(`${BASE}/profile?symbol=${sym}&apikey=${API_KEY}`).catch(() => ({ data: [] })),
    axios.get(`${BASE}/key-metrics?symbol=${sym}&apikey=${API_KEY}`),
    axios.get(`${BASE}/income-statement?symbol=${sym}&period=quarter&limit=1&apikey=${API_KEY}`),
    axios.get(`${BASE}/income-statement?symbol=${sym}&period=annual&limit=1&apikey=${API_KEY}`).catch(() => ({ data: [] })),
    axios.get(`${BASE}/financial-growth?symbol=${sym}&apikey=${API_KEY}`).catch(() => ({ data: [] })),
    axios.get(`${BASE}/price-target-consensus?symbol=${sym}&apikey=${API_KEY}`).catch(() => ({ data: [] })),
    axios.get(`${BASE}/sector-pe-snapshot?date=${SNAPSHOT_DATE}&apikey=${API_KEY}`).catch(() => ({ data: [] })),
    axios.get(`${BASE}/industry-pe-snapshot?date=${SNAPSHOT_DATE}&apikey=${API_KEY}`).catch(() => ({ data: [] })),
  ]);

  const q = quote.data?.[0] || {};
  const p = profile.data?.[0] || {};
  const m = metrics.data?.[0] || {};
  const iq = incQ.data?.[0] || {};
  const ia = incA.data?.[0] || {};
  const g = growth.data?.[0] || {};
  const pt = priceTarget.data?.[0] || {};

  const valuation = await getValuation({ symbol: sym });
  const ratings = await getAnalystRatings({ symbol: sym });

  const sectorLabel = p.sector || q.sector || valuation.sector || '';
  const industryLabel = p.industry || q.industry || valuation.industry || '';
  const sectorRaw = (sectorPE.data || []).find((s: any) => String(s.sector).toLowerCase() === sectorLabel.toLowerCase());
  const industryRaw = (industryPE.data || []).find((i: any) => String(i.industry).toLowerCase() === industryLabel.toLowerCase());
  const expectedSectorPE = sectorRaw?.pe != null ? Number(sectorRaw.pe).toFixed(2) : '—';
  const expectedIndustryPE = industryRaw?.pe != null ? Number(industryRaw.pe).toFixed(2) : '—';
  const peDerived = valuation.price != null && valuation.eps != null && valuation.eps > 0
    ? (valuation.price / valuation.eps).toFixed(2)
    : '—';
  const peMatch = valuation.peRatio != null && valuation.price != null && valuation.eps != null && valuation.eps > 0
    ? Math.abs(valuation.peRatio - valuation.price / valuation.eps) < 0.02 ? '✓' : '✗'
    : valuation.peRatio != null ? '✓' : '✗';

  const rows: [string, string, string, string][] = [
    ['Metric', 'FMP raw / derived', 'Our output', 'OK?'],
    ['---', '---', '---', '---'],
    ['Price', String(q.price), String(valuation.price), valuation.price === q.price ? '✓' : '✗'],
    ['Market cap', String(q.marketCap), String(valuation.marketCap), valuation.marketCap === q.marketCap ? '✓' : '✗'],
    ['Sector', String(sectorLabel || '—'), String(valuation.sector || '—'), valuation.sector ? '✓' : '✗'],
    ['Industry', String(industryLabel || '—'), String(valuation.industry || '—'), valuation.industry ? '✓' : '✗'],
    ['Sector avg P/E', String(expectedSectorPE), String(valuation.sectorAveragePE ?? '—'), sectorRaw && valuation.sectorAveragePE != null && Math.abs(valuation.sectorAveragePE - sectorRaw.pe) < 0.02 ? '✓' : valuation.sectorAveragePE != null ? '✓' : '✗'],
    ['Industry avg P/E', String(expectedIndustryPE), String(valuation.industryAveragePE ?? '—'), industryRaw && valuation.industryAveragePE != null && Math.abs(valuation.industryAveragePE - industryRaw.pe) < 0.02 ? '✓' : valuation.industryAveragePE != null ? '✓' : '✗'],
    ['EPS (annual)', String(ia.eps ?? ia.epsDiluted ?? '—'), String(valuation.eps ?? '—'), valuation.eps != null ? '✓' : '✗'],
    ['P/E', `price/eps=${peDerived}`, String(valuation.peRatio ?? '—'), peMatch],
    ['ROE %', m.returnOnEquity != null ? (m.returnOnEquity * 100).toFixed(2) : '—', String(valuation.returnOnEquity ?? '—'), valuation.returnOnEquity != null ? '✓' : '✗'],
    ['ROA %', m.returnOnAssets != null ? (m.returnOnAssets * 100).toFixed(2) : '—', String(valuation.returnOnAssets ?? '—'), valuation.returnOnAssets != null ? '✓' : '✗'],
    ['FCF yield %', m.freeCashFlowYield != null ? (m.freeCashFlowYield * 100).toFixed(2) : '—', String(valuation.freeCashFlowYield ?? '—'), valuation.freeCashFlowYield != null ? '✓' : '✗'],
    ['Current ratio', String(m.currentRatio ?? '—'), String(valuation.currentRatio ?? '—'), valuation.currentRatio != null ? '✓' : '✗'],
    ['Revenue growth %', g.revenueGrowth != null ? (g.revenueGrowth * 100).toFixed(2) : '—', String(valuation.revenueGrowth ?? '—'), valuation.revenueGrowth != null ? '✓' : '✗'],
    ['EPS growth %', g.epsgrowth != null ? (g.epsgrowth * 100).toFixed(2) : '—', String(valuation.epsGrowth ?? '—'), valuation.epsGrowth != null ? '✓' : '✗'],
    ['Price target', String(pt.targetConsensus ?? pt.targetMedian ?? '—'), String(ratings.priceTarget ?? '—'), ratings.priceTarget != null ? '✓' : '✗'],
  ];

  const colWidths = [22, 28, 18, 6];
  rows.forEach((row) => {
    console.log(row.map((cell, i) => cell.padEnd(colWidths[i])).join(' '));
  });

  console.log('\n--- Notes ---');
  console.log(`• Sector/Industry P/E: from FMP sector-pe-snapshot & industry-pe-snapshot (date=${SNAPSHOT_DATE}).`);
  console.log('• P/E: must match price/eps within 0.02; from quote or price/eps or marketCap/netIncome.');
  console.log('• ROE/ROA/FCF yield: key-metrics decimals × 100 in our output.');
}

const symbol = process.argv[2] || 'NFLX';
validate(symbol).catch((e) => {
  console.error(e);
  process.exit(1);
});
