import { getValuation } from './valuationExtractor';

export interface PeerComparisonResult {
  symbol: string;
  peers: { symbol: string; pe: number | null; peg: number | null }[];
  sectorAveragePE: number | null;
  sectorAveragePEG: number | null;
  source: string;
}

export async function getPeerComparison(symbol: string): Promise<PeerComparisonResult> {
  // 🔧 TEMP MOCK: You'll replace this with a scraper later
  const mockPeers = ['NVDA', 'INTC', 'QCOM'];

  const valuations = await Promise.all(
    mockPeers.map(async (peer) => {
      const v = await getValuation(peer);
      return {
        symbol: peer,
        pe: v.peRatio,
        peg: v.pegRatio
      };
    })
  );

  const validPEs = valuations.map(v => v.pe).filter(n => n != null) as number[];
  const validPEGs = valuations.map(v => v.peg).filter(n => n != null) as number[];

  const avg = (nums: number[]) =>
    nums.length ? parseFloat((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)) : null;

  return {
    symbol,
    peers: valuations,
    sectorAveragePE: avg(validPEs),
    sectorAveragePEG: avg(validPEGs),
    source: 'Mocked Finviz'
  };
}
