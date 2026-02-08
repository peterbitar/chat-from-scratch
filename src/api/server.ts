import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { runFinanceAgent } from '../agents/financeAgent';
import { generateStockCheckup } from '../agents/stockCheckup';
import { formatStockCheckup } from '../formatters/checkupFormatter';
import { formatNoobCheckup } from '../formatters/noobCheckupFormatter';
import { generateDailyNewsDigest } from '../agents/dailyNewsDigest';
import { formatDailyDigest } from '../formatters/dailyDigestFormatter';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================================================
// 1️⃣ CHAT ENDPOINT - Ask questions about stocks/finance
// ============================================================================
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { question, noobMode = false } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "question" parameter' });
    }

    console.log(`[CHAT] ${question} (noobMode: ${noobMode})`);

    const { text, toolsUsed } = await runFinanceAgent(question, noobMode);

    res.json({
      success: true,
      question,
      answer: text,
      toolsUsed,
      mode: noobMode ? 'noob' : 'professional',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[CHAT ERROR]', err.message);
    res.status(500).json({ error: `Chat failed: ${err.message}` });
  }
});

// ============================================================================
// 2️⃣ STOCK CHECKUP ENDPOINT - Deep dive analysis for a ticker
// ============================================================================
app.get('/api/checkup/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const { noobMode = false, json = false } = req.query;

    if (!ticker || typeof ticker !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid ticker symbol' });
    }

    console.log(`[CHECKUP] ${ticker} (noob: ${noobMode})`);

    const checkup = await generateStockCheckup(ticker);

    if (json === 'true') {
      // Return raw JSON data
      return res.json({
        success: true,
        ticker: ticker.toUpperCase(),
        data: checkup,
        mode: 'json',
        timestamp: new Date().toISOString()
      });
    }

    // Return formatted text
    const formatted =
      noobMode === 'true' ? formatNoobCheckup(checkup) : formatStockCheckup(checkup);

    res.json({
      success: true,
      ticker: ticker.toUpperCase(),
      report: formatted,
      mode: noobMode === 'true' ? 'noob' : 'professional',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[CHECKUP ERROR]', err.message);
    res.status(500).json({ error: `Checkup failed: ${err.message}` });
  }
});

// ============================================================================
// 3️⃣ NEWS DIGEST ENDPOINT - Daily digest for market + optional specific ticker
// ============================================================================
app.get('/api/digest', async (req: Request, res: Response) => {
  try {
    const { symbols, noobMode = false, json = false } = req.query;

    const watchlist: string[] = symbols
      ? (typeof symbols === 'string' ? symbols.split(',') : Array.isArray(symbols) ? (symbols as string[]) : [String(symbols)])
      : [];

    console.log(`[DIGEST] symbols: ${watchlist.join(',')} (noob: ${noobMode})`);

    const digest = await generateDailyNewsDigest(watchlist);

    if (json === 'true') {
      return res.json({
        success: true,
        data: digest,
        mode: 'json',
        timestamp: new Date().toISOString()
      });
    }

    const formatted = formatDailyDigest(digest, noobMode === 'true' ? 'noob' : 'professional');

    res.json({
      success: true,
      report: formatted,
      watchlist,
      mode: noobMode === 'true' ? 'noob' : 'professional',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[DIGEST ERROR]', err.message);
    res.status(500).json({ error: `Digest failed: ${err.message}` });
  }
});

// ============================================================================
// NEWS ENDPOINT - News for a specific ticker
// ============================================================================
app.get('/api/news/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const { noobMode = false } = req.query;

    if (!ticker || typeof ticker !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid ticker symbol' });
    }

    console.log(`[NEWS] ${ticker} (noob: ${noobMode})`);

    const digest = await generateDailyNewsDigest([ticker.toUpperCase()]);
    const formatted = formatDailyDigest(digest, noobMode === 'true' ? 'noob' : 'professional');

    res.json({
      success: true,
      ticker: ticker.toUpperCase(),
      report: formatted,
      news: digest.stockNews,
      mode: noobMode === 'true' ? 'noob' : 'professional',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[NEWS ERROR]', err.message);
    res.status(500).json({ error: `News failed: ${err.message}` });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ============================================================================
// 404 Handler
// ============================================================================
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// ============================================================================
// Error Handler
// ============================================================================
app.use((err: any, req: Request, res: Response) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// ============================================================================
// START SERVER
// ============================================================================
app.listen(PORT, () => {
  console.log(`\n🚀 Finance API Server running on http://localhost:${PORT}`);
  console.log(`\n📚 Available Endpoints:\n`);
  console.log(`   POST   /api/chat                  - Ask questions about finance`);
  console.log(`   GET    /api/checkup/:ticker      - Deep dive stock analysis`);
  console.log(`   GET    /api/news/:ticker         - News for a specific stock`);
  console.log(`   GET    /api/digest               - Daily market digest`);
  console.log(`   GET    /api/health               - Health check\n`);
  console.log(`   Query Parameters:`);
  console.log(`   - noobMode=true                 - Use beginner-friendly format`);
  console.log(`   - json=true                     - Return raw JSON data`);
  console.log(`   - symbols=AAPL,MSFT             - Watchlist for digest\n`);
});
