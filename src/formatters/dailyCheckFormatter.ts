import type { DailyCheckResult, RiskAlert, RiskSeverity } from '../services/dailyCheck';

const SEVERITY_EMOJI: Record<RiskSeverity, string> = {
  high: '🔴',
  medium: '🟠',
  low: '🟡'
};

function getStructuralAlertLines(result: DailyCheckResult): string[] {
  const lines: string[] = [];
  const nd = result.structuralRisk.ndToEbitda;
  const cyclical = result.isCyclicalSector;
  const median = result.sectorMedianNDtoEbitda;
  if (nd != null && nd > 5 && cyclical) {
    const medianReasonable = median != null && median >= 0.5 && median < 20;
    lines.push(
      medianReasonable
        ? `Leverage ${nd.toFixed(1)}x — Above sector median (${median.toFixed(1)}x)`
        : `Leverage ${nd.toFixed(1)}x — Above sector median`
    );
    lines.push(`Debt sensitivity to occupancy and fuel cost volatility`);
  } else if (nd != null && nd > 5) {
    lines.push(`${SEVERITY_EMOJI.high} Elevated leverage: Net Debt/EBITDA ${nd.toFixed(1)}x`);
  } else if (nd != null && nd > 3) {
    lines.push(`${SEVERITY_EMOJI.high} High leverage: Net Debt/EBITDA ${nd.toFixed(1)}x`);
  } else if (nd != null && nd >= 2) {
    lines.push(`${SEVERITY_EMOJI.medium} Elevated leverage: Net Debt/EBITDA ${nd.toFixed(1)}x`);
  }
  return lines;
}

function getFlowAlertLines(result: DailyCheckResult): string[] {
  const lines: string[] = [];
  const alerts = result.riskAlerts.filter(
    (a) =>
      a.message.includes('downgrade') ||
      a.message.includes('Insider') ||
      a.message.includes('Earnings within')
  );
  alerts.forEach((a) => {
    lines.push(`${SEVERITY_EMOJI[a.severity]} ${a.message}`);
  });
  return lines;
}

export function formatDailyCheck(result: DailyCheckResult): string {
  const {
    symbol,
    companyName,
    thesisStatus,
    baseScore,
    dailyPulse,
    confidence,
    revisionMagnitudeFlag,
    unusualRevisionSpikeFlag,
    isCyclicalSector,
    revisions,
    valuation,
    price,
    signalExplanation,
    pillars,
    riskAlerts,
    structuralRisk,
    flowRisk,
    clusterRiskDetected,
    clusterInteractionNote,
    sensitivityNote,
    hasStoredRevisionHistory
  } = result;

  const statusEmoji = thesisStatus === 'Improving' ? '🟢' : thesisStatus === 'Deteriorating' ? '🔴' : '🟡';

  let out = `\n━━━ Daily Check: ${symbol}${companyName ? ` (${companyName})` : ''} ━━━\n\n`;

  if (baseScore) {
    out += `🧠 Base Re-rating Score (Weekly): ${baseScore.total}/100 — ${baseScore.interpretation}\n`;
  }
  const highLeverage = result.structuralRisk.ndToEbitda != null && result.structuralRisk.ndToEbitda > 5;
  const flowLow = result.flowRisk.level === 'Low';
  const baseStrong = baseScore != null && baseScore.total > 70;
  const confidenceLabel =
    result.highUncertaintyTemperConfidence && confidence === 'medium' ? 'Low–Medium' :
    confidence === 'high' ? 'High' :
    confidence === 'medium' && thesisStatus === 'Improving' && (highLeverage || revisionMagnitudeFlag) && baseStrong && flowLow ? 'Medium–High' :
    confidence.charAt(0).toUpperCase() + confidence.slice(1);
  out += `🔄 Daily Pulse: ${dailyPulse >= 0 ? '+' : ''}${dailyPulse} (${statusEmoji} ${thesisStatus}) | Confidence: ${confidenceLabel}\n`;
  if (result.majorRecalibrationFlag && revisions.eps7d != null) {
    out += `   Major Estimate Recalibration Detected (${revisions.eps7d >= 0 ? '+' : ''}${revisions.eps7d.toFixed(1)}% in 7d)\n`;
  }
  if (result.revisionReliabilityWarning) {
    out += `   Revision Reliability Warning: Prior estimate base low\n`;
  }
  if (!result.majorRecalibrationFlag) {
    if (unusualRevisionSpikeFlag) {
      out += `   Unusual Revision Spike Detected (>10% in 7d, mega-cap)\n`;
    } else if (revisionMagnitudeFlag) {
      out += `   Revision Spike Detected (>10% in 7d)\n`;
    }
  }
  if (result.volatilityAlertFlag && price.change30d != null) {
    out += `   ⚠ Volatility Alert: 30d price ${price.change30d >= 0 ? '+' : ''}${price.change30d.toFixed(1)}%\n`;
  }
  if (result.uncertaintyElevatedFlag) {
    out += `   Uncertainty Elevated: Large recent price movement suggests ongoing repricing.\n`;
  }
  out += `\n`;

  out += `Setup Type:  ${result.setupType}\n`;
  out += `Positioning: ${result.positioning}\n`;
  if (result.timeHorizonBias) {
    out += `Time Horizon: ${result.timeHorizonBias}\n`;
  }
  if (result.betaVsSp500 != null && (result.setupType === 'Leveraged Cyclical Rebound' || result.setupType === 'Event-Driven Rebound' || result.setupType === 'Earnings Inflection Candidate' || result.betaVsSp500 >= 1.5)) {
    out += `Volatility:   Beta vs S&P ${result.betaVsSp500}x\n`;
  }
  if (result.volatilityExceedsBetaFlag) {
    out += `   Recent volatility exceeds historical beta profile.\n`;
  }
  out += `\n`;

  out += `── Structured Output ──\n\n`;

  const rev7 = revisions.eps7d;
  const rev30 = revisions.eps30d;
  const revRev = revisions.revenue30d;
  out += `Revisions:  `;
  if (rev7 != null || rev30 != null) {
    const parts: string[] = [];
    if (rev7 != null) parts.push(`${rev7 >= 0 ? '+' : ''}${rev7.toFixed(2)}% (7d)`);
    if (rev30 != null) parts.push(`${rev30 >= 0 ? '+' : ''}${rev30.toFixed(2)}% (30d)`);
    out += parts.join(', ');
  } else {
    out += '—';
  }
  out += `\n`;

  if (revRev != null) {
    out += `            Revenue 30d: ${revRev >= 0 ? '+' : ''}${revRev.toFixed(2)}%\n`;
  }
  if (revisions.direction) {
    out += `            Direction: ${revisions.direction}\n`;
  }
  const rb = result.revisionBreadth;
  if (rb && (rb.analystCount != null || rb.dispersionPct != null || rb.conviction)) {
    out += `\n📊 Revision Breadth Score\n`;
    const parts: string[] = [];
    if (rb.analystCount != null) parts.push(`${rb.analystCount} analysts`);
    if (rb.dispersionPct != null) parts.push(`Dispersion ${rb.dispersionPct.toFixed(1)}%`);
    if (rb.dispersionTrend) parts.push(rb.dispersionTrend);
    if (parts.length > 0) out += `   ${parts.join(' | ')}\n`;
    if (rb.conviction) out += `   Conviction: ${rb.conviction}\n`;
    if (rb.dataSourceNote) out += `   (${rb.dataSourceNote})\n`;
  }
  const si = result.shortInterest;
  if (si && (si.pctFloatShort != null || si.daysToCover != null)) {
    out += `\n🔥 Short Interest (Positioning & Flow)\n`;
    const parts: string[] = [];
    if (si.pctFloatShort != null) parts.push(`${si.pctFloatShort.toFixed(1)}% of float`);
    if (si.change30dPct != null) parts.push(`${si.change30dPct >= 0 ? '+' : ''}${si.change30dPct.toFixed(1)}% (30d)`);
    if (si.daysToCover != null) parts.push(`${si.daysToCover.toFixed(1)}d to cover`);
    if (parts.length > 0) out += `   ${parts.join(' | ')}\n`;
    if (si.dataSourceNote) out += `   (${si.dataSourceNote})\n`;
  } else if (si?.dataSourceNote) {
    out += `\n🔥 Short Interest: ${si.dataSourceNote}\n`;
  }
  const io = result.institutionalOwnership;
  if (io && (io.pctInstitutional != null || io.etfConcentrationPct != null)) {
    out += `\n🏦 Institutional Ownership (Positioning & Flow)\n`;
    const parts: string[] = [];
    if (io.pctInstitutional != null) parts.push(`${io.pctInstitutional.toFixed(1)}% institutional`);
    if (io.change30dPp != null) parts.push(`${io.change30dPp >= 0 ? '+' : ''}${io.change30dPp.toFixed(1)}pp (30d)`);
    if (io.investorCount != null) parts.push(`${io.investorCount} holders`);
    if (io.etfConcentrationPct != null) parts.push(`Top 5 ETF: ${io.etfConcentrationPct.toFixed(1)}%`);
    if (parts.length > 0) out += `   ${parts.join(' | ')}\n`;
    if (io.topEtfs.length > 0) out += `   ETFs: ${io.topEtfs.slice(0, 5).join(', ')}\n`;
    if (io.dataSourceNote) out += `   (${io.dataSourceNote})\n`;
  } else if (io?.dataSourceNote) {
    out += `\n🏦 Institutional Ownership: ${io.dataSourceNote}\n`;
  }
  const opt = result.optionsSkewIv;
  if (opt && (opt.ivPercentile != null || opt.putCallRatio != null || opt.historicalVol30d != null)) {
    out += `\n📈 Options Skew & Implied Vol\n`;
    const parts: string[] = [];
    if (opt.ivPercentile != null) parts.push(`IV percentile ${opt.ivPercentile.toFixed(0)}%`);
    if (opt.putCallRatio != null) parts.push(`P/C ${opt.putCallRatio.toFixed(2)}`);
    if (opt.historicalVol30d != null) parts.push(`30d hist vol ${opt.historicalVol30d.toFixed(1)}%`);
    if (parts.length > 0) out += `   ${parts.join(' | ')}\n`;
    if (opt.dataSourceNote) out += `   (${opt.dataSourceNote})\n`;
  } else if (opt?.dataSourceNote) {
    out += `\n📈 Options Skew & IV: ${opt.dataSourceNote}\n`;
  }
  const pf = result.passiveFlow;
  if (pf && (pf.isSp500Constituent || pf.sp500WeightPct != null || pf.etfConcentrationPct != null)) {
    out += `\n📊 Passive Flow Sensitivity\n`;
    const parts: string[] = [];
    if (pf.isSp500Constituent) parts.push('S&P 500');
    if (pf.sp500WeightPct != null) parts.push(`${pf.sp500WeightPct.toFixed(2)}% of index`);
    if (pf.etfConcentrationPct != null) parts.push(`Top 5 ETF: ${pf.etfConcentrationPct.toFixed(1)}%`);
    if (parts.length > 0) out += `   ${parts.join(' | ')}\n`;
    if (pf.topEtfs.length > 0) out += `   ETFs: ${pf.topEtfs.slice(0, 5).join(', ')}\n`;
    if (pf.dataSourceNote) out += `   (${pf.dataSourceNote})\n`;
  } else if (pf?.dataSourceNote) {
    out += `\n📊 Passive Flow: ${pf.dataSourceNote}\n`;
  }
  out += `\n`;

  out += `Valuation:  `;
  if (valuation.fcfYieldNow != null) {
    out += `FCF yield ${valuation.fcfYieldNow.toFixed(1)}%`;
    if (result.negativeFcfFlag) {
      out += ` (Negative FCF)`;
    } else if (valuation.fcfYieldChange != null) {
      out += ` (${valuation.fcfYieldChange >= 0 ? '+' : ''}${valuation.fcfYieldChange.toFixed(2)}pp vs 30d)`;
    }
    if (isCyclicalSector && valuation.fcfYieldNow > 5 && !result.negativeFcfFlag) {
      out += ` [cyclical: yield depends on occupancy/demand]`;
    }
    out += `\n`;
  } else {
    out += `—\n`;
  }

  out += `\nPrice:      `;
  if (price.change7d != null || price.change30d != null) {
    const parts: string[] = [];
    if (price.change7d != null) parts.push(`${price.change7d >= 0 ? '+' : ''}${price.change7d.toFixed(1)}% (7d)`);
    if (price.change30d != null) parts.push(`${price.change30d >= 0 ? '+' : ''}${price.change30d.toFixed(1)}% (30d)`);
    out += parts.join(', ');
  } else {
    out += '—';
  }
  out += `\n`;

  const rs = result.relativeStrength;
  if (rs && (rs.vsSp500_7d != null || rs.vsSp500_30d != null)) {
    const parts: string[] = [];
    if (rs.vsSp500_7d != null) parts.push(`${rs.vsSp500_7d >= 0 ? '+' : ''}${rs.vsSp500_7d.toFixed(1)}pp vs S&P (7d)`);
    if (rs.vsSp500_30d != null) parts.push(`${rs.vsSp500_30d >= 0 ? '+' : ''}${rs.vsSp500_30d.toFixed(1)}pp vs S&P (30d)`);
    out += `            ${parts.join(', ')}\n`;
  }
  out += `\n`;

  out += `Signal:     ${signalExplanation.type} ${signalExplanation.emoji}\n`;
  signalExplanation.lines.forEach((line) => {
    out += `            ${line}\n`;
  });
  out += `\n`;

  const dailyPillarScore = pillars.revisionDelta + pillars.valuationCompression + pillars.divergence + pillars.riskChange;
  out += `── Daily Pillars (Pulse Score: ${dailyPillarScore}/100) ──\n`;
  out += `   Revision:   ${pillars.revisionDelta}/40\n`;
  out += `   Valuation:  ${pillars.valuationCompression}/25\n`;
  out += `   Divergence: ${pillars.divergence}/20\n`;
  out += `   Risk:       ${pillars.riskChange}/15\n`;

  out += `\n── Risk ──\n`;

  const structLabel =
    result.structuralRisk.structuralRiskNote === 'Net Cash Position'
      ? 'Very Low (Net Cash)'
      : result.structuralRisk.structuralRiskNote === 'Negative EBITDA Risk'
        ? 'Low — Profitability Risk'
        : structuralRisk.level;
  out += `Structural Risk (Quarterly): ${structLabel}\n`;
  const structuralLines = getStructuralAlertLines(result);
  structuralLines.forEach((line) => {
    out += `   ${line}\n`;
  });
  if (structuralLines.length === 0 && structuralRisk.ndToEbitda != null) {
    if (structuralRisk.ndToEbitda < 0 && result.structuralRisk.structuralRiskNote) {
      out += `   ND/EBITDA ${structuralRisk.ndToEbitda.toFixed(1)}x — ${result.structuralRisk.structuralRiskNote}\n`;
    } else {
      out += `   ND/EBITDA ${structuralRisk.ndToEbitda.toFixed(1)}x\n`;
    }
  }

  out += `\nFlow Risk (7d): ${flowRisk.level}\n`;
  const flowLines = getFlowAlertLines(result);
  flowLines.forEach((line) => {
    out += `   ${line}\n`;
  });

  if (result.negativeFcfFlag) {
    out += `\nCash Flow Risk: Negative FCF\n`;
  }

  if (flowRisk.items.length > 0) {
    out += `\nRisk Change Score (7d): ${flowRisk.score}\n`;
    flowRisk.items.forEach((item) => {
      const label = /^Downgrades \(\d+ in 7d\)$/.test(item.label) ? 'Downgrades cluster' : item.label;
      out += `   ${label} → ${item.delta}\n`;
    });
  }

  if (structuralRisk.score !== 0) {
    out += `\nBase Structural Risk Score: ${structuralRisk.score}\n`;
    if (structuralRisk.ndToEbitda != null && structuralRisk.ndToEbitda > 7) {
      out += `   Leverage breach (>7x)\n`;
    } else if (structuralRisk.ndToEbitda != null && structuralRisk.ndToEbitda > 5) {
      out += `   Leverage breach (>5x)\n`;
    } else if (structuralRisk.ndToEbitda != null && structuralRisk.ndToEbitda > 3) {
      out += `   Leverage breach (>3x)\n`;
    } else if (structuralRisk.ndToEbitda != null && structuralRisk.ndToEbitda >= 2) {
      out += `   Elevated leverage (2–3x)\n`;
    }
  }

  if (clusterRiskDetected && clusterInteractionNote) {
    out += `\nCluster Risk Flag ⚠\n`;
    out += `   ${clusterInteractionNote}\n`;
  } else if (clusterRiskDetected) {
    out += `\nCluster Risk Flag ⚠\n`;
    out += `   Multiple negative signals in short window.\n`;
  }

  if (sensitivityNote) {
    out += `\nSensitivity Note:\n`;
    out += `   ${sensitivityNote}\n`;
  }

  const otherAlerts = riskAlerts.filter(
    (a) =>
      !a.message.includes('downgrade') &&
      !a.message.includes('Insider') &&
      !a.message.includes('Earnings within') &&
      !a.message.includes('leverage') &&
      !a.message.includes('Leverage')
  );
  if (otherAlerts.length > 0) {
    out += `\n── Other Risk Alerts ──\n`;
    otherAlerts.forEach((alert: RiskAlert) => {
      out += `   ${SEVERITY_EMOJI[alert.severity]} ${alert.message}\n`;
    });
  }

  if (!hasStoredRevisionHistory) {
    out += `\n   Note: Building revision history. Run daily to enable true 7d/30d deltas.\n`;
  }

  return out;
}
