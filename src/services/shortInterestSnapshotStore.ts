/**
 * Short interest snapshot storage — enables 30d trend for % float short.
 * Stores: symbol, date, pctFloatShort, daysToCover
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'daily-check-short-interest');

export interface ShortInterestSnapshot {
  date: string;
  pctFloatShort: number;
  daysToCover: number | null;
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
export function loadShortInterestSnapshots(symbol: string, maxDays = 40): ShortInterestSnapshot[] {
  const filePath = snapshotPath(symbol);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const arr = JSON.parse(raw) as ShortInterestSnapshot[];
    if (!Array.isArray(arr)) return [];
    const sorted = [...arr].sort((a, b) => b.date.localeCompare(a.date));
    const seen = new Set<string>();
    const deduped: ShortInterestSnapshot[] = [];
    for (const s of sorted) {
      if (s.date && typeof s.pctFloatShort === 'number' && !seen.has(s.date)) {
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
export function saveShortInterestSnapshot(
  symbol: string,
  pctFloatShort: number,
  daysToCover: number | null
): void {
  const today = new Date().toISOString().slice(0, 10);
  const snap: ShortInterestSnapshot = { date: today, pctFloatShort, daysToCover };
  const existing = loadShortInterestSnapshots(symbol, 365);
  const byDate = new Map(existing.map((s) => [s.date, s]));
  byDate.set(today, snap);
  const sorted = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  const filePath = snapshotPath(symbol);
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 0), 'utf-8');
}

/** Get snapshot for a specific date (or nearest before). */
function snapshotAtOrBefore(
  snapshots: ShortInterestSnapshot[],
  targetDate: string
): ShortInterestSnapshot | null {
  for (const s of snapshots) {
    if (s.date <= targetDate) return s;
  }
  return null;
}

export interface ShortInterestDeltas {
  pctFloatShort: number | null;
  change30dPct: number | null;
  daysToCover: number | null;
  hasStoredHistory: boolean;
}

/** Compute 30d change from stored snapshots. */
export function computeShortInterestDeltas(
  symbol: string,
  todayPct: number,
  todayDaysToCover: number | null
): ShortInterestDeltas {
  const snapshots = loadShortInterestSnapshots(symbol, 40);
  const d30 = new Date();
  d30.setDate(d30.getDate() - 30);
  const date30 = d30.toISOString().slice(0, 10);
  const snap30 = snapshotAtOrBefore(snapshots, date30);

  const change30dPct =
    snap30 && snap30.pctFloatShort !== 0
      ? ((todayPct - snap30.pctFloatShort) / Math.abs(snap30.pctFloatShort)) * 100
      : null;

  return {
    pctFloatShort: todayPct,
    change30dPct,
    daysToCover: todayDaysToCover,
    hasStoredHistory: snap30 != null
  };
}
