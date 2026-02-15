/**
 * Industry Comparison — FMP reference automation
 *
 * For each company:
 * 1. Industry Snapshot: median Forward P/E, median Growth, median ROE, median Debt
 * 2. Stock vs Industry: growth %, ROE %, debt, valuation premium %
 * 3. Verdict: Premium justified | Fair | Premium stretched | Discount
 *
 * Rule: Cheap/expensive is relative valuation adjusted for growth, quality, and risk.
 */

import axios from 'axios';
import { getValuation } from '../tools/valuationExtractor';
import { getAnalystRatings } from '../tools/analystRatings';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

const p = (params: Record<string, unknown>) => ({
  params: { ...params, apikey: FMP_API_KEY },
  headers: { apikey: FMP_API_KEY } as Record<string, string>
});

function num(val: unknown): number | null {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function median(arr: number[], filterInvalid = true): number | null {
  const values = filterInvalid ? arr.filter((x) => x != null && Number.isFinite(x)) : arr;
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}

/** Winsorize: cap values above the 95th percentile to the 95th percentile. */
function winsorizeTop5Pct(arr: number[]): number[] {
  if (arr.length === 0) return arr;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx95 = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  const cap = sorted[Math.max(0, idx95)]!;
  return arr.map((x) => (x > cap ? cap : x));
}

// --- Peer metrics (lightweight: 3 FMP calls per symbol) ---
interface PeerMetrics {
  symbol: string;
  pe: number | null;
  revenueGrowth: number | null;
  epsGrowth: number | null;
  roe: number | null;
  roic: number | null;
  netDebtToEBITDA: number | null;
}

async function fetchPeerMetrics(symbol: string): Promise<PeerMetrics> {
  try {
    const [metricsRes, growthRes, ratiosRes] = await Promise.all([
      axios.get<Array<{ returnOnEquity?: number; returnOnInvestedCapital?: number; netDebtToEBITDA?: number }>>(`${BASE}/key-metrics`, p({ symbol })).catch(() => ({ data: [] })),
      axios.get<Array<{ revenueGrowth?: number; epsgrowth?: number }>>(`${BASE}/financial-growth`, p({ symbol })).catch(() => ({ data: [] })),
      axios.get<Array<{ priceToEarningsRatioTTM?: number; priceEarningsRatioTTM?: number }>>(`${BASE}/ratios-ttm`, p({ symbol })).catch(() => ({ data: [] }))
    ]);

    const metrics = metricsRes.data?.[0];
    const growth = growthRes.data?.[0];
    const ratios = ratiosRes.data?.[0];

    const roeRaw = metrics?.returnOnEquity ?? null;
    const roicRaw = metrics?.returnOnInvestedCapital ?? null;
    const netDebtRaw = metrics?.netDebtToEBITDA ?? null;
    const revenueGrowthRaw = growth?.revenueGrowth ?? null;
    const epsGrowthRaw = growth?.epsgrowth ?? null;
    const peRaw = ratios?.priceToEarningsRatioTTM ?? ratios?.priceEarningsRatioTTM ?? null;

    return {
      symbol,
      pe: peRaw != null && peRaw > 0 && peRaw < 500 ? Math.round(peRaw * 100) / 100 : null,
      revenueGrowth: revenueGrowthRaw != null ? Math.round(revenueGrowthRaw * 10000) / 100 : null,
      epsGrowth: epsGrowthRaw != null ? Math.round(epsGrowthRaw * 10000) / 100 : null,
      roe: roeRaw != null ? Math.round(roeRaw * 100) / 100 : null,
      roic: roicRaw != null ? Math.round(roicRaw * 100) / 100 : null,
      netDebtToEBITDA: netDebtRaw != null ? Math.round(netDebtRaw * 100) / 100 : null
    };
  } catch {
    return { symbol, pe: null, revenueGrowth: null, epsGrowth: null, roe: null, roic: null, netDebtToEBITDA: null };
  }
}

/** Get industry/sector peer symbols via company-screener (sector filter; FMP supports sector). */
async function fetchIndustryPeerSymbols(sector: string | null, industry: string | null, excludeSymbol: string): Promise<string[]> {
  const sym = excludeSymbol.toUpperCase();
  if (!sector && !industry) return [];

  const params: Record<string, unknown> = { limit: 25 };
  if (sector) params.sector = sector;
  // Some FMP plans support industry on company-screener
  if (industry) params.industry = industry;

  try {
    const res = await axios.get<Array<{ symbol?: string }>>(`${BASE}/company-screener`, p(params)).catch(() => ({ data: [] }));
    const list = Array.isArray(res.data) ? res.data : [];
    return list
      .map((c) => (c.symbol || '').toString().toUpperCase())
      .filter((s) => s && s !== sym)
      .slice(0, 18);
  } catch {
    return [];
  }
}

export type Verdict = 'Premium justified' | 'Fair' | 'Premium stretched' | 'Discount';

export interface IndustrySnapshot {
  medianForwardPE: number | null;
  medianGrowth: number | null;
  medianROE: number | null;
  medianROIC: number | null;
  medianDebt: number | null;
  peerCount: number;
  industry: string | null;
  sector: string | null;
}

export type DebtVsMedianLabel =
  | 'Well below industry median'
  | 'Below industry median'
  | 'In line with median'
  | 'Above industry median'
  | 'Well above industry median'
  | 'Unknown';

export interface StockVsIndustry {
  growthVsMedianPct: number | null;
  roeVsMedianPct: number | null;
  debtVsMedian: DebtVsMedianLabel;
  valuationPremiumPct: number | null;
  stockPE: number | null;
  stockGrowth: number | null;
  stockROE: number | null;
  stockNetDebtToEBITDA: number | null;
  /** Which growth metric is used for vs-median comparison. */
  growthLabel: 'Revenue (YoY)' | 'EPS (YoY)' | null;
  /** Revenue growth (YoY) % when available — show alongside EPS for transparency. */
  stockRevenueGrowth: number | null;
  /** EPS growth (YoY) % when available — drives PEG. */
  stockEpsGrowth: number | null;
  /** Return on invested capital % (institutional quality metric). */
  stockROIC: number | null;
}

export type PegInterpretation = 'cheap' | 'fair' | 'premium';

export interface IndustryComparisonResult {
  symbol: string;
  companyName?: string;
  timestamp: string;
  industrySnapshot: IndustrySnapshot;
  stockVsIndustry: StockVsIndustry;
  verdict: Verdict;
  verdictReason: string;
  analystSignal?: 'positive' | 'neutral' | 'negative';
  /** When industry median ROE or P/E looks distorted (e.g. many unprofitable peers). */
  peerSetHealthWarning?: string;
  /** PEG = P/E ÷ growth (%). Only when both PE and growth > 0. */
  peg?: number;
  pegInterpretation?: PegInterpretation;
  /** Nuance e.g. "Discount vs median; PEG suggests fair value—quality at reasonable price, not deep value." */
  verdictNuance?: string;
  /** Balance sheet one-liner when debt is notably strong. */
  balanceSheetNote?: string;
  /** Multi-axis view for app / institutional use. */
  multiAxis?: {
    relativeValue: 'Attractive' | 'Fair' | 'Stretched' | 'Unattractive';
    absoluteValue: 'Cheap' | 'Fair' | 'Premium';
    quality: 'High' | 'Moderate' | 'Low';
    financialRisk: 'Low' | 'Moderate' | 'High';
  };
  /** Forward EPS consensus if available. */
  forwardEpsConsensus?: number | null;
  /** Revision trend: rising / flat / falling when data available. */
  earningsRevisionTrend?: 'rising' | 'flat' | 'falling' | null;
  /** EPS revision trend (90 days): up / flat / down. Proxy from analyst-estimates; premium stocks get punished when revisions roll over. */
  epsRevisionTrend90d?: 'up' | 'flat' | 'down' | null;
  /** When PEG is not computed (e.g. only revenue growth available). */
  pegDisabledReason?: string;
  /** Institutional phrasing when median is flagged: e.g. "Relative discount vs peer median. Absolute valuation fair." */
  verdictSummary?: string;
  /** FCF yield % (FMP key-metrics). >5% attractive, 3–5% fair, <3% expensive. */
  fcfYield?: number | null;
  fcfYieldInterpretation?: 'attractive' | 'fair' | 'expensive' | null;
  /** 3-year revenue CAGR % from income-statement. */
  revenueCagr3y?: number | null;
  /** Operating margin trend over 3Y: expanding / stable / contracting. */
  marginTrend?: 'expanding' | 'stable' | 'contracting' | null;
  /** Re-rating Probability Score (0–100): probability multiple expands over 6–18 months. Not a valuation score. */
  reRatingProbabilityScore?: {
    total: number;
    interpretation: 'High re-rating probability' | 'Moderate' | 'Neutral' | 'Low' | 'Unlikely';
    pillars: {
      relativeCompression: number;   // 0–25
      absoluteCheapness: number;      // 0–30
      fundamentalMomentum: number;   // 0–30
      riskBalanceSheet: number;      // 0–15
    };
  };
}

/** Normalize growth to a single number: prefer revenue growth, else EPS growth (as %). */
function growthValue(rev: number | null, eps: number | null): number | null {
  if (rev != null && Number.isFinite(rev)) return rev;
  if (eps != null && Number.isFinite(eps)) return eps;
  return null;
}

/**
 * Run the full industry comparison for one company.
 * Uses: getValuation (stock), profile + company-screener (peers), key-metrics + financial-growth + ratios-ttm (each peer).
 */
export async function runIndustryComparison(symbol: string): Promise<IndustryComparisonResult> {
  const sym = symbol.toUpperCase();
  const timestamp = new Date().toISOString();

  const [valuation, ratings] = await Promise.all([
    getValuation({ symbol: sym }),
    getAnalystRatings({ symbol: sym }).catch(() => null)
  ]);

  if (valuation.error) {
    return {
      symbol: sym,
      timestamp,
      industrySnapshot: {
        medianForwardPE: null,
        medianGrowth: null,
        medianROE: null,
        medianROIC: null,
        medianDebt: null,
        peerCount: 0,
        industry: null,
        sector: null
      },
      stockVsIndustry: {
        growthVsMedianPct: null,
        roeVsMedianPct: null,
        debtVsMedian: 'Unknown',
        valuationPremiumPct: null,
        stockPE: null,
        stockGrowth: null,
        stockROE: null,
        stockNetDebtToEBITDA: null,
        growthLabel: null,
        stockRevenueGrowth: null,
        stockEpsGrowth: null,
        stockROIC: null
      },
      verdict: 'Fair',
      verdictReason: `Could not load data: ${valuation.error}`
    };
  }

  const sector = valuation.sector ?? null;
  const industry = valuation.industry ?? null;
  const peerSymbols = await fetchIndustryPeerSymbols(sector, industry, sym);

  const revGrowth = valuation.revenueGrowth ?? null;
  const epsGrowth = valuation.epsGrowth ?? null;
  const stockGrowth = growthValue(revGrowth, epsGrowth);
  const growthLabel: 'Revenue (YoY)' | 'EPS (YoY)' | null =
    revGrowth != null && Number.isFinite(revGrowth) ? 'Revenue (YoY)' : epsGrowth != null && Number.isFinite(epsGrowth) ? 'EPS (YoY)' : null;

  const stockROE = valuation.returnOnEquity ?? null;
  const stockPE = valuation.peRatio ?? null;
  const stockDebt = valuation.netDebtToEBITDA ?? null;

  let industrySnapshot: IndustrySnapshot = {
    medianForwardPE: valuation.industryAveragePE ?? valuation.sectorAveragePE ?? null,
    medianGrowth: null,
    medianROE: null,
    medianROIC: null,
    medianDebt: null,
    peerCount: 0,
    industry,
    sector
  };

  const stockROIC = (valuation as { returnOnInvestedCapital?: number | null }).returnOnInvestedCapital ?? null;

  const stockVsIndustry: StockVsIndustry = {
    growthVsMedianPct: null,
    roeVsMedianPct: null,
    debtVsMedian: 'Unknown',
    valuationPremiumPct: null,
    stockPE,
    stockGrowth,
    stockROE,
    stockNetDebtToEBITDA: stockDebt,
    growthLabel,
    stockRevenueGrowth: revGrowth != null && Number.isFinite(revGrowth) ? Math.round(revGrowth * 100) / 100 : null,
    stockEpsGrowth: epsGrowth != null && Number.isFinite(epsGrowth) ? Math.round(epsGrowth * 100) / 100 : null,
    stockROIC: stockROIC != null && Number.isFinite(stockROIC) ? Math.round(stockROIC * 100) / 100 : null
  };

  if (peerSymbols.length > 0) {
    const peerMetricsList = await Promise.all(peerSymbols.map((s) => fetchPeerMetrics(s)));

    // Exclude loss-making / severely distressed: ROE < -20% (institutional filter)
    const eligible = (p: PeerMetrics) => p.roe == null || p.roe >= -20;
    const eligiblePeers = peerMetricsList.filter(eligible);

    let peList = eligiblePeers
      .map((p) => p.pe)
      .filter((x): x is number => x != null && x > 0 && x < 500);
    peList = winsorizeTop5Pct(peList);

    const growthList = eligiblePeers
      .map((p) => growthValue(p.revenueGrowth, p.epsGrowth))
      .filter((x): x is number => x != null);
    const roeList = eligiblePeers
      .map((p) => p.roe)
      .filter((x): x is number => x != null && x >= -20);
    const roicList = eligiblePeers
      .map((p) => p.roic)
      .filter((x): x is number => x != null);
    const debtList = eligiblePeers
      .map((p) => p.netDebtToEBITDA)
      .filter((x): x is number => x != null);

    const medianPE = median(peList);
    const medianGrowth = median(growthList);
    const medianROE = median(roeList);
    const medianROIC = median(roicList);
    const medianDebt = median(debtList);

    industrySnapshot = {
      medianForwardPE: medianPE ?? industrySnapshot.medianForwardPE,
      medianGrowth: medianGrowth ?? null,
      medianROE: medianROE ?? null,
      medianROIC: medianROIC ?? null,
      medianDebt: medianDebt ?? null,
      peerCount: eligiblePeers.length,
      industry,
      sector
    };

    if (medianGrowth != null && stockGrowth != null) {
      stockVsIndustry.growthVsMedianPct = medianGrowth === 0 ? (stockGrowth > 0 ? 100 : 0) : Math.round(((stockGrowth - medianGrowth) / Math.abs(medianGrowth)) * 10000) / 100;
    }
    if (medianROE != null && stockROE != null) {
      stockVsIndustry.roeVsMedianPct = medianROE === 0 ? (stockROE > 0 ? 100 : 0) : Math.round(((stockROE - medianROE) / Math.abs(medianROE)) * 10000) / 100;
    }
    if (medianDebt != null && stockDebt != null && medianDebt > 0) {
      const ratio = stockDebt / medianDebt;
      const diff = stockDebt - medianDebt;
      if (ratio < 0.5 || diff < -0.25) stockVsIndustry.debtVsMedian = 'Well below industry median';
      else if (ratio < 0.85) stockVsIndustry.debtVsMedian = 'Below industry median';
      else if (ratio <= 1.15) stockVsIndustry.debtVsMedian = 'In line with median';
      else if (ratio <= 1.5) stockVsIndustry.debtVsMedian = 'Above industry median';
      else stockVsIndustry.debtVsMedian = 'Well above industry median';
    } else if (stockDebt != null && medianDebt == null) {
      stockVsIndustry.debtVsMedian = stockDebt <= 0.3 ? 'Well below industry median' : stockDebt <= 0.8 ? 'Below industry median' : 'Unknown';
    }

    if (medianPE != null && medianPE > 0 && stockPE != null && stockPE > 0) {
      stockVsIndustry.valuationPremiumPct = Math.round(((stockPE - medianPE) / medianPE) * 10000) / 100;
    }
  } else {
    // No peers: use sector/industry average PE if available
    const refPE = valuation.industryAveragePE ?? valuation.sectorAveragePE ?? null;
    if (refPE != null && refPE > 0 && stockPE != null && stockPE > 0) {
      stockVsIndustry.valuationPremiumPct = Math.round(((stockPE - refPE) / refPE) * 10000) / 100;
    }
  }

  const premium = stockVsIndustry.valuationPremiumPct ?? 0;
  const growthAbove = (stockVsIndustry.growthVsMedianPct ?? 0) > 10;
  const roeAbove = (stockVsIndustry.roeVsMedianPct ?? 0) > 10;
  const debtOk =
    stockVsIndustry.debtVsMedian !== 'Above industry median' &&
    stockVsIndustry.debtVsMedian !== 'Well above industry median';

  let verdict: Verdict = 'Fair';
  let verdictReason: string;

  if (premium > 20 && !growthAbove && !roeAbove) {
    verdict = 'Premium stretched';
    verdictReason = `Valuation is ${premium.toFixed(0)}% above industry median but growth and ROE are not meaningfully above peers.`;
  } else if (premium > 20 && (growthAbove || roeAbove) && debtOk) {
    verdict = 'Premium justified';
    verdictReason = `Valuation premium (${premium.toFixed(0)}%) is supported by superior growth and/or ROE vs industry and solid balance sheet.`;
  } else if (premium <= -20) {
    verdict = 'Discount';
    verdictReason = `Trading at ${Math.abs(premium).toFixed(0)}% below industry median valuation.`;
  } else if (premium > 15 && (growthAbove || roeAbove)) {
    verdict = 'Premium justified';
    verdictReason = `Moderate premium (${premium.toFixed(0)}%) with growth or quality above industry.`;
  } else {
    verdict = 'Fair';
    const absPct = Math.abs(premium).toFixed(0);
    verdictReason =
      premium < 0
        ? `Valuation ${absPct}% below industry median; in line with peers.`
        : premium > 0
          ? `Valuation ${absPct}% above industry median; in line with peers.`
          : `Valuation in line with industry median.`;
  }

  // --- Peer set health: 40x median + ROE < 5% → industry median may be inflated ---
  let peerSetHealthWarning: string | undefined;
  const medROE = industrySnapshot.medianROE;
  const medPE = industrySnapshot.medianForwardPE;
  if (medPE != null && medPE >= 40 && medROE != null && medROE < 5) {
    peerSetHealthWarning = `Industry median P/E is ${medPE.toFixed(0)}x and median ROE is ${medROE.toFixed(1)}%. Industry median may be inflated by low-profit or speculative firms.`;
  } else if (medROE != null && medROE < 2) {
    peerSetHealthWarning = `Industry median ROE is very low (${medROE.toFixed(1)}%). Peer set may include many unprofitable or distressed firms; "above median" may be less meaningful.`;
  } else if (medPE != null && medPE > 40) {
    peerSetHealthWarning = `Industry median P/E is high (${medPE.toFixed(0)}x). Multiple may be distorted by speculative or unprofitable names.`;
  }

  // --- PEG: P/E ÷ EPS growth (%) only. Revenue growth must not drive PEG. ---
  let peg: number | undefined;
  let pegInterpretation: 'cheap' | 'fair' | 'premium' | undefined;
  let pegDisabledReason: string | undefined;
  if (stockPE != null && stockPE > 0 && epsGrowth != null && epsGrowth > 0) {
    peg = Math.round((stockPE / epsGrowth) * 100) / 100;
    if (peg < 1) pegInterpretation = 'cheap';
    else if (peg <= 2) pegInterpretation = 'fair';
    else pegInterpretation = 'premium';
  } else if (revGrowth != null && (epsGrowth == null || epsGrowth <= 0)) {
    pegDisabledReason = 'PEG not shown: EPS growth required. Revenue growth is not used for PEG (ignores margins, buybacks, leverage).';
  }

  // --- Verdict nuance when "Discount" but PEG says not cheap ---
  let verdictNuance: string | undefined;
  if (verdict === 'Discount' && peg != null && peg > 1.5) {
    verdictNuance = `Discount vs industry median; PEG ≈ ${peg.toFixed(1)} suggests fair to slightly premium on growth—quality compounder at reasonable price, not deep value.`;
  } else if (verdict === 'Discount' && peerSetHealthWarning) {
    verdictNuance = `Discount vs reported median; consider whether the industry median is distorted (e.g. unprofitable peers).`;
  } else if (verdict === 'Premium justified' && peg != null && peg > 2) {
    verdictNuance = `Premium supported by quality/growth; PEG ≈ ${peg.toFixed(1)}—not a bargain on growth alone.`;
  }

  // --- Balance sheet note when notably strong ---
  let balanceSheetNote: string | undefined;
  if (stockDebt != null) {
    if (stockDebt <= 0.3) balanceSheetNote = `Net Debt/EBITDA ${stockDebt.toFixed(2)}x — very strong.`;
    else if (stockDebt <= 0.8) balanceSheetNote = `Net Debt/EBITDA ${stockDebt.toFixed(2)}x — solid.`;
  }

  const analystSignal =
    ratings?.recommendation != null
      ? /buy|strong buy|outperform/i.test(ratings.recommendation)
        ? 'positive'
        : /sell|underperform/i.test(ratings.recommendation)
          ? 'negative'
          : 'neutral'
      : undefined;

  // --- Multi-axis: rule-based thresholds (Wealthy Rabbit-grade) ---
  // Relative Value: 20% below → Attractive, ±20% → Fair, 20% above → Stretched
  const relativeValue: 'Attractive' | 'Fair' | 'Stretched' | 'Unattractive' =
    premium <= -20 ? 'Attractive' : premium >= 20 ? 'Stretched' : 'Fair';
  // Absolute Value (PEG): <1 Cheap, 1–2 Fair, >2 Premium
  const absoluteValue: 'Cheap' | 'Fair' | 'Premium' =
    pegInterpretation === 'cheap' ? 'Cheap' : pegInterpretation === 'premium' ? 'Premium' : 'Fair';
  // Quality: ROE >20% High, 10–20% Moderate, <10% Low; AND Net Debt/EBITDA <1 low, 1–3 moderate, >3 high
  const roeTier = (stockROE ?? 0) > 20 ? 'High' : (stockROE ?? 0) > 10 ? 'Moderate' : 'Low';
  const leverageTier =
    stockDebt == null ? 'moderate' : stockDebt < 1 ? 'low' : stockDebt <= 3 ? 'moderate' : 'high';
  const quality: 'High' | 'Moderate' | 'Low' =
    roeTier === 'High' && leverageTier === 'low'
      ? 'High'
      : roeTier === 'Low' && leverageTier === 'high'
        ? 'Low'
        : 'Moderate';
  // Financial Risk: <1 Low, 1–3 Moderate, >3 High
  const financialRisk: 'Low' | 'Moderate' | 'High' =
    stockDebt != null
      ? (stockDebt < 1 ? 'Low' : stockDebt <= 3 ? 'Moderate' : 'High')
      : 'Moderate';

  const multiAxis = {
    relativeValue,
    absoluteValue,
    quality,
    financialRisk
  };

  // --- Verdict summary when median is flagged: institutional phrasing ---
  let verdictSummary: string | undefined;
  if (verdict === 'Discount' && peerSetHealthWarning) {
    const absPhrase =
      absoluteValue === 'Fair' ? 'fair' : absoluteValue === 'Cheap' ? 'attractive' : 'premium';
    verdictSummary = `Relative discount vs peer median. Absolute valuation ${absPhrase}.`;
  }

  // --- FCF yield (FMP key-metrics): >5% attractive, 3–5% fair, <3% expensive ---
  const fcfYieldRaw = (valuation as { freeCashFlowYield?: number | null }).freeCashFlowYield ?? null;
  const fcfYield =
    fcfYieldRaw != null && Number.isFinite(fcfYieldRaw)
      ? Math.round(fcfYieldRaw * 100) / 100
      : null;
  const fcfYieldInterpretation: 'attractive' | 'fair' | 'expensive' | null =
    fcfYield != null
      ? fcfYield > 5
        ? 'attractive'
        : fcfYield >= 3
          ? 'fair'
          : 'expensive'
      : null;

  // --- 3Y Revenue CAGR & margin trend (FMP income-statement annual) ---
  let revenueCagr3y: number | null = null;
  let marginTrend: 'expanding' | 'stable' | 'contracting' | null = null;
  try {
    const incRes = await axios
      .get<Array<{ revenue?: number; operatingIncome?: number }>>(`${BASE}/income-statement`, p({ symbol: sym, period: 'annual', limit: 4 }))
      .catch(() => ({ data: [] }));
    const statements = Array.isArray(incRes.data) ? incRes.data : [];
    if (statements.length >= 4) {
      const rev0 = num(statements[0]?.revenue);
      const rev3 = num(statements[3]?.revenue);
      if (rev0 != null && rev3 != null && rev3 > 0) {
        const cagr = (Math.pow(rev0 / rev3, 1 / 3) - 1) * 100;
        revenueCagr3y = Math.round(cagr * 100) / 100;
      }
      const margins = statements.slice(0, 4).map((s) => {
        const r = num(s.revenue);
        const oi = num(s.operatingIncome);
        return r != null && r > 0 && oi != null ? (oi / r) * 100 : null;
      });
      const valid = margins.filter((m): m is number => m != null);
      if (valid.length >= 2) {
        const first = valid[0]!;
        const last = valid[valid.length - 1]!;
        const diff = first - last;
        marginTrend = diff > 1 ? 'expanding' : diff < -1 ? 'contracting' : 'stable';
      }
    }
  } catch {
    // leave revenueCagr3y, marginTrend as-is
  }

  // --- Forward EPS & revision trend (FMP analyst-estimates) ---
  let forwardEpsConsensus: number | null = null;
  let earningsRevisionTrend: 'rising' | 'flat' | 'falling' | null = null;
  let epsRevisionTrend90d: 'up' | 'flat' | 'down' | null = null;
  try {
    const estRes = await axios
      .get<Array<{ epsAvg?: number; date?: string }>>(`${BASE}/analyst-estimates`, p({ symbol: sym, period: 'annual', limit: 4 }))
      .catch(() => ({ data: [] }));
    const estimates = Array.isArray(estRes.data) ? estRes.data : [];
    const latest = estimates[0];
    const eps = latest?.epsAvg;
    if (eps != null && Number.isFinite(eps)) {
      forwardEpsConsensus = Math.round(eps * 100) / 100;
    }
    // Revision trend: compare latest two annual estimates (proxy for 90-day direction; FMP does not provide true 90-day revision history)
    const e0 = estimates[0]?.epsAvg;
    const e1 = estimates[1]?.epsAvg;
    if (estimates.length >= 2 && e0 != null && e1 != null && Number.isFinite(e0) && Number.isFinite(e1)) {
      const diff = e0 - e1;
      earningsRevisionTrend = diff > 0.02 ? 'rising' : diff < -0.02 ? 'falling' : 'flat';
      epsRevisionTrend90d = diff > 0.02 ? 'up' : diff < -0.02 ? 'down' : 'flat';
    }
  } catch {
    // leave forwardEpsConsensus, earningsRevisionTrend, epsRevisionTrend90d as-is
  }

  // --- Re-rating Probability Score (RPS): 0–100, "What is the probability this stock's multiple expands over 6–18 months?" ---
  type RPSInterpretation = 'High re-rating probability' | 'Moderate' | 'Neutral' | 'Low' | 'Unlikely';
  let reRatingProbabilityScore: IndustryComparisonResult['reRatingProbabilityScore'];
  (function computeRPS() {
    const premium = stockVsIndustry.valuationPremiumPct ?? 0;
    // Pillar 1: Relative Compression (0–25)
    const relativeCompression =
      premium <= -40 ? 25 : premium <= -20 ? 18 : premium < 20 && premium > -20 ? 10 : premium < 40 ? 5 : 0;
    // Pillar 2: Absolute Cheapness — PEG (0–15) + FCF Yield (0–15)
    const pegScore =
      peg != null
        ? peg < 0.8 ? 15 : peg <= 1.2 ? 10 : peg <= 2 ? 5 : 0
        : 0;
    const fcfScore =
      fcfYield != null
        ? fcfYield > 7 ? 15 : fcfYield >= 5 ? 10 : fcfYield >= 3 ? 5 : 0
        : 0;
    const absoluteCheapness = pegScore + fcfScore;
    // Pillar 3: Fundamental Momentum — Revisions (0–15) + Margin (0–10) + Revenue CAGR (0–5)
    const revisionScore =
      earningsRevisionTrend === 'rising' ? 15 : earningsRevisionTrend === 'flat' ? 8 : 0;
    const marginScore =
      marginTrend === 'expanding' ? 10 : marginTrend === 'stable' ? 5 : 0;
    const cagrScore =
      revenueCagr3y != null
        ? revenueCagr3y > 8 ? 5 : revenueCagr3y >= 4 ? 3 : revenueCagr3y >= 0 ? 1 : 0
        : 0;
    const fundamentalMomentum = revisionScore + marginScore + cagrScore;
    // Pillar 4: Risk / Balance Sheet — ND/EBITDA (0–10) + ROIC (0–5). Penalize high leverage.
    const nd = stockVsIndustry.stockNetDebtToEBITDA ?? stockDebt;
    const ndScore = nd != null ? (nd < 1 ? 10 : nd <= 2 ? 5 : nd <= 3 ? 3 : nd <= 5 ? 0 : -2) : 0;
    const roicPct = stockROIC ?? 0;
    const roicScore = roicPct > 15 ? 5 : roicPct >= 8 ? 3 : 0;
    const riskBalanceSheet = ndScore + roicScore;

    const total = Math.round(relativeCompression + absoluteCheapness + fundamentalMomentum + riskBalanceSheet);
    const interpretation: RPSInterpretation =
      total >= 80 ? 'High re-rating probability' : total >= 60 ? 'Moderate' : total >= 40 ? 'Neutral' : total >= 20 ? 'Low' : 'Unlikely';

    reRatingProbabilityScore = {
      total: Math.min(100, total),
      interpretation,
      pillars: {
        relativeCompression,
        absoluteCheapness,
        fundamentalMomentum,
        riskBalanceSheet
      }
    };
  })();

  return {
    symbol: sym,
    timestamp,
    industrySnapshot,
    stockVsIndustry,
    verdict,
    verdictReason,
    analystSignal,
    peerSetHealthWarning: peerSetHealthWarning || undefined,
    peg,
    pegInterpretation,
    verdictNuance,
    balanceSheetNote,
    multiAxis,
    forwardEpsConsensus: forwardEpsConsensus ?? undefined,
    earningsRevisionTrend: earningsRevisionTrend ?? undefined,
    epsRevisionTrend90d: epsRevisionTrend90d ?? undefined,
    pegDisabledReason: pegDisabledReason ?? undefined,
    verdictSummary: verdictSummary ?? undefined,
    fcfYield: fcfYield ?? undefined,
    fcfYieldInterpretation: fcfYieldInterpretation ?? undefined,
    revenueCagr3y: revenueCagr3y ?? undefined,
    marginTrend: marginTrend ?? undefined,
    reRatingProbabilityScore: reRatingProbabilityScore ?? undefined
  };
}
