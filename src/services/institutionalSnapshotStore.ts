/**
 * Institutional ownership snapshot storage — enables 30d trend.
 * Stores: symbol, date, pctInstitutional
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'daily-check-institutional');

export interface InstitutionalSnapshot {
  date: string;
  pctInstitutional: number;
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

export function loadInstitutionalSnapshots(symbol: string, maxDays = 40): InstitutionalSnapshot[] {
  const filePath = snapshotPath(symbol);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const arr = JSON.parse(raw) as InstitutionalSnapshot[];
    if (!Array.isArray(arr)) return [];
    const sorted = [...arr].sort((a, b) => b.date.localeCompare(a.date));
    const seen = new Set<string>();
    const deduped: InstitutionalSnapshot[] = [];
    for (const s of sorted) {
      if (s.date && typeof s.pctInstitutional === 'number' && !seen.has(s.date)) {
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

export function saveInstitutionalSnapshot(symbol: string, pctInstitutional: number): void {
  const today = new Date().toISOString().slice(0, 10);
  const snap: InstitutionalSnapshot = { date: today, pctInstitutional };
  const existing = loadInstitutionalSnapshots(symbol, 365);
  const byDate = new Map(existing.map((s) => [s.date, s]));
  byDate.set(today, snap);
  const sorted = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  const filePath = snapshotPath(symbol);
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 0), 'utf-8');
}

function snapshotAtOrBefore(
  snapshots: InstitutionalSnapshot[],
  targetDate: string
): InstitutionalSnapshot | null {
  for (const s of snapshots) {
    if (s.date <= targetDate) return s;
  }
  return null;
}

export interface InstitutionalDeltas {
  pctInstitutional: number | null;
  change30dPp: number | null;
  hasStoredHistory: boolean;
}

export function computeInstitutionalDeltas(
  symbol: string,
  todayPct: number
): InstitutionalDeltas {
  const snapshots = loadInstitutionalSnapshots(symbol, 40);
  const d30 = new Date();
  d30.setDate(d30.getDate() - 30);
  const date30 = d30.toISOString().slice(0, 10);
  const snap30 = snapshotAtOrBefore(snapshots, date30);

  const change30dPp =
    snap30 != null ? Math.round((todayPct - snap30.pctInstitutional) * 10) / 10 : null;

  return {
    pctInstitutional: todayPct,
    change30dPp,
    hasStoredHistory: snap30 != null
  };
}
