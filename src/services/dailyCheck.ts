/**
 * Daily Check Service — Institutional re-rating monitor
 *
 * Two engines:
 * - Base Engine (weekly): Re-rating Probability Score 0–100
 * - Daily Engine: Thesis Change Score –10 to +10 (pulse)
 *
 * Scoring:
 * 1. Earnings & Estimate Movement: EPS 7d (0–15), EPS 30d (0–10), Revenue 30d (0–5), Directional (0–10)
 * 2. Price vs Fundamentals Divergence (0–20): asymmetric
 * 3. Cash Flow & Valuation Compression (0–25): FCF yield + revision context
 * 4. Risk Change (0–15): downgrades, insider, no earnings-by-default
 */

import axios from 'axios';
import { getValuation } from '../tools/valuationExtractor';
import { getEarningsCalendar } from '../tools/earningsCalendar';
import { runIndustryComparison } from './industryComparison';
import {
  saveSnapshot,
  computeRevisionDeltas,
  computeRevisionStdDev,
  type RevisionDeltas
} from './estimateSnapshotStore';
import { getEarningsRecap, earningsRecapRelevance, type EarningsRecapWithRelevance } from './earningsRecap';
import {
  saveShortInterestSnapshot,
  computeShortInterestDeltas
} from './shortInterestSnapshotStore';
import {
  saveInstitutionalSnapshot,
  computeInstitutionalDeltas
} from './institutionalSnapshotStore';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';
const GSPC = '^GSPC';

const p = (params: Record<string, unknown>) => ({
  params: { ...params, apikey: FMP_API_KEY },
  headers: { apikey: FMP_API_KEY } as Record<string, string>
});

function num(val: unknown): number | null {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function formatYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// --- Price history ---
interface EodPoint {
  date: string;
  price?: number;
  close?: number;
  adjClose?: number;
  adj_close?: number;
  volume?: number;
  [k: string]: unknown;
}

function getClose(p: EodPoint): number | undefined {
  const c = p.adjClose ?? p.adj_close ?? p.price ?? p.close;
  return typeof c === 'number' && Number.isFinite(c) ? c : undefined;
}

function annualizedVol30d(points: EodPoint[]): number | null {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const closes: number[] = [];
  for (const p of sorted) {
    const c = getClose(p);
    if (c != null && c > 0) closes.push(c);
  }
  if (closes.length < 5) return null;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const r = Math.log(closes[i]! / closes[i - 1]!);
    returns.push(r);
  }
  const recent = returns.slice(-30);
  if (recent.length < 5) return null;
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((s, r) => s + (r - mean) ** 2, 0) / recent.length;
  const std = Math.sqrt(variance);
  const annualized = std * Math.sqrt(252) * 100;
  return Number.isFinite(annualized) ? Math.round(annualized * 10) / 10 : null;
}

function priceChangePct(points: EodPoint[], days: number): number | null {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latest = getClose(sorted[0]!);
  const target = new Date();
  target.setDate(target.getDate() - days);
  const targetStr = formatYMD(target);
  let prior: number | undefined;
  for (const pt of sorted) {
    if (pt.date <= targetStr) {
      prior = getClose(pt);
      break;
    }
  }
  if (latest == null || prior == null || prior <= 0) return null;
  return ((latest - prior) / prior) * 100;
}

async function fetchPriceHistory(symbol: string, days: number): Promise<EodPoint[]> {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  try {
    const res = await axios.get<EodPoint[]>(`${BASE}/historical-price-eod/light`, p({ symbol, from: formatYMD(from), to: formatYMD(to) }));
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

interface AnalystEstimateRow {
  date?: string;
  epsAvg?: number;
  epsHigh?: number;
  epsLow?: number;
  estimatedEpsHigh?: number;
  estimatedEpsLow?: number;
  revenueAvg?: number;
  numAnalystsEps?: number;
  numAnalystsRevenue?: number;
  [k: string]: unknown;
}

async function fetchAnalystEstimates(symbol: string): Promise<AnalystEstimateRow[]> {
  try {
    const res = await axios.get<AnalystEstimateRow[]>(`${BASE}/analyst-estimates`, p({ symbol, period: 'annual', limit: 8 }));
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

interface KeyMetricsRow {
  date?: string;
  freeCashFlowYield?: number;
  peRatio?: number;
  [k: string]: unknown;
}

async function fetchKeyMetricsHistory(symbol: string): Promise<KeyMetricsRow[]> {
  try {
    const res = await axios.get<KeyMetricsRow[]>(`${BASE}/key-metrics`, p({ symbol, limit: 4 }));
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

async function fetchProfileBeta(symbol: string): Promise<number | null> {
  try {
    const res = await axios.get<Array<{ beta?: number }>>(`${BASE}/profile`, p({ symbol }));
    const profile = Array.isArray(res.data) ? res.data[0] : null;
    const b = profile?.beta;
    return b != null && Number.isFinite(b) ? b : null;
  } catch {
    return null;
  }
}

interface UpgradeDowngradeRow {
  date?: string;
  action?: string;
  [k: string]: unknown;
}

async function fetchSharesFloat(symbol: string): Promise<{ floatShares?: number; sharesOutstanding?: number } | null> {
  try {
    const res = await axios.get<Array<{ floatShares?: number; sharesOutstanding?: number; freeFloat?: number }>>(`${BASE}/shares-float`, p({ symbol })).catch(() => ({ data: [] }));
    const arr = Array.isArray(res.data) ? res.data : [];
    return arr[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchInstitutionalOwnership(symbol: string): Promise<{ pctInstitutional?: number; investorCount?: number } | null> {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    const res = await axios
      .get<Record<string, unknown> | Record<string, unknown>[]>(`${BASE}/institutional-ownership/symbol-positions-summary`, p({ symbol, year, quarter }))
      .catch(() => ({ data: null }));
    const raw = res.data;
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const d = arr[0] as Record<string, unknown> | undefined;
    if (!d || typeof d !== 'object') return null;
    const pct = num(d.institutionalOwnershipPercent ?? d.institutionalPercent ?? d.ownershipPercent);
    const count = num(d.investorCount ?? d.institutionalInvestorCount);
    return pct != null ? { pctInstitutional: pct, investorCount: count ?? undefined } : null;
  } catch {
    return null;
  }
}

async function fetchETFExposure(symbol: string): Promise<{ etfConcentrationPct: number; topEtfs: string[] } | null> {
  try {
    const res = await axios
      .get<Array<{ etfSymbol?: string; weight?: number; etfName?: string }>>(`${BASE}/etf/asset-exposure`, p({ symbol }))
      .catch(() => ({ data: [] }));
    const arr = Array.isArray(res.data) ? res.data : [];
    if (arr.length === 0) return null;
    const top5 = arr.slice(0, 5);
    const sumWeight = top5.reduce((s, r) => {
      const w = num(r.weight) ?? 0;
      return s + (w <= 1 && w > 0 ? w * 100 : w);
    }, 0);
    const topEtfs = top5.map((r) => r.etfSymbol ?? r.etfName ?? '?').filter(Boolean);
    return { etfConcentrationPct: Math.round(sumWeight * 10) / 10, topEtfs };
  } catch {
    return null;
  }
}

async function fetchSp500Constituent(symbol: string): Promise<{ isSp500: boolean; weightPct?: number }> {
  try {
    const res = await axios
      .get<Array<{ symbol?: string; weight?: number }>>(`${BASE}/sp500-constituent`, p({}))
      .catch(() => ({ data: [] }));
    const arr = Array.isArray(res.data) ? res.data : [];
    const match = arr.find((r) => (r.symbol ?? '').toUpperCase() === symbol.toUpperCase());
    if (match) {
      const w = num(match.weight);
      return { isSp500: true, weightPct: w ?? undefined };
    }
    return { isSp500: false };
  } catch {
    return { isSp500: false };
  }
}

async function fetchOptionsData(symbol: string): Promise<{ ivPercentile?: number; putCallRatio?: number } | null> {
  try {
    const res = await axios
      .get<Record<string, unknown> | Record<string, unknown>[]>(`${BASE}/options/volatility`, p({ symbol }))
      .catch(() => null);
    if (!res?.data) return null;
    const raw = res.data;
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const d = arr[0] as Record<string, unknown> | undefined;
    if (!d) return null;
    const ivPct = num(d.ivPercentile ?? d.impliedVolatilityPercentile);
    const pcr = num(d.putCallRatio ?? d.putCall);
    return ivPct != null || pcr != null ? { ivPercentile: ivPct ?? undefined, putCallRatio: pcr ?? undefined } : null;
  } catch {
    return null;
  }
}

async function fetchShortInterest(symbol: string): Promise<{ shortInterest?: number; shortPercentOfFloat?: number; shortRatio?: number } | null> {
  try {
    const res = await axios.get<Array<Record<string, unknown>>>(`${BASE}/short-interest`, p({ symbol })).catch(() => ({ data: [] }));
    const arr = Array.isArray(res.data) ? res.data : [];
    const row = arr[0];
    if (!row) return null;
    const shortInterest = num(row.shortInterest ?? row.short_interest);
    const shortPercentOfFloat = num(row.shortPercentOfFloat ?? row.shortPercentOfShares ?? row.short_percent_of_float);
    const shortRatio = num(row.shortRatio ?? row.short_ratio ?? row.daysToCover);
    return { shortInterest: shortInterest ?? undefined, shortPercentOfFloat: shortPercentOfFloat ?? undefined, shortRatio: shortRatio ?? undefined };
  } catch {
    return null;
  }
}

async function fetchUpgradesDowngrades(symbol: string, days = 7): Promise<UpgradeDowngradeRow[]> {
  try {
    const res = await axios.get<UpgradeDowngradeRow[]>(`${BASE}/analyst-upgrades-downgrades`, p({ symbol })).catch(() => ({ data: [] }));
    const list = Array.isArray(res.data) ? res.data : [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return list.filter((r) => r.date && new Date(r.date) >= cutoff);
  } catch {
    return [];
  }
}

interface InsiderRow {
  filingDate?: string;
  transactionType?: string;
  acquistionOrDisposition?: string;
  value?: number;
  [k: string]: unknown;
}

async function fetchInsiderTrades(symbol: string, days = 365): Promise<InsiderRow[]> {
  try {
    const res = await axios.get<InsiderRow[]>(`${BASE}/insider-trading`, p({ symbol })).catch(() => ({ data: [] }));
    const list = Array.isArray(res.data) ? res.data : [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return list.filter((r) => r.filingDate && new Date(r.filingDate) >= cutoff);
  } catch {
    return [];
  }
}

// --- Types ---
export type ThesisStatus = 'Improving' | 'Stable' | 'Deteriorating';
export type RevisionDirection = 'up' | 'flat' | 'down';
export type DivergenceSignal = 'Positive divergence' | 'Risk divergence' | 'Neutral' | null;
export type RiskSeverity = 'high' | 'medium' | 'low';

export interface SignalExplanation {
  type: string;
  emoji: string;
  lines: string[];
}

export interface RiskAlert {
  severity: RiskSeverity;
  message: string;
}

export interface RiskScoreItem {
  label: string;
  delta: number;
}

export interface StructuralRisk {
  level: 'Low' | 'Elevated' | 'High';
  ndToEbitda: number | null;
  /** For display: −4, −2, or 0. Does NOT affect daily pulse. */
  score: number;
  /** When ND/EBITDA < 0: "Net Cash Position" | "Negative EBITDA Risk" | null */
  structuralRiskNote: string | null;
}

export interface FlowRisk {
  level: 'Low' | 'Increasing' | 'Elevated';
  /** Flow risk items that drive daily pulse */
  items: RiskScoreItem[];
  /** Sum of flow items (negative). Drives Risk Change Score (7d). */
  score: number;
}

export interface DailyCheckResult {
  symbol: string;
  companyName?: string;
  timestamp: string;
  /** Base re-rating score (weekly) — from industry comparison */
  baseScore: {
    total: number;
    interpretation: string;
  } | null;
  /** Daily pulse: –10 to +10 */
  dailyPulse: number;
  thesisStatus: ThesisStatus;
  confidence: 'high' | 'medium' | 'low';
  /** Structured output */
  revisions: {
    eps7d: number | null;
    eps30d: number | null;
    revenue30d: number | null;
    direction: RevisionDirection | null;
    /** Current EPS estimate (next FY) */
    epsNow: number | null;
    /** Prior EPS estimate (for context: "revised from X → Y") */
    priorEps: number | null;
    /** Historical std dev of 7d revision % (for surpriseScore) */
    stdDev7d: number | null;
    /** Historical std dev of 30d revision % */
    stdDev30d: number | null;
  };
  valuation: { fcfYieldChange: number | null; fcfYieldNow: number | null };
  price: { change7d: number | null; change30d: number | null };
  /** vs S&P 500 (outperformance in pp): positive = outperforming */
  relativeStrength: { vsSp500_7d: number | null; vsSp500_30d: number | null };
  signal: DivergenceSignal;
  signalExplanation: SignalExplanation;
  riskAlerts: RiskAlert[];
  structuralRisk: StructuralRisk;
  flowRisk: FlowRisk;
  clusterRiskDetected: boolean;
  clusterInteractionNote: string | null;
  sensitivityNote: string | null;
  pillars: {
    revisionDelta: number;
    valuationCompression: number;
    divergence: number;
    riskChange: number;
  };
  /** Has true daily-stored revision history (vs FMP fallback) */
  hasStoredRevisionHistory: boolean;
  /** Revision spike flag when >10% in 7d */
  revisionMagnitudeFlag: boolean;
  /** Mega-cap with >10% revision in 7d — plausible data glitch, flag as unusual */
  unusualRevisionSpikeFlag: boolean;
  /** Market cap >= $200B (for dominant signal engine) */
  isMegaCap: boolean;
  /** Market cap in USD (for mega-cap severity cap) */
  marketCap: number | null;
  /** Cyclical sector (travel, cruise, airlines) — leverage/FCF need context */
  isCyclicalSector: boolean;
  /** Conviction tier: type of risk/opportunity (e.g. Defensive Divergence, Leveraged Cyclical Rebound) */
  setupType: string;
  /** Position sizing suggestion (e.g. Core position candidate, Tactical / high-volatility allocation) */
  positioning: string;
  /** Sector median ND/EBITDA (from industry comparison) — for leverage context */
  sectorMedianNDtoEbitda: number | null;
  /** Beta vs S&P 500 (volatility context) */
  betaVsSp500: number | null;
  /** Time horizon bias (e.g. Short–Medium term tactical / Long-term dependent on deleveraging) */
  timeHorizonBias: string | null;
  /** Large 30d price move (>20%) — event/earnings/macro/regulatory context flag */
  volatilityAlertFlag: boolean;
  /** Very large 30d move (>30%) — uncertainty elevated, ongoing repricing */
  uncertaintyElevatedFlag: boolean;
  /** Major estimate recalibration (>20% in 7d) — earnings/regulatory/guidance reset */
  majorRecalibrationFlag: boolean;
  /** Prior EPS base small (<$0.10) + large % change — distorts reliability */
  revisionReliabilityWarning: boolean;
  /** Negative FCF yield — cash burn / profitability concern */
  negativeFcfFlag: boolean;
  /** Show "Low–Medium" confidence when medium but high uncertainty */
  highUncertaintyTemperConfidence: boolean;
  /** Recent vol exceeds historical beta (event-driven vol vs beta profile) */
  volatilityExceedsBetaFlag: boolean;
  /** Revision Breadth: analyst count, dispersion, conviction (institutions care about consensus) */
  revisionBreadth: {
    analystCount: number | null;
    dispersionPct: number | null;
    dispersionTrend: 'narrowing' | 'widening' | 'stable' | null;
    conviction: 'High' | 'Medium' | 'Low' | null;
    /** Note when per-analyst % revising up/down unavailable */
    dataSourceNote: string | null;
  };
  /** Short Interest: positioning & flow (who is trapped, squeeze potential) */
  shortInterest: {
    pctFloatShort: number | null;
    change30dPct: number | null;
    daysToCover: number | null;
    dataSourceNote: string | null;
  };
  /** Institutional Ownership: smart money accumulation, ETF concentration */
  institutionalOwnership: {
    pctInstitutional: number | null;
    change30dPp: number | null;
    investorCount: number | null;
    etfConcentrationPct: number | null;
    topEtfs: string[];
    dataSourceNote: string | null;
  };
  /** Options Skew & Implied Vol: positioning flip, squeeze fuel */
  optionsSkewIv: {
    ivPercentile: number | null;
    putCallRatio: number | null;
    historicalVol30d: number | null;
    dataSourceNote: string | null;
  };
  /** Passive Flow Sensitivity: index weight, ETF ownership — re-ratings accelerate when passive inflows triggered */
  passiveFlow: {
    isSp500Constituent: boolean;
    sp500WeightPct: number | null;
    etfConcentrationPct: number | null;
    topEtfs: string[];
    dataSourceNote: string | null;
  };
  /** Last earnings recap; only relevant when shouldShow (7d post, or revision spike, or price move) */
  earningsRecap: EarningsRecapWithRelevance | null;
  /** Earnings within 7 days — used for catalyst scan trigger (news) */
  earningsUpcoming7d: boolean;
}

/**
 * Run daily check for one symbol.
 */
export async function runDailyCheck(symbol: string): Promise<DailyCheckResult> {
  const sym = symbol.toUpperCase();
  const timestamp = new Date().toISOString();

  const [valuation, priceHistory, sp500History, estimates, metricsHistory, profileBeta, upgradesDowngrades, insiderTrades, earningsResp, industryResult, sharesFloat, shortInterestRaw, institutionalRaw, etfExposure, optionsRaw, sp500Constituent] = await Promise.all([
    getValuation({ symbol: sym }),
    fetchPriceHistory(sym, 220),
    fetchPriceHistory(GSPC, 40),
    fetchAnalystEstimates(sym),
    fetchKeyMetricsHistory(sym),
    fetchProfileBeta(sym),
    fetchUpgradesDowngrades(sym, 7),
    fetchInsiderTrades(sym, 365),
    getEarningsCalendar({ symbol: sym }),
    runIndustryComparison(sym).catch(() => null),
    fetchSharesFloat(sym),
    fetchShortInterest(sym),
    fetchInstitutionalOwnership(sym),
    fetchETFExposure(sym),
    fetchOptionsData(sym),
    fetchSp500Constituent(sym)
  ]);

  const companyName = (valuation as { companyName?: string }).companyName ?? undefined;

  // --- Next FY estimates (FMP index 0 = next fiscal year) ---
  const e0 = estimates[0];
  const epsNow = e0?.epsAvg != null ? num(e0.epsAvg) : null;
  const revNow = e0?.revenueAvg != null ? num(e0.revenueAvg) : null;
  const epsHigh = num(e0?.epsHigh ?? e0?.estimatedEpsHigh);
  const epsLow = num(e0?.epsLow ?? e0?.estimatedEpsLow);
  const analystCount = e0?.numAnalystsEps != null ? num(e0.numAnalystsEps) : (e0?.numAnalystsRevenue != null ? num(e0.numAnalystsRevenue) : null);

  let deltas: RevisionDeltas;
  if (epsNow != null && revNow != null) {
    const opts =
      analystCount != null && epsHigh != null && epsLow != null
        ? { numberOfAnalysts: analystCount, epsHigh, epsLow }
        : undefined;
    saveSnapshot(sym, epsNow, revNow, opts);
    deltas = computeRevisionDeltas(sym, epsNow, revNow);
    if (!deltas.hasStoredHistory) {
      const e1 = estimates[1];
      const epsPrior = e1?.epsAvg != null ? num(e1.epsAvg) : null;
      const revPrior = e1?.revenueAvg != null ? num(e1.revenueAvg) : null;
      if (epsPrior != null && epsPrior !== 0) {
        deltas.eps7dPct = ((epsNow - epsPrior) / Math.abs(epsPrior)) * 100;
        deltas.eps30dPct = deltas.eps7dPct;
      }
      if (revPrior != null && revPrior !== 0) {
        deltas.revenue30dPct = ((revNow - revPrior) / Math.abs(revPrior)) * 100;
      }
    }
  } else {
    deltas = {
      eps7dPct: null,
      eps30dPct: null,
      revenue30dPct: null,
      hasStoredHistory: false,
      priorEps7d: null,
      priorDispersion7d: null,
      priorDispersion30d: null
    };
  }
  if (!deltas.hasStoredHistory) {
    const e1 = estimates[1];
    const epsPriorFallback = e1?.epsAvg != null ? num(e1.epsAvg) : null;
    (deltas as { priorEps7d: number | null }).priorEps7d = epsPriorFallback;
  }

  const eps7d = deltas.eps7dPct;
  const eps30d = deltas.eps30dPct;
  const rev30d = deltas.revenue30dPct;

  const revisionDirection: RevisionDirection =
    eps7d != null
      ? eps7d > 0.5
        ? 'up'
        : eps7d < -0.5
          ? 'down'
          : 'flat'
      : eps30d != null
        ? eps30d > 0.5
          ? 'up'
          : eps30d < -0.5
            ? 'down'
            : 'flat'
        : 'flat';

  // --- 1. Earnings & Estimate Movement (0–40): EPS 7d (0–15), EPS 30d (0–10), Revenue 30d (0–5), Directional (0–10) ---
  let eps7dScore = 7.5;
  if (eps7d != null) {
    if (eps7d > 2) eps7dScore = Math.min(15, 7.5 + eps7d * 2);
    else if (eps7d > 0.5) eps7dScore = 9 + eps7d;
    else if (eps7d < -2) eps7dScore = Math.max(0, 7.5 + eps7d * 2);
    else if (eps7d < -0.5) eps7dScore = 6 + eps7d;
  }

  let eps30dScore = 5;
  if (eps30d != null) {
    if (eps30d > 2) eps30dScore = Math.min(10, 5 + eps30d);
    else if (eps30d > 0.5) eps30dScore = 6;
    else if (eps30d < -2) eps30dScore = Math.max(0, 5 + eps30d * 0.5);
    else if (eps30d < -0.5) eps30dScore = 4;
  }

  let rev30dScore = 2.5;
  if (rev30d != null) {
    if (rev30d > 1) rev30dScore = Math.min(5, 2.5 + rev30d * 0.5);
    else if (rev30d < -1) rev30dScore = Math.max(0, 2.5 + rev30d * 0.5);
  }

  const directionalScore = revisionDirection === 'up' ? 10 : revisionDirection === 'flat' ? 5 : 0;

  const revisionDelta = Math.round(Math.min(40, Math.max(0, eps7dScore + eps30dScore + rev30dScore + directionalScore)));

  // --- 2. Price vs Fundamentals Divergence (0–20): asymmetric ---
  const priceChange7dPct = priceChangePct(priceHistory, 7);
  const priceChange30dPct = priceChangePct(priceHistory, 30);

  const sp500Change7d = priceChangePct(sp500History, 7);
  const sp500Change30d = priceChangePct(sp500History, 30);
  const vsSp500_7d =
    priceChange7dPct != null && sp500Change7d != null
      ? Math.round((priceChange7dPct - sp500Change7d) * 10) / 10
      : null;
  const vsSp500_30d =
    priceChange30dPct != null && sp500Change30d != null
      ? Math.round((priceChange30dPct - sp500Change30d) * 10) / 10
      : null;

  let divergenceScore = 10;
  let signal: DivergenceSignal = 'Neutral';
  let signalExplanation: SignalExplanation = { type: 'Neutral', emoji: '🟡', lines: [] };

  if (priceChange7dPct != null) {
    const price7 = `${priceChange7dPct >= 0 ? '+' : ''}${priceChange7dPct.toFixed(1)}%`;
    const epsRev = eps30d != null ? `${eps30d >= 0 ? '+' : ''}${eps30d.toFixed(1)}%` : eps7d != null ? `${eps7d >= 0 ? '+' : ''}${eps7d.toFixed(1)}%` : null;
    if (revisionDirection === 'up' && priceChange7dPct < -2) {
      divergenceScore = 20;
      signal = 'Positive divergence';
      signalExplanation = {
        type: 'Positive Divergence',
        emoji: '🟢',
        lines: [
          `Price ${price7} (7d)`,
          epsRev ? `EPS revisions ${epsRev} (${eps30d != null ? '30d' : '7d'})` : 'EPS revisions up'
        ]
      };
    } else if (revisionDirection === 'flat' && priceChange7dPct < -2) {
      divergenceScore = 13;
      signalExplanation = { type: 'Neutral', emoji: '🟡', lines: [`Price ${price7} (7d)`, 'EPS revisions flat'] };
    } else if (revisionDirection === 'down' && (priceChange7dPct > 3 || priceChange7dPct > 0)) {
      divergenceScore = priceChange7dPct > 3 ? 0 : 5;
      signal = 'Risk divergence';
      signalExplanation = {
        type: 'Risk Divergence',
        emoji: '🔴',
        lines: [
          `Price ${price7} (7d)`,
          epsRev ? `EPS revisions ${epsRev} (30d)` : 'EPS revisions down'
        ]
      };
    } else {
      signalExplanation = {
        type: 'Neutral',
        emoji: '🟡',
        lines: [`Price ${price7} (7d)`, epsRev ? `EPS revisions ${epsRev}` : `Direction: ${revisionDirection}`]
      };
    }
  }

  // --- 3. Valuation Compression (0–25): FCF yield + revision context ---
  const fcfYieldNow = (valuation as { freeCashFlowYield?: number }).freeCashFlowYield ?? null;
  const m1 = metricsHistory[1];
  const fcfRaw = m1?.freeCashFlowYield != null ? num(m1.freeCashFlowYield) : null;
  const fcfYieldPrior = fcfRaw != null ? fcfRaw * 100 : null;
  const fcfYieldChange = fcfYieldNow != null && fcfYieldPrior != null ? fcfYieldNow - fcfYieldPrior : null;

  let valuationCompression = 12;
  if (fcfYieldChange != null) {
    if (fcfYieldChange > 0) {
      if (revisionDirection === 'up' || revisionDirection === 'flat') {
        valuationCompression = Math.min(25, 12 + fcfYieldChange * 3);
      } else {
        valuationCompression = 12;
      }
    } else if (fcfYieldChange < -1) {
      valuationCompression = Math.max(0, 12 + fcfYieldChange * 2);
    }
  }
  if (fcfYieldNow != null && fcfYieldNow <= 0) {
    valuationCompression = Math.min(10, valuationCompression);
  }

  // --- 4. Risk: Structural (balance sheet, stable) vs Flow (7d, volatile) ---
  const downgradeCount7d = upgradesDowngrades.filter((r) => /downgrade|sell|underperform/i.test(String(r.action || ''))).length;
  const insiderSells = insiderTrades.filter((r) => /sell|s|disposition/i.test(String(r.transactionType || r.acquistionOrDisposition || '')));
  const insiderSellValue12m = insiderSells.reduce((sum, r) => sum + (num(r.value) ?? 0), 0);
  const weeklyAvgInsiderSell = insiderSellValue12m / 52;
  const recent7dSells = insiderSells.filter((r) => {
    const d = r.filingDate ? new Date(r.filingDate) : null;
    return d && (Date.now() - d.getTime()) / (24 * 60 * 60 * 1000) <= 7;
  });
  const recent7dInsiderValue = recent7dSells.reduce((sum, r) => sum + (num(r.value) ?? 0), 0);

  const nd = valuation.netDebtToEBITDA;
  const sector = (valuation as { sector?: string }).sector ?? '';
  const industry = (valuation as { industry?: string }).industry ?? '';
  const sectorIndustry = `${sector} ${industry}`.toLowerCase();
  const isCyclicalSector = /travel|leisure|cruise|airline|lodging|consumer cyclical|hospitality/i.test(sectorIndustry);

  // --- Structural Risk (balance sheet): steeper penalty for high leverage ---
  // ND/EBITDA >7 → -8, >5 → -6, >3 → -4, 2-3 → -2. ND < 0 → Net Cash or Negative EBITDA.
  const m0Metrics = metricsHistory[0];
  const ebitdaRaw = m0Metrics?.ebitda ?? m0Metrics?.EBITDA;
  const ebitda = ebitdaRaw != null ? num(ebitdaRaw) : null;

  let structuralLevel: StructuralRisk['level'] = 'Low';
  let structuralScore = 0;
  let structuralRiskNote: string | null = null;
  if (nd != null) {
    if (nd < 0) {
      structuralLevel = 'Low';
      structuralScore = 0;
      if (ebitda != null && ebitda <= 0) {
        structuralRiskNote = 'Negative EBITDA Risk';
      } else {
        structuralRiskNote = 'Net Cash Position';
      }
    } else if (nd > 7) {
      structuralLevel = 'High';
      structuralScore = -8;
    } else if (nd > 5) {
      structuralLevel = 'High';
      structuralScore = -6;
    } else if (nd > 3) {
      structuralLevel = 'High';
      structuralScore = -4;
    } else if (nd >= 2) {
      structuralLevel = 'Elevated';
      structuralScore = -2;
    }
  }
  const structuralRisk: StructuralRisk = {
    level: structuralLevel,
    ndToEbitda: nd ?? null,
    score: structuralScore,
    structuralRiskNote
  };

  // --- Flow Risk (7d): downgrades, insider spike. Drives daily pulse. ---
  const flowItems: RiskScoreItem[] = [];
  let downgradeDelta = 0;
  if (downgradeCount7d >= 4) {
    downgradeDelta = -3;
    flowItems.push({ label: `Downgrades (${downgradeCount7d} in 7d)`, delta: -3 });
  } else if (downgradeCount7d >= 2) {
    downgradeDelta = -2;
    flowItems.push({ label: `Downgrades (${downgradeCount7d} in 7d)`, delta: -2 });
  } else if (downgradeCount7d >= 1) {
    downgradeDelta = -1;
    flowItems.push({ label: 'Analyst downgrade', delta: -1 });
  }

  let insiderDelta = 0;
  if (weeklyAvgInsiderSell > 0 && recent7dInsiderValue > 4 * weeklyAvgInsiderSell) {
    insiderDelta = -2;
    flowItems.push({ label: 'Insider selling > 4x 12m weekly avg', delta: -2 });
  } else if (weeklyAvgInsiderSell > 0 && recent7dInsiderValue > 2 * weeklyAvgInsiderSell) {
    insiderDelta = -1;
    flowItems.push({ label: 'Insider selling > 2x 12m weekly avg', delta: -1 });
  }

  const mediumFlowCount = (downgradeCount7d >= 2 ? 1 : 0) + (insiderDelta !== 0 ? 1 : 0);
  const clusterRiskDetected = mediumFlowCount >= 2;
  const clusterDelta = clusterRiskDetected ? -1 : 0;
  if (clusterRiskDetected) {
    flowItems.push({ label: 'Cluster escalation (≥2 medium in 7d)', delta: -1 });
  }

  const flowScore = downgradeDelta + insiderDelta + clusterDelta;
  const flowLevel: FlowRisk['level'] = flowScore <= -4 ? 'Elevated' : flowScore <= -1 ? 'Increasing' : 'Low';

  const flowRisk: FlowRisk = { level: flowLevel, items: flowItems, score: flowScore };

  const clusterInteractionNote =
    clusterRiskDetected && structuralLevel !== 'Low'
      ? 'Elevated leverage combined with downgrade activity increases downside sensitivity.'
      : null;

  const sensitivityNote =
    nd != null && nd >= 2
      ? isCyclicalSector
        ? `At ${nd.toFixed(1)}x leverage (cyclical sector), earnings volatility may amplify equity volatility.`
        : `At ${nd.toFixed(1)}x leverage, earnings volatility may amplify equity volatility.`
      : null;

  const revisionMagnitudeFlag = eps7d != null && Math.abs(eps7d) > 10;
  const marketCap = (valuation as { marketCap?: number }).marketCap;
  const isMegaCap = marketCap != null && marketCap >= 200e9; // $200B+
  const unusualRevisionSpikeFlag = revisionMagnitudeFlag && isMegaCap;
  const volatilityAlertFlag = priceChange30dPct != null && Math.abs(priceChange30dPct) > 20;
  const uncertaintyElevatedFlag = priceChange30dPct != null && Math.abs(priceChange30dPct) > 30;
  const majorRecalibrationFlag = eps7d != null && Math.abs(eps7d) > 20;
  const priorEps7d = deltas.priorEps7d;
  const revisionReliabilityWarning =
    priorEps7d != null && Math.abs(priorEps7d) < 0.1 && eps7d != null && Math.abs(eps7d) > 50;
  const negativeFcfFlag = fcfYieldNow != null && fcfYieldNow <= 0;

  // --- Pillar risk: neutral 8 + flow only (structural excluded from daily) ---
  const riskChange = Math.max(0, Math.min(15, 8 + flowScore));

  // --- Severity-tiered risk alerts ---
  const riskAlerts: RiskAlert[] = [];
  if (nd != null && nd > 5) {
    riskAlerts.push({ severity: 'high', message: `Elevated leverage: Net Debt/EBITDA ${nd.toFixed(1)}x${isCyclicalSector ? ' (cyclical sensitivity)' : ''}` });
  } else if (nd != null && nd > 3) {
    riskAlerts.push({ severity: 'high', message: `High leverage: Net Debt/EBITDA ${nd.toFixed(1)}x` });
  } else if (nd != null && nd >= 2) {
    riskAlerts.push({ severity: 'medium', message: `Elevated leverage: Net Debt/EBITDA ${nd.toFixed(1)}x` });
  }
  if (eps30d != null && eps30d <= -5) {
    riskAlerts.push({ severity: 'high', message: `5%+ downward EPS revision (30d): ${eps30d.toFixed(1)}%` });
  }
  if (downgradeCount7d >= 2) {
    riskAlerts.push({ severity: 'medium', message: `${downgradeCount7d} analyst downgrades (7d)` });
  } else if (downgradeCount7d >= 1) {
    riskAlerts.push({ severity: 'low', message: `${downgradeCount7d} analyst downgrade (7d)` });
  }
  if (insiderDelta !== 0) {
    const msg = insiderDelta <= -2
      ? 'Insider selling > 4x 12m weekly average'
      : 'Insider selling > 2x 12m weekly average';
    riskAlerts.push({ severity: 'medium', message: msg });
  }
  const earningsEvents = earningsResp.events ?? [];
  const now = new Date();
  const earningsUpcoming = earningsEvents.some((ev) => {
    const d = ev.date ? new Date(ev.date) : null;
    return d && d >= now && (d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000) <= 14;
  });
  const earningsUpcoming7d = earningsEvents.some((ev) => {
    const d = ev.date ? new Date(ev.date) : null;
    return d && d >= now && (d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000) <= 7;
  });
  if (earningsUpcoming && revisionDirection === 'down') {
    riskAlerts.push({ severity: 'medium', message: 'Earnings within 14 days + negative revisions' });
  }
  if (priceChange7dPct != null && priceChange7dPct > 5 && revisionDirection !== 'up') {
    riskAlerts.push({ severity: 'low', message: `Price +${priceChange7dPct.toFixed(1)}% (7d) without positive revisions` });
  }

  const severityOrder: RiskSeverity[] = ['high', 'medium', 'low'];
  riskAlerts.sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));

  // --- Thesis: daily delta –10 to +10, thresholds ±5 ---
  const pillarTotal = revisionDelta + valuationCompression + divergenceScore + riskChange;
  const neutralTotal = 20 + 12 + 10 + 8;
  const dailyPulse = Math.round(Math.max(-10, Math.min(10, (pillarTotal - neutralTotal) / 5)));

  let thesisStatus: ThesisStatus = 'Stable';
  if (dailyPulse >= 5) thesisStatus = 'Improving';
  else if (dailyPulse <= -5) thesisStatus = 'Deteriorating';

  // --- Confidence from momentum (context only) ---
  const price50 = priceChangePct(priceHistory, 50);
  const price200 = priceChangePct(priceHistory, 200);
  const ma50vs200 = price50 != null && price200 != null ? (price50 > price200 ? 'above' : 'below') : null;

  let confidence: 'high' | 'medium' | 'low' = 'medium';
  const highLeverage = nd != null && nd > 5;
  if (thesisStatus === 'Improving' && ma50vs200 === 'above') {
    confidence = highLeverage ? 'medium' : 'high';
  } else if (thesisStatus === 'Improving' && ma50vs200 === 'below') {
    confidence = 'medium';
  } else if (thesisStatus === 'Deteriorating' && ma50vs200 === 'below') {
    confidence = 'low';
  } else if (thesisStatus === 'Deteriorating' && ma50vs200 === 'above') {
    confidence = 'medium';
  }
  if (volatilityAlertFlag && confidence === 'high') {
    confidence = 'medium';
  }
  const baseScore = industryResult?.reRatingProbabilityScore
    ? { total: industryResult.reRatingProbabilityScore.total, interpretation: industryResult.reRatingProbabilityScore.interpretation }
    : null;

  const highUncertaintyTemperConfidence =
    (revisionReliabilityWarning || negativeFcfFlag) &&
    (volatilityAlertFlag || uncertaintyElevatedFlag) &&
    (baseScore == null || baseScore.total < 50);

  // --- Setup Type: conviction tier (what kind of risk the user is taking) ---
  let setupType = 'Standard';
  if (thesisStatus === 'Improving' && signal === 'Positive divergence') {
    if (volatilityAlertFlag && revisionMagnitudeFlag) {
      setupType = 'Event-Driven Rebound';
    } else if (structuralLevel === 'High' && isCyclicalSector) {
      setupType = 'Leveraged Cyclical Rebound';
    } else if (structuralLevel === 'Low' || structuralLevel === 'Elevated') {
      setupType = 'Defensive Divergence';
    } else if (structuralLevel === 'High' && !isCyclicalSector) {
      setupType = 'Leveraged Re-rating';
    }
  } else if (thesisStatus === 'Improving' && baseScore && baseScore.total > 70 && structuralLevel === 'Low') {
    setupType = 'Quality Re-rating';
  } else if (signal === 'Risk divergence') {
    setupType = 'Risk Divergence';
  } else if (
    setupType === 'Standard' &&
    (majorRecalibrationFlag || (revisionMagnitudeFlag && eps7d != null && Math.abs(eps7d) > 50)) &&
    (fcfYieldNow == null || fcfYieldNow <= 0 || fcfYieldNow < 2)
  ) {
    setupType = 'Earnings Inflection Candidate';
  }

  // --- Positioning: portfolio-aware size suggestion ---
  let positioning = 'Standard allocation';
  if (thesisStatus === 'Deteriorating') {
    positioning = 'Reduce / trim';
  } else if (thesisStatus === 'Improving') {
    if (setupType === 'Event-Driven Rebound') {
      positioning = 'Tactical / opportunistic allocation';
    } else if (structuralLevel === 'High' && isCyclicalSector) {
      positioning = 'Tactical / high-volatility allocation';
    } else if (structuralLevel === 'Low' || structuralLevel === 'Elevated') {
      positioning = 'Core position candidate';
    } else if (structuralLevel === 'High' && !isCyclicalSector) {
      positioning = 'Concentrated / monitor leverage';
    }
  } else if (thesisStatus === 'Stable') {
    positioning = 'Watchlist';
  }
  if (setupType === 'Earnings Inflection Candidate') {
    positioning = 'Watchlist / speculative';
  }

  const sectorMedianND = industryResult?.industrySnapshot?.medianDebt ?? null;
  const m0 = metricsHistory[0];
  const betaRaw = m0?.beta != null ? num(m0.beta) : profileBeta;
  const betaVsSp500 = betaRaw != null ? Math.round(betaRaw * 10) / 10 : null;

  // --- Revision Breadth: analyst count, dispersion, conviction (institutions care about consensus) ---
  let dispersionPct: number | null = null;
  if (epsHigh != null && epsLow != null && epsNow != null && Math.abs(epsNow) > 1e-9) {
    dispersionPct = Math.round(((epsHigh - epsLow) / Math.abs(epsNow)) * 1000) / 10;
  }
  const priorDisp = deltas.priorDispersion7d ?? deltas.priorDispersion30d;
  let dispersionTrend: 'narrowing' | 'widening' | 'stable' | null = null;
  if (dispersionPct != null && priorDisp != null) {
    const diff = dispersionPct - priorDisp;
    if (Math.abs(diff) < 2) dispersionTrend = 'stable';
    else dispersionTrend = diff < 0 ? 'narrowing' : 'widening';
  }
  const narrowDispersion = dispersionPct != null && dispersionPct < 25;
  const wideDispersion = dispersionPct != null && dispersionPct > 50;
  let breadthConviction: 'High' | 'Medium' | 'Low' | null = null;
  if (eps7d != null || eps30d != null) {
    const revUp = revisionDirection === 'up';
    const revDown = revisionDirection === 'down';
    if (revUp) {
      if (narrowDispersion && (dispersionTrend === 'narrowing' || dispersionTrend === 'stable')) {
        breadthConviction = 'High';
      } else if (wideDispersion && dispersionTrend === 'widening') {
        breadthConviction = 'Low';
      } else {
        breadthConviction = 'Medium';
      }
    } else if (revDown) {
      if (narrowDispersion && (dispersionTrend === 'narrowing' || dispersionTrend === 'stable')) {
        breadthConviction = 'High'; // consensus bearish
      } else if (wideDispersion && dispersionTrend === 'widening') {
        breadthConviction = 'Low'; // disagreement
      } else {
        breadthConviction = 'Medium';
      }
    } else {
      breadthConviction = 'Medium';
    }
  } else if (dispersionPct != null && analystCount != null) {
    breadthConviction = narrowDispersion ? 'High' : wideDispersion ? 'Low' : 'Medium';
  }
  const revisionBreadth = {
    analystCount,
    dispersionPct,
    dispersionTrend,
    conviction: breadthConviction,
    dataSourceNote:
      'Per-analyst % revising up/down not in FMP basic tier; conviction from dispersion & trend'
  };

  // --- Short Interest: positioning & flow (who is trapped, squeeze potential) ---
  const km = metricsHistory[0] as { shortPercentOfFloat?: number; shortRatio?: number; shortInterest?: number } | undefined;
  const floatShares = sharesFloat?.floatShares ?? sharesFloat?.sharesOutstanding;
  let pctFloatShort: number | null =
    shortInterestRaw?.shortPercentOfFloat != null ? num(shortInterestRaw.shortPercentOfFloat) :
    km?.shortPercentOfFloat != null ? num(km.shortPercentOfFloat) : null;
  const shortShares = shortInterestRaw?.shortInterest ?? km?.shortInterest;
  if (pctFloatShort == null && shortShares != null && floatShares != null && floatShares > 0) {
    const computed = (Number(shortShares) / Number(floatShares)) * 100;
    pctFloatShort = Number.isFinite(computed) ? Math.round(computed * 10) / 10 : null;
  }
  let daysToCover: number | null =
    num(shortInterestRaw?.shortRatio) ?? num(km?.shortRatio) ?? null;
  if (daysToCover == null && shortShares != null && priceHistory.length >= 5) {
    const sorted = [...priceHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const vols = sorted.slice(0, 20).map((p) => (p as EodPoint).volume).filter((v): v is number => typeof v === 'number' && v > 0);
    const avgVol = vols.length > 0 ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
    if (avgVol > 0) daysToCover = Math.round((Number(shortShares) / avgVol) * 10) / 10;
  }
  let shortChange30dPct: number | null = null;
  if (pctFloatShort != null && Number.isFinite(pctFloatShort)) {
    saveShortInterestSnapshot(sym, pctFloatShort, daysToCover);
    const shortDeltas = computeShortInterestDeltas(sym, pctFloatShort, daysToCover);
    shortChange30dPct = shortDeltas.change30dPct;
  }
  const shortInterest = {
    pctFloatShort,
    change30dPct: shortChange30dPct,
    daysToCover,
    dataSourceNote:
      pctFloatShort != null ? 'FMP key-metrics or short-interest' : 'Short interest not in FMP basic tier; add FINRA or premium provider for positioning data'
  };

  // --- Institutional Ownership: smart money accumulation, ETF concentration ---
  let instPct = institutionalRaw?.pctInstitutional ?? null;
  const kmInst = metricsHistory[0] as { institutionalOwnershipPercent?: number } | undefined;
  if (instPct == null && kmInst?.institutionalOwnershipPercent != null) {
    instPct = num(kmInst.institutionalOwnershipPercent);
  }
  let instChange30dPp: number | null = null;
  if (instPct != null && Number.isFinite(instPct)) {
    saveInstitutionalSnapshot(sym, instPct);
    const instDeltas = computeInstitutionalDeltas(sym, instPct);
    instChange30dPp = instDeltas.change30dPp;
  }
  const institutionalOwnership = {
    pctInstitutional: instPct,
    change30dPp: instChange30dPp,
    investorCount: institutionalRaw?.investorCount ?? null,
    etfConcentrationPct: etfExposure?.etfConcentrationPct ?? null,
    topEtfs: etfExposure?.topEtfs ?? [],
    dataSourceNote:
      instPct != null || etfExposure != null
        ? 'FMP positions-summary / etf asset-exposure'
        : 'Institutional ownership may require FMP premium (13F/ETF data)'
  };

  // --- Options Skew & Implied Vol: positioning flip, squeeze fuel ---
  const histVol = annualizedVol30d(priceHistory);
  const kmVol = metricsHistory[0] as { volatility?: number } | undefined;
  const optionsSkewIv = {
    ivPercentile: optionsRaw?.ivPercentile ?? null,
    putCallRatio: optionsRaw?.putCallRatio ?? null,
    historicalVol30d: histVol ?? (kmVol?.volatility != null ? num(kmVol.volatility) : null),
    dataSourceNote:
      optionsRaw?.ivPercentile != null || optionsRaw?.putCallRatio != null
        ? 'FMP options/volatility'
        : histVol != null
          ? 'IV/put-call require options data; 30d historical vol as proxy'
          : 'Options skew & IV require options provider (e.g. CBOE, Polygon)'
  };

  // --- Passive Flow Sensitivity: index weight, ETF ownership ---
  const passiveFlow = {
    isSp500Constituent: sp500Constituent?.isSp500 ?? false,
    sp500WeightPct: sp500Constituent?.weightPct ?? null,
    etfConcentrationPct: etfExposure?.etfConcentrationPct ?? null,
    topEtfs: etfExposure?.topEtfs ?? [],
    dataSourceNote:
      sp500Constituent?.isSp500 || etfExposure != null
        ? 'FMP sp500-constituent / etf asset-exposure'
        : 'Passive flow data may require FMP premium'
  };

  let timeHorizonBias: string | null = null;
  if (setupType === 'Event-Driven Rebound') {
    timeHorizonBias = 'Short–Medium term reassessment';
  } else if (setupType === 'Leveraged Cyclical Rebound') {
    timeHorizonBias = 'Short–Medium term tactical opportunity; long-term dependent on deleveraging path';
  } else if (setupType === 'Defensive Divergence' && structuralLevel === 'Low') {
    timeHorizonBias = 'Core hold; no time constraint';
  } else if (setupType === 'Quality Re-rating') {
    timeHorizonBias = 'Medium–Long term; quality compounder';
  } else if (setupType === 'Earnings Inflection Candidate') {
    timeHorizonBias = 'Short–Medium term; profitability transition';
  }

  const rawRecap = await getEarningsRecap(sym).catch(() => null);
  const earningsRecap: EarningsRecapWithRelevance | null =
    rawRecap != null
      ? earningsRecapRelevance(rawRecap, {
          revisionSpikeAfterEarnings: majorRecalibrationFlag,
          significantPriceMovePostEarnings: volatilityAlertFlag
        })
      : null;

  return {
    symbol: sym,
    companyName,
    timestamp,
    baseScore,
    dailyPulse,
    thesisStatus,
    confidence,
    revisions: (() => {
      const stdDev = computeRevisionStdDev(sym);
      return {
        eps7d,
        eps30d,
        revenue30d: rev30d,
        direction: revisionDirection,
        epsNow,
        priorEps: deltas.priorEps7d ?? (estimates[1]?.epsAvg != null ? num(estimates[1].epsAvg) : null),
        stdDev7d: stdDev.std7d,
        stdDev30d: stdDev.std30d
      };
    })(),
    valuation: { fcfYieldChange, fcfYieldNow },
    price: { change7d: priceChange7dPct, change30d: priceChange30dPct },
    relativeStrength: { vsSp500_7d, vsSp500_30d },
    signal,
    signalExplanation,
    riskAlerts,
    structuralRisk,
    flowRisk,
    clusterRiskDetected,
    clusterInteractionNote,
    sensitivityNote,
    pillars: {
      revisionDelta,
      valuationCompression: Math.round(valuationCompression),
      divergence: Math.round(divergenceScore),
      riskChange: Math.round(riskChange)
    },
    hasStoredRevisionHistory: deltas.hasStoredHistory,
    revisionMagnitudeFlag,
    unusualRevisionSpikeFlag,
    isMegaCap,
    marketCap: marketCap ?? null,
    isCyclicalSector,
    setupType,
    positioning,
    sectorMedianNDtoEbitda: sectorMedianND,
    betaVsSp500,
    timeHorizonBias,
    volatilityAlertFlag,
    uncertaintyElevatedFlag,
    majorRecalibrationFlag,
    revisionReliabilityWarning,
    negativeFcfFlag,
    highUncertaintyTemperConfidence,
    volatilityExceedsBetaFlag:
      volatilityAlertFlag &&
      betaVsSp500 != null &&
      betaVsSp500 < 1.2 &&
      priceChange30dPct != null &&
      Math.abs(priceChange30dPct) > 20,
    revisionBreadth,
    shortInterest,
    institutionalOwnership,
    optionsSkewIv,
    passiveFlow,
    earningsRecap,
    earningsUpcoming7d
  };
}
