/**
 * Daily estimate snapshot storage — enables true 7d/30d revision deltas.
 * Stores: symbol, date, eps_next_fy_estimate, revenue_next_fy_estimate
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'daily-check-estimates');

export interface EstimateSnapshot {
  date: string;
  epsNextFy: number;
  revenueNextFy: number;
  /** Optional: for Revision Breadth / dispersion trend */
  numberOfAnalysts?: number;
  epsHigh?: number;
  epsLow?: number;
}

function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function snapshotPath(symbol: string): string {
  ensureDir(DATA_DIR);
  return path.join(DATA_DIR, `${symbol.toUpperCase()}.json`);
}

/** Load snapshots for symbol, newest first. Keeps last maxDays. */
export function loadSnapshots(symbol: string, maxDays = 35): EstimateSnapshot[] {
  const filePath = snapshotPath(symbol);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const arr = JSON.parse(raw) as EstimateSnapshot[];
    if (!Array.isArray(arr)) return [];
    const sorted = [...arr].sort((a, b) => b.date.localeCompare(a.date));
    const seen = new Set<string>();
    const deduped: EstimateSnapshot[] = [];
    for (const s of sorted) {
      if (s.date && typeof s.epsNextFy === 'number' && !seen.has(s.date)) {
        seen.add(s.date);
        deduped.push(s);
        if (deduped.length >= maxDays) break;
      }
    }
    return deduped;
  } catch {
    return [];
  }
}

/** Save today's snapshot. Deduplicates by date (overwrites same day). */
export function saveSnapshot(
  symbol: string,
  epsNextFy: number,
  revenueNextFy: number,
  opts?: { numberOfAnalysts?: number; epsHigh?: number; epsLow?: number }
): void {
  const today = new Date().toISOString().slice(0, 10);
  const snap: EstimateSnapshot = {
    date: today,
    epsNextFy,
    revenueNextFy,
    ...(opts && { numberOfAnalysts: opts.numberOfAnalysts, epsHigh: opts.epsHigh, epsLow: opts.epsLow })
  };
  const existing = loadSnapshots(symbol, 365);
  const byDate = new Map(existing.map((s) => [s.date, s]));
  byDate.set(today, snap);
  const sorted = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  const filePath = snapshotPath(symbol);
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 0), 'utf-8');
}

/** Get snapshot for a specific date (or nearest before). */
function snapshotAtOrBefore(snapshots: EstimateSnapshot[], targetDate: string): EstimateSnapshot | null {
  for (const s of snapshots) {
    if (s.date <= targetDate) return s;
  }
  return null;
}

export interface RevisionDeltas {
  eps7dPct: number | null;
  eps30dPct: number | null;
  revenue30dPct: number | null;
  hasStoredHistory: boolean;
  /** Prior EPS (7d ago) — for reliability check when base is small */
  priorEps7d: number | null;
  /** Dispersion 7d ago (for Revision Breadth: narrowing/widening) */
  priorDispersion7d: number | null;
  /** Dispersion 30d ago */
  priorDispersion30d: number | null;
}

/** Compute dispersion from high/low/avg: (high - low) / |avg| * 100. Returns null if insufficient data. */
function dispersionPct(epsHigh: number, epsLow: number, epsAvg: number): number | null {
  if (!Number.isFinite(epsAvg) || Math.abs(epsAvg) < 1e-9) return null;
  if (!Number.isFinite(epsHigh) || !Number.isFinite(epsLow)) return null;
  return ((epsHigh - epsLow) / Math.abs(epsAvg)) * 100;
}

/** Compute 7d and 30d revision deltas from stored snapshots. */
export function computeRevisionDeltas(symbol: string, todayEps: number, todayRevenue: number): RevisionDeltas {
  const snapshots = loadSnapshots(symbol, 35);
  const today = new Date().toISOString().slice(0, 10);
  const d7 = new Date();
  d7.setDate(d7.getDate() - 7);
  const d30 = new Date();
  d30.setDate(d30.getDate() - 30);
  const date7 = d7.toISOString().slice(0, 10);
  const date30 = d30.toISOString().slice(0, 10);

  const snap7 = snapshotAtOrBefore(snapshots, date7);
  const snap30 = snapshotAtOrBefore(snapshots, date30);

  const eps7dPct = snap7 && snap7.epsNextFy !== 0
    ? ((todayEps - snap7.epsNextFy) / Math.abs(snap7.epsNextFy)) * 100
    : null;
  const eps30dPct = snap30 && snap30.epsNextFy !== 0
    ? ((todayEps - snap30.epsNextFy) / Math.abs(snap30.epsNextFy)) * 100
    : null;
  const revenue30dPct = snap30 && snap30.revenueNextFy !== 0
    ? ((todayRevenue - snap30.revenueNextFy) / Math.abs(snap30.revenueNextFy)) * 100
    : null;

  const priorDispersion7d =
    snap7?.epsHigh != null && snap7?.epsLow != null && snap7?.epsNextFy != null && snap7.epsNextFy !== 0
      ? dispersionPct(snap7.epsHigh, snap7.epsLow, snap7.epsNextFy)
      : null;
  const priorDispersion30d =
    snap30?.epsHigh != null && snap30?.epsLow != null && snap30?.epsNextFy != null && snap30.epsNextFy !== 0
      ? dispersionPct(snap30.epsHigh, snap30.epsLow, snap30.epsNextFy)
      : null;

  return {
    eps7dPct,
    eps30dPct,
    revenue30dPct,
    hasStoredHistory: snap7 != null,
    priorEps7d: snap7?.epsNextFy ?? null,
    priorDispersion7d: priorDispersion7d ?? null,
    priorDispersion30d: priorDispersion30d ?? null
  };
}

/** Sample std dev of an array. Returns null if < 2 values. */
function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Compute historical std dev of 7d and 30d revision % changes.
 * Used for surpriseScore = magnitude / historical_std_dev.
 */
export function computeRevisionStdDev(symbol: string): { std7d: number | null; std30d: number | null } {
  const snapshots = loadSnapshots(symbol, 90);
  if (snapshots.length < 4) return { std7d: null, std30d: null };

  const changes7d: number[] = [];
  const changes30d: number[] = [];

  for (let i = 0; i < snapshots.length; i++) {
    const curr = snapshots[i]!;
    for (let j = i + 1; j < snapshots.length; j++) {
      const base = snapshots[j]!;
      if (!base.epsNextFy || Math.abs(base.epsNextFy) < 1e-9) continue;
      const pct = ((curr.epsNextFy - base.epsNextFy) / Math.abs(base.epsNextFy)) * 100;
      const days = Math.round(
        (new Date(curr.date).getTime() - new Date(base.date).getTime()) / (24 * 60 * 60 * 1000)
      );
      if (days >= 5 && days <= 10) changes7d.push(pct);
      if (days >= 25 && days <= 35) changes30d.push(pct);
    }
  }

  return {
    std7d: sampleStdDev(changes7d),
    std30d: sampleStdDev(changes30d)
  };
}
