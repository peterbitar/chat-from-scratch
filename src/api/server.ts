import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { runFinanceAgent } from '../agents/financeAgent';
import { generateStockCheckup } from '../agents/stockCheckup';
import { formatStockCheckup } from '../formatters/checkupFormatter';
import { formatNoobCheckup } from '../formatters/noobCheckupFormatter';
import { generateDailyNewsDigest } from '../agents/dailyNewsDigest';
import { formatDailyDigest } from '../formatters/dailyDigestFormatter';
import { generateStockSnapshot } from '../services/stockSnapshot';
import { runIndustryComparison } from '../services/industryComparison';
import { formatIndustryComparison } from '../formatters/industryComparisonFormatter';
import { runDailyCheck } from '../services/dailyCheck';
import { formatDailyCheck } from '../formatters/dailyCheckFormatter';
import { polishDailyCheckReport } from '../services/dailyCheckPolisher';
import { generateRabbitStory } from '../services/rabbitStoryEngine';
import { generateDominantSignalFeed } from '../services/dominantSignalFeed';
import { generateRetailFeed } from '../services/retailFeed';
import { getEarningsRecap, earningsRecapRelevance } from '../services/earningsRecap';
import { formatEarningsRecap, formatEarningsRecapAsCard } from '../formatters/earningsRecapFormatter';
import { generateEarningsRecapCard, generateNewsCard } from '../services/feedCardGenerator';

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
// EXTERNAL CHAT (App adapter) - POST with body { message, sessionId? }
// Sessions are stateless; each request is independent until session handling is added.
// ============================================================================
app.post('/api/chat/external', async (req: Request, res: Response) => {
  try {
    const { message, sessionId, noobMode = false } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "message" parameter' });
    }

    console.log(`[CHAT EXTERNAL] message length: ${message.length} (sessionId: ${sessionId || 'none'})`);

    const { text } = await runFinanceAgent(message, noobMode);

    res.json({
      success: true,
      response: text,
      sessionId: sessionId || randomUUID(),
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[CHAT EXTERNAL ERROR]', err.message);
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

    // Validate ticker format (1-5 uppercase letters)
    if (!/^[A-Z]{1,5}$/.test(ticker.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid ticker format. Must be 1-5 letters.' });
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
// HOLDING CHECKUP (App proxy) - POST with body { ticker, type?, name? }
// Uses dailyCheck service (re-rating monitor: thesis, revisions, price, risk).
// ============================================================================
app.post('/api/holding-checkup', async (req: Request, res: Response) => {
  try {
    const { ticker, type } = req.body;

    if (!ticker || typeof ticker !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "ticker" parameter' });
    }

    if (!/^[A-Za-z]{1,5}$/.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker format. Must be 1-5 letters.' });
    }

    const symbol = ticker.toUpperCase();
    console.log(`[HOLDING-CHECKUP] ${symbol}`);

    const result = await runDailyCheck(symbol);
    const formatted = formatDailyCheck(result);
    const checkup = await polishDailyCheckReport(symbol, formatted);

    res.json({
      success: true,
      checkup,
      assetType: type || 'stock',
      symbol,
      webSearchUsed: false,
      citationUrls: [],
      newsBriefUsed: false
    });
  } catch (err: any) {
    console.error('[HOLDING-CHECKUP ERROR]', err.message);
    res.status(500).json({ error: `Holding checkup failed: ${err.message}` });
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
// STOCK SNAPSHOT - Clean JSON: vs S&P 500, valuation, fundamentals
// GET  /api/snapshot/:ticker
// POST /api/snapshot (iOS app) - body: { ticker, type? }
// ============================================================================
app.get('/api/snapshot/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;

    if (!ticker || typeof ticker !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid ticker symbol' });
    }

    if (!/^[A-Za-z]{1,5}$/.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker format. Must be 1-5 letters.' });
    }

    console.log(`[SNAPSHOT] ${ticker.toUpperCase()}`);

    const snapshot = await generateStockSnapshot(ticker.toUpperCase());

    res.json({
      success: true,
      data: snapshot,
      timestamp: snapshot.timestamp
    });
  } catch (err: any) {
    console.error('[SNAPSHOT ERROR]', err.message);
    res.status(500).json({ error: `Snapshot failed: ${err.message}` });
  }
});

// POST /api/snapshot - iOS App adapter (same pattern as holding-checkup)
app.post('/api/snapshot', async (req: Request, res: Response) => {
  try {
    const { ticker, type } = req.body;

    if (!ticker || typeof ticker !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "ticker" parameter' });
    }

    if (!/^[A-Za-z]{1,5}$/.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker format. Must be 1-5 letters.' });
    }

    const symbol = ticker.toUpperCase();
    console.log(`[SNAPSHOT] ${symbol} (iOS)`);

    const snapshot = await generateStockSnapshot(symbol);

    res.json({
      success: true,
      snapshot: snapshot,
      symbol,
      assetType: type || 'stock',
      timestamp: snapshot.timestamp
    });
  } catch (err: any) {
    console.error('[SNAPSHOT ERROR]', err.message);
    res.status(500).json({ error: `Snapshot failed: ${err.message}` });
  }
});

// ============================================================================
// INDUSTRY COMPARISON - Per-company: industry snapshot, stock vs industry, verdict
// GET  /api/industry-comparison/:ticker
// POST /api/industry-comparison (body: { ticker } or { symbols: string[] })
// ============================================================================
app.get('/api/industry-comparison/:ticker', async (req: Request, res: Response) => {
  try {
    const ticker = Array.isArray(req.params.ticker) ? req.params.ticker[0] : req.params.ticker;
    const json = req.query.json === 'true';

    if (!ticker || typeof ticker !== 'string' || !/^[A-Za-z]{1,5}$/.test(ticker)) {
      return res.status(400).json({ error: 'Missing or invalid ticker symbol' });
    }

    const symbol = ticker.toUpperCase();
    console.log(`[INDUSTRY-COMPARISON] ${symbol}`);

    const result = await runIndustryComparison(symbol);

    if (json) {
      return res.json({ success: true, data: result, timestamp: result.timestamp });
    }

    res.json({
      success: true,
      ticker: symbol,
      report: formatIndustryComparison(result),
      verdict: result.verdict,
      timestamp: result.timestamp
    });
  } catch (err: any) {
    console.error('[INDUSTRY-COMPARISON ERROR]', err.message);
    res.status(500).json({ error: `Industry comparison failed: ${err.message}` });
  }
});

app.post('/api/industry-comparison', async (req: Request, res: Response) => {
  try {
    const { ticker, symbols } = req.body;
    const list: string[] = symbols && Array.isArray(symbols)
      ? (symbols as string[]).map((s: string) => String(s).toUpperCase()).filter((s: string) => /^[A-Za-z]{1,5}$/.test(s))
      : ticker && typeof ticker === 'string' && /^[A-Za-z]{1,5}$/.test(ticker)
        ? [ticker.toUpperCase()]
        : [];

    if (list.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid "ticker" or "symbols" in body' });
    }

    console.log(`[INDUSTRY-COMPARISON] batch: ${list.join(', ')}`);

    const results = await Promise.all(list.map((s) => runIndustryComparison(s)));
    const reports = results.map((r) => formatIndustryComparison(r));

    res.json({
      success: true,
      symbols: list,
      results: results.map((r) => ({ symbol: r.symbol, verdict: r.verdict, verdictReason: r.verdictReason })),
      reports,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[INDUSTRY-COMPARISON ERROR]', err.message);
    res.status(500).json({ error: `Industry comparison failed: ${err.message}` });
  }
});

// ============================================================================
// DAILY CHECK - Re-rating monitor: thesis status, what changed, risk alerts
// GET  /api/daily-check/:ticker
// POST /api/daily-check (body: { ticker } or { symbols: string[] })
// ============================================================================
app.get('/api/daily-check/:ticker', async (req: Request, res: Response) => {
  try {
    const ticker = Array.isArray(req.params.ticker) ? req.params.ticker[0] : req.params.ticker;
    const json = req.query.json === 'true';
    const story = req.query.story === 'true';

    if (!ticker || typeof ticker !== 'string' || !/^[A-Za-z]{1,5}$/.test(ticker)) {
      return res.status(400).json({ error: 'Missing or invalid ticker symbol' });
    }

    const symbol = ticker.toUpperCase();
    console.log(`[DAILY-CHECK] ${symbol}${story ? ' (story)' : ''}`);

    const result = await runDailyCheck(symbol);

    if (json) {
      return res.json({ success: true, data: result, timestamp: result.timestamp });
    }

    const payload: Record<string, unknown> = {
      success: true,
      ticker: symbol,
      thesisStatus: result.thesisStatus,
      baseScore: result.baseScore,
      dailyPulse: result.dailyPulse,
      confidence: result.confidence,
      revisions: result.revisions,
      valuation: result.valuation,
      price: result.price,
      relativeStrength: result.relativeStrength,
      setupType: result.setupType,
      positioning: result.positioning,
      timeHorizonBias: result.timeHorizonBias,
      betaVsSp500: result.betaVsSp500,
      sectorMedianNDtoEbitda: result.sectorMedianNDtoEbitda,
      signal: result.signal,
      pillars: result.pillars,
      structuralRisk: result.structuralRisk,
      flowRisk: result.flowRisk,
      clusterRiskDetected: result.clusterRiskDetected,
      clusterInteractionNote: result.clusterInteractionNote,
      sensitivityNote: result.sensitivityNote,
      riskAlerts: result.riskAlerts,
      report: formatDailyCheck(result),
      timestamp: result.timestamp
    };
    if (story) {
      payload.rabbitStory = await generateRabbitStory(result);
    }
    res.json(payload);
  } catch (err: any) {
    console.error('[DAILY-CHECK ERROR]', err.message);
    res.status(500).json({ error: `Daily check failed: ${err.message}` });
  }
});

app.post('/api/daily-check', async (req: Request, res: Response) => {
  try {
    const { ticker, symbols, story: withStory } = req.body;
    const list: string[] = symbols && Array.isArray(symbols)
      ? (symbols as string[]).map((s: string) => String(s).toUpperCase()).filter((s: string) => /^[A-Za-z]{1,5}$/.test(s))
      : ticker && typeof ticker === 'string' && /^[A-Za-z]{1,5}$/.test(ticker)
        ? [ticker.toUpperCase()]
        : [];

    if (list.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid "ticker" or "symbols" in body' });
    }

    console.log(`[DAILY-CHECK] batch: ${list.join(', ')}${withStory ? ' (story)' : ''}`);

    const results = await Promise.all(list.map((s) => runDailyCheck(s)));
    const rabbitStories = withStory ? await Promise.all(results.map((r) => generateRabbitStory(r))) : [];

    const payload: Record<string, unknown> = {
      success: true,
      symbols: list,
      results: results.map((r) => ({
        symbol: r.symbol,
        thesisStatus: r.thesisStatus,
        baseScore: r.baseScore,
        dailyPulse: r.dailyPulse,
        confidence: r.confidence,
        price: r.price,
        relativeStrength: r.relativeStrength,
        setupType: r.setupType,
        positioning: r.positioning,
        timeHorizonBias: r.timeHorizonBias,
        betaVsSp500: r.betaVsSp500,
        signal: r.signal,
        structuralRisk: r.structuralRisk,
        flowRisk: r.flowRisk,
        clusterRiskDetected: r.clusterRiskDetected,
        riskAlerts: r.riskAlerts
      })),
      reports: results.map((r) => formatDailyCheck(r)),
      timestamp: new Date().toISOString()
    };
    if (withStory) {
      payload.rabbitStories = rabbitStories;
    }
    res.json(payload);
  } catch (err: any) {
    console.error('[DAILY-CHECK ERROR]', err.message);
    res.status(500).json({ error: `Daily check failed: ${err.message}` });
  }
});

// ============================================================================
// DOMINANT SIGNAL FEED - One card per stock, highest-severity signal only
// GET  /api/feed?symbols=AAPL,MSFT,TSLA
// POST /api/feed (body: { symbols: [] })
// ============================================================================
app.get('/api/feed', async (req: Request, res: Response) => {
  try {
    const raw = req.query.symbols;
    const retail = req.query.mode === 'retail';
    const list: string[] = raw
      ? (typeof raw === 'string' ? raw.split(',') : Array.isArray(raw) ? (raw as string[]) : [])
          .map((s: string) => String(s).toUpperCase().trim())
          .filter((s: string) => /^[A-Za-z]{1,5}$/.test(s))
      : [];

    if (list.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid "symbols" query (e.g. ?symbols=AAPL,MSFT)' });
    }

    console.log(`[FEED] symbols: ${list.join(', ')}${retail ? ' (retail)' : ''}`);
    if (retail) {
      const feed = await generateRetailFeed(list);
      return res.json({ success: true, ...feed });
    }
    const feed = await generateDominantSignalFeed(list);
    res.json({ success: true, ...feed });
  } catch (err: any) {
    console.error('[FEED ERROR]', err.message);
    res.status(500).json({ error: `Feed failed: ${err.message}` });
  }
});

app.post('/api/feed', async (req: Request, res: Response) => {
  try {
    const { symbols, mode } = req.body;
    const retail = mode === 'retail';
    const list: string[] = symbols && Array.isArray(symbols)
      ? (symbols as string[]).map((s: string) => String(s).toUpperCase().trim()).filter((s: string) => /^[A-Za-z]{1,5}$/.test(s))
      : [];

    if (list.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid "symbols" in body' });
    }

    console.log(`[FEED] symbols: ${list.join(', ')}${retail ? ' (retail)' : ''}`);
    if (retail) {
      const feed = await generateRetailFeed(list);
      return res.json({ success: true, ...feed });
    }
    const feed = await generateDominantSignalFeed(list);
    res.json({ success: true, ...feed });
  } catch (err: any) {
    console.error('[FEED ERROR]', err.message);
    res.status(500).json({ error: `Feed failed: ${err.message}` });
  }
});

// ============================================================================
// EARNINGS RECAP - Last quarter quick recap (anchor event for thesis)
// GET /api/earnings-recap/:ticker
// Only relevant within 7d of earnings, or revision spike / price move post-earnings
// ============================================================================
app.get('/api/earnings-recap/:ticker', async (req: Request, res: Response) => {
  try {
    const raw = req.params.ticker;
    const ticker = (Array.isArray(raw) ? raw[0] : raw || '').toString().toUpperCase();
    if (!/^[A-Za-z]{1,5}$/.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker symbol' });
    }
    const recap = await getEarningsRecap(ticker);
    if (!recap) {
      return res.json({ success: true, ticker, recap: null, shouldShow: false, formatted: null, card: null, cards: [] });
    }
    const daily = await runDailyCheck(ticker).catch(() => null);
    const relevance = earningsRecapRelevance(recap, {
      revisionSpikeAfterEarnings: daily?.majorRecalibrationFlag ?? false,
      significantPriceMovePostEarnings: daily?.volatilityAlertFlag ?? false
    });
    const formatted = formatEarningsRecap(recap);
    // Always return a narrative card when we have recap (analysis and story, not just numbers)
    const llmCard = await generateEarningsRecapCard(recap);
    const rawCard = llmCard ?? formatEarningsRecapAsCard(recap);
    // Same shape as feed API (RetailCard): symbol, headline, title, content, explanation.classification.eventType
    const card = {
      symbol: ticker,
      headline: rawCard.title,
      title: rawCard.title,
      content: rawCard.content,
      explanation: { classification: { eventType: 'earnings' as const } }
    };
    const cards = [card];
    res.json({
      success: true,
      ticker,
      recap: relevance.recap,
      shouldShow: relevance.shouldShow,
      daysSinceEarnings: relevance.daysSinceEarnings,
      reason: relevance.reason,
      formatted: formatted,
      card,
      cards
    });
  } catch (err: any) {
    console.error('[EARNINGS-RECAP ERROR]', err.message);
    res.status(500).json({ error: `Earnings recap failed: ${err.message}` });
  }
});

// ============================================================================
// EARNINGS RECAP FEED - Same response shape as feed API only (marketMood, cards, allStable, timestamp)
// GET /api/earnings-recap-feed/:ticker
// ============================================================================
app.get('/api/earnings-recap-feed/:ticker', async (req: Request, res: Response) => {
  try {
    const raw = req.params.ticker;
    const ticker = (Array.isArray(raw) ? raw[0] : raw || '').toString().toUpperCase();
    if (!/^[A-Za-z]{1,5}$/.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker symbol' });
    }
    const recap = await getEarningsRecap(ticker);
    if (!recap) {
      return res.json({
        success: true,
        marketMood: 'No earnings recap available for this symbol.',
        cards: [],
        allStable: true,
        timestamp: new Date().toISOString()
      });
    }
    const llmCard = await generateEarningsRecapCard(recap);
    const rawCard = llmCard ?? formatEarningsRecapAsCard(recap);
    const card = {
      symbol: ticker,
      headline: rawCard.title,
      title: rawCard.title,
      content: rawCard.content,
      explanation: { classification: { eventType: 'earnings' as const } }
    };
    res.json({
      success: true,
      marketMood: 'Last quarter earnings recap.',
      cards: [card],
      allStable: false,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[EARNINGS-RECAP-FEED ERROR]', err.message);
    res.status(500).json({ error: `Earnings recap feed failed: ${err.message}` });
  }
});

// ============================================================================
// NEWS FEED - Same response shape as feed / earnings-recap-feed (marketMood, cards, allStable, timestamp)
// For iOS holding: one card per ticker with LLM-generated news story.
// GET  /api/news-feed/:ticker
// POST /api/news-feed (body: { ticker })
// ============================================================================
app.get('/api/news-feed/:ticker', async (req: Request, res: Response) => {
  try {
    const raw = req.params.ticker;
    const ticker = (Array.isArray(raw) ? raw[0] : raw || '').toString().toUpperCase();
    if (!/^[A-Za-z]{1,5}$/.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker symbol' });
    }
    const cardContent = await generateNewsCard(ticker);
    if (!cardContent) {
      return res.json({
        success: true,
        marketMood: 'No recent news available for this symbol.',
        cards: [],
        allStable: true,
        timestamp: new Date().toISOString()
      });
    }
    const card = {
      symbol: ticker,
      headline: cardContent.title,
      title: cardContent.title,
      content: cardContent.content,
      explanation: { classification: { eventType: 'news' as const } }
    };
    res.json({
      success: true,
      marketMood: 'Recent news for this holding.',
      cards: [card],
      allStable: false,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[NEWS-FEED ERROR]', err.message);
    res.status(500).json({ error: `News feed failed: ${err.message}` });
  }
});

app.post('/api/news-feed', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.body;
    const symbol = ticker && typeof ticker === 'string' ? ticker.trim().toUpperCase() : '';
    if (!symbol || !/^[A-Za-z]{1,5}$/.test(symbol)) {
      return res.status(400).json({ error: 'Missing or invalid "ticker" in body' });
    }
    const cardContent = await generateNewsCard(symbol);
    if (!cardContent) {
      return res.json({
        success: true,
        marketMood: 'No recent news available for this symbol.',
        cards: [],
        allStable: true,
        timestamp: new Date().toISOString()
      });
    }
    const card = {
      symbol,
      headline: cardContent.title,
      title: cardContent.title,
      content: cardContent.content,
      explanation: { classification: { eventType: 'news' as const } }
    };
    res.json({
      success: true,
      marketMood: 'Recent news for this holding.',
      cards: [card],
      allStable: false,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[NEWS-FEED ERROR]', err.message);
    res.status(500).json({ error: `News feed failed: ${err.message}` });
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

    // Validate ticker format (1-5 uppercase letters)
    if (!/^[A-Z]{1,5}$/.test(ticker.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid ticker format. Must be 1-5 letters.' });
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
// App-compatible: GET /health returns status "healthy"
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

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
  console.log(`   POST   /api/chat/external         - App adapter (message, sessionId)`);
  console.log(`   GET    /api/checkup/:ticker      - Deep dive stock analysis`);
  console.log(`   POST   /api/holding-checkup       - App proxy (ticker, type?, name?)`);
  console.log(`   GET    /api/news/:ticker         - News for a specific stock`);
  console.log(`   GET    /api/news-feed/:ticker    - News card in feed shape (marketMood, cards, allStable)`);
  console.log(`   POST   /api/news-feed           - iOS (body: { ticker })`);
  console.log(`   GET    /api/snapshot/:ticker     - Stock snapshot (vs S&P 500, valuation, fundamentals)`);
  console.log(`   POST   /api/snapshot             - iOS app (body: { ticker, type? })`);
  console.log(`   GET    /api/industry-comparison/:ticker - Industry comparison (snapshot, vs industry, verdict)`);
  console.log(`   POST   /api/industry-comparison  - Batch (body: { ticker } or { symbols: [] })`);
  console.log(`   GET    /api/daily-check/:ticker  - Daily re-rating monitor (?story=true for Rabbit Story)`);
  console.log(`   POST   /api/daily-check          - Batch (body: { ticker } or { symbols: [] }, story?: true)`);
  console.log(`   GET    /api/feed                - Feed (?symbols=AAPL,MSFT & ?mode=retail for B2C calm view)`);
  console.log(`   POST   /api/feed                - Feed (body: { symbols: [] }, mode: 'retail' for B2C)`);
  console.log(`   GET    /api/earnings-recap/:ticker - Last earnings quick recap (when relevant)`);
  console.log(`   GET    /api/earnings-recap-feed/:ticker - Earnings recap in feed shape only (marketMood, cards, allStable, timestamp)`);
  console.log(`   GET    /api/digest               - Daily market digest`);
  console.log(`   GET    /health                   - App health check (status: healthy)`);
  console.log(`   GET    /api/health               - Health check (status: ok)\n`);
  console.log(`   Query Parameters:`);
  console.log(`   - noobMode=true                 - Use beginner-friendly format`);
  console.log(`   - json=true                     - Return raw JSON data`);
  console.log(`   - symbols=AAPL,MSFT             - Watchlist for digest\n`);
});
