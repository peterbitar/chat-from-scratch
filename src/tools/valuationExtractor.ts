import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ValuationData {
  symbol: string;
  price: number | null;
  peRatio: number | null;
  pegRatio: number | null;
  epsTTM: number | null;
  forwardPE: number | null;
  marketCap: string | null;
  source: string;
}

export async function getValuation(symbol: string): Promise<ValuationData> {
  const url = `https://finance.yahoo.com/quote/${symbol}`;
  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 5000
    });

    const $ = cheerio.load(html);

    const extract = (label: string) =>
      $(`td:contains("${label}")`).next('td').text().trim() || null;

    const parse = (val: string | null) =>
      val && val !== 'N/A' ? parseFloat(val.replace(/[,%$BMK]/g, '')) : null;

    return {
      symbol,
      price: parse($('fin-streamer[data-field="regularMarketPrice"]').first().text()),
      peRatio: parse(extract('PE Ratio (TTM)')),
      pegRatio: parse(extract('PEG Ratio (5 yr expected)')),
      epsTTM: parse(extract('EPS (TTM)')),
      forwardPE: parse(extract('Forward P/E')),
      marketCap: extract('Market Cap'),
      source: 'Yahoo Finance'
    };
  } catch (err) {
    return {
      symbol,
      price: null,
      peRatio: null,
      pegRatio: null,
      epsTTM: null,
      forwardPE: null,
      marketCap: null,
      source: 'Yahoo Finance'
    };
  }
}
