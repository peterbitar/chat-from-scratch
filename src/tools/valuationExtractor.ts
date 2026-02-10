import axios from 'axios';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

/** FMP auth: docs allow apikey in header or query. We send both. */
const fmpAuth = FMP_API_KEY
  ? { params: { apikey: FMP_API_KEY }, headers: { apikey: FMP_API_KEY } as Record<string, string> }
  : {};

function num(val: unknown): number | null {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export async function getValuation({ symbol }: { symbol: string }) {
  try {
    // FMP Starter - quote does not include sector/industry; use Company Profile API for that
    const sym = symbol.toUpperCase();
    const p = (params: Record<string, unknown>) => ({ params: { ...params, ...fmpAuth.params }, ...(fmpAuth.headers && { headers: fmpAuth.headers }) });
    const [quoteRes, profileRes, metricsRes, incomeQuarterRes, incomeAnnualRes, growthRes, sectorPERes, industryPERes] = await Promise.all([
      axios.get(`${BASE}/quote`, p({ symbol: sym })),
      axios.get(`${BASE}/profile`, p({ symbol: sym })).catch(() => ({ data: [] })),
      axios.get(`${BASE}/key-metrics`, p({ symbol: sym })),
      axios.get(`${BASE}/income-statement`, p({ symbol: sym, period: 'quarter', limit: 1 })),
      axios.get(`${BASE}/income-statement`, p({ symbol: sym, period: 'annual', limit: 1 })).catch(() => ({ data: [] })),
      axios.get(`${BASE}/financial-growth`, p({ symbol: sym })).catch(() => ({ data: [] })),
      axios.get(`${BASE}/sector-pe-snapshot`, p({ date: '2026-01-01' })).catch(() => ({ data: [] })),
      axios.get(`${BASE}/industry-pe-snapshot`, p({ date: '2026-01-01' })).catch(() => ({ data: [] }))
    ]);

    const quoteData = quoteRes.data;
    if (!quoteData || quoteData.length === 0) {
      return { symbol, error: 'No data returned from API.' };
    }

    const quote = quoteData[0];
    const profile = profileRes.data?.[0] || {};
    const metricsData = metricsRes.data;
    const metrics = metricsData && metricsData.length > 0 ? metricsData[0] : {};
    const incomeData = incomeQuarterRes.data;
    const income = incomeData && incomeData.length > 0 ? incomeData[0] : {};
    const incomeAnnual = incomeAnnualRes.data?.[0] || {};
    const growthData = growthRes.data && growthRes.data.length > 0 ? growthRes.data[0] : {};

    // Sector/industry: quote often omits them; FMP Company Profile API has industry (and sometimes sector)
    const sector = quote.sector || profile.sector || null;
    const industry = quote.industry || profile.industry || null;

    // Extract sector and industry PE data
    const sectorPEData = sectorPERes.data || [];
    const industryPEData = industryPERes.data || [];

    // Find matching sector and industry PE ratios
    let sectorAveragePE = null;
    let industryAveragePE = null;

    if (sector && sectorPEData.length > 0) {
      const sectorMatch = sectorPEData.find((s: any) =>
        s.sector?.toLowerCase() === sector.toLowerCase()
      );
      sectorAveragePE = sectorMatch ? num(sectorMatch.pe) : null;
    }
    // If we have sector but no PE yet, try Sector P/E Snapshot with sector param (FMP: sector-pe-snapshot?date=...&sector=...). May return 402 on free tier.
    if (sector && sectorAveragePE == null && FMP_API_KEY) {
      try {
        const sectorRes = await axios.get(`${BASE}/sector-pe-snapshot`, p({ date: '2026-01-01', sector }));
        const arr = sectorRes.data;
        const single = Array.isArray(arr) ? arr[0] : arr;
        if (single && (single.sector?.toLowerCase() === sector.toLowerCase() || single.pe != null)) {
          sectorAveragePE = num(single.pe);
        }
      } catch (_) {
        // keep sectorAveragePE null
      }
    }

    if (industry && industryPEData.length > 0) {
      const industryMatch = industryPEData.find((i: any) =>
        i.industry?.toLowerCase() === industry.toLowerCase()
      );
      industryAveragePE = industryMatch ? num(industryMatch.pe) : null;
    }
    // If we have industry but no PE yet, try Industry P/E Snapshot with industry param (FMP: industry-pe-snapshot?date=...&industry=...). May return 402 on free tier.
    if (industry && industryAveragePE == null && FMP_API_KEY) {
      try {
        const industryRes = await axios.get(`${BASE}/industry-pe-snapshot`, p({ date: '2026-01-01', industry }));
        const arr = industryRes.data;
        const single = Array.isArray(arr) ? arr[0] : arr;
        if (single && (single.industry?.toLowerCase() === industry.toLowerCase() || single.pe != null)) {
          industryAveragePE = num(single.pe);
        }
      } catch (_) {
        // keep industryAveragePE null
      }
    }

    // Extract market cap
    const marketCap = quote.marketCap ?? null;
    const price = num(quote.price) ?? null;

    // EPS: prefer Income Statement API (eps, epsDiluted). Use annual statement for full-year EPS when available.
    const annualEps = num((incomeAnnual as any).eps) ?? num((incomeAnnual as any).epsDiluted) ?? null;
    const quarterEps = num((income as any).eps) ?? num((income as any).epsDiluted) ?? null;
    let eps = num(quote.eps) ?? num(quote.earningsPerShare) ?? num(metrics.epsPerShare) ?? annualEps ?? quarterEps ?? null;

    // P/E: quote/metrics first; then price/eps when we have both; else marketCap / annual net income (use annual when available)
    const annualNetIncome = (incomeAnnual as any).netIncome != null ? (incomeAnnual as any).netIncome : (income.netIncome != null ? income.netIncome * 4 : null);
    let peRatio = num(quote.pe) ?? num(quote.priceEarningsRatio) ?? num(metrics.peRatio) ?? null;
    if (!peRatio && price && eps) peRatio = price / eps;
    if (!peRatio && marketCap && annualNetIncome) peRatio = marketCap / Number(annualNetIncome);
    if (eps == null && income.netIncome) {
      const sharesOutstanding =
        quote.sharesOutstanding ??
        metrics.sharesOutstanding ??
        (income as any).weightedAverageShsOut ??
        (income as any).weightedAverageShsOutDil ?? null;
      if (sharesOutstanding) {
        eps = (income.netIncome * 4) / Number(sharesOutstanding);
      }
    }

    // Extract price change data
    const change = num(quote.change) ?? null;
    const changePercent = num(quote.changePercentage) ?? null;
    const dayHigh = num(quote.dayHigh) ?? null;
    const dayLow = num(quote.dayLow) ?? null;
    const yearHigh = num(quote.yearHigh) ?? null;
    const yearLow = num(quote.yearLow) ?? null;

    // Extract growth data
    const revenueGrowth = num(growthData.revenueGrowth) ?? null;
    const epsGrowth = num(growthData.epsgrowth) ?? null;
    const netIncomeGrowth = num(growthData.netIncomeGrowth) ?? null;
    const operatingIncomeGrowth = num(growthData.operatingIncomeGrowth) ?? null;

    // Extract profitability metrics from key-metrics
    const returnOnAssets = num(metrics.returnOnAssets) ?? null;
    const returnOnEquity = num(metrics.returnOnEquity) ?? null;
    const returnOnInvestedCapital = num(metrics.returnOnInvestedCapital) ?? null;
    const earningsYield = num(metrics.earningsYield) ?? null;
    const operatingReturnOnAssets = num(metrics.operatingReturnOnAssets) ?? null;

    // Extract liquidity metrics
    const currentRatio = num(metrics.currentRatio) ?? null;
    const workingCapital = num(metrics.workingCapital) ?? null;
    const netDebtToEBITDA = num(metrics.netDebtToEBITDA) ?? null;

    // Extract efficiency metrics
    const daysOfSalesOutstanding = num(metrics.daysOfSalesOutstanding) ?? null;
    const daysOfPayablesOutstanding = num(metrics.daysOfPayablesOutstanding) ?? null;
    const daysOfInventoryOutstanding = num(metrics.daysOfInventoryOutstanding) ?? null;
    const cashConversionCycle = num(metrics.cashConversionCycle) ?? null;

    // Extract cash flow metrics
    const freeCashFlowYield = num(metrics.freeCashFlowYield) ?? null;
    const freeCashFlowToEquity = num(metrics.freeCashFlowToEquity) ?? null;
    const freeCashFlowToFirm = num(metrics.freeCashFlowToFirm) ?? null;

    // Extract other valuation metrics
    const evToSales = num(metrics.evToSales) ?? null;
    const evToEBITDA = num(metrics.evToEBITDA) ?? null;
    const incomeQuality = num(metrics.incomeQuality) ?? null;

    return {
      symbol,
      price,
      change,
      changePercent,
      dayHigh,
      dayLow,
      yearHigh,
      yearLow,
      peRatio: peRatio ? parseFloat(peRatio.toFixed(2)) : null,
      eps: eps ? parseFloat(eps.toFixed(2)) : null,
      marketCap,
      sector,
      industry,
      sectorAveragePE: sectorAveragePE ? parseFloat(sectorAveragePE.toFixed(2)) : null,
      industryAveragePE: industryAveragePE ? parseFloat(industryAveragePE.toFixed(2)) : null,
      // Growth metrics
      revenueGrowth: revenueGrowth ? parseFloat((revenueGrowth * 100).toFixed(2)) : null,
      epsGrowth: epsGrowth ? parseFloat((epsGrowth * 100).toFixed(2)) : null,
      netIncomeGrowth: netIncomeGrowth ? parseFloat((netIncomeGrowth * 100).toFixed(2)) : null,
      operatingIncomeGrowth: operatingIncomeGrowth ? parseFloat((operatingIncomeGrowth * 100).toFixed(2)) : null,
      // Profitability metrics
      returnOnAssets: returnOnAssets ? parseFloat((returnOnAssets * 100).toFixed(2)) : null,
      returnOnEquity: returnOnEquity ? parseFloat((returnOnEquity * 100).toFixed(2)) : null,
      returnOnInvestedCapital: returnOnInvestedCapital ? parseFloat((returnOnInvestedCapital * 100).toFixed(2)) : null,
      earningsYield: earningsYield ? parseFloat((earningsYield * 100).toFixed(2)) : null,
      operatingReturnOnAssets: operatingReturnOnAssets ? parseFloat((operatingReturnOnAssets * 100).toFixed(2)) : null,
      // Liquidity metrics
      currentRatio: currentRatio ? parseFloat(currentRatio.toFixed(2)) : null,
      workingCapital,
      netDebtToEBITDA: netDebtToEBITDA ? parseFloat(netDebtToEBITDA.toFixed(2)) : null,
      // Efficiency metrics
      daysOfSalesOutstanding: daysOfSalesOutstanding ? parseFloat(daysOfSalesOutstanding.toFixed(1)) : null,
      daysOfPayablesOutstanding: daysOfPayablesOutstanding ? parseFloat(daysOfPayablesOutstanding.toFixed(1)) : null,
      daysOfInventoryOutstanding: daysOfInventoryOutstanding ? parseFloat(daysOfInventoryOutstanding.toFixed(1)) : null,
      cashConversionCycle: cashConversionCycle ? parseFloat(cashConversionCycle.toFixed(1)) : null,
      // Cash flow metrics
      freeCashFlowYield: freeCashFlowYield ? parseFloat((freeCashFlowYield * 100).toFixed(2)) : null,
      freeCashFlowToEquity,
      freeCashFlowToFirm,
      // Valuation multiples
      evToSales: evToSales ? parseFloat(evToSales.toFixed(2)) : null,
      evToEBITDA: evToEBITDA ? parseFloat(evToEBITDA.toFixed(2)) : null,
      incomeQuality: incomeQuality ? parseFloat(incomeQuality.toFixed(2)) : null,
      source: 'FMP Starter (complete financial metrics)',
      error: null
    };
  } catch (err: any) {
    return {
      symbol,
      error: `Valuation fetch failed: ${err.message}`
    };
  }
}
