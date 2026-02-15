# Industry Comparison — Validation & Recommendations

## Validation summary

### What is correct and consistent

| Area | Status | Notes |
|------|--------|--------|
| **Valuation wording** | OK | "X% below/above industry median" — sign and language aligned. |
| **PEG** | OK | Uses EPS growth only; labeled "PEG (based on EPS growth)"; disabled with reason when only revenue growth exists. |
| **Growth transparency** | OK | Revenue (YoY) and EPS (YoY) shown separately when both available. |
| **Multi-axis** | OK | Rule-based: Relative ±20%, Absolute PEG <1 / 1–2 / >2, Quality (ROE + leverage), Financial Risk (debt tiers). |
| **Peer filters** | OK | ROE < -20% excluded; P/E winsorized at top 5%; negative / extreme P/E excluded. |
| **Verdict when median flagged** | OK | "Relative discount vs peer median. Absolute valuation fair." when applicable. |
| **FCF yield** | OK | From FMP key-metrics; bands >5% / 3–5% / <3%. |
| **Data sources section** | OK | Clear and auditable. |

### Fix applied

- **peerCount** now uses **eligible peer count** (after ROE filter), not raw screener count, so "18 peers" reflects how many were actually used for medians.

---

## Recommendations (better / next steps)

### 1. High impact, same data

- **Median when all filtered out:** If `eligiblePeers` is empty after ROE filter, medians are null but `peerCount` becomes 0. You already fall back to sector/industry PE when there are no peers. Consider a one-line note in the report when `peerCount === 0` and we still show a reference PE: e.g. "Industry medians from sector/industry snapshot (no peer-level data)."
- **Growth vs median for EPS:** You show "vs median" only on Revenue (YoY). If you ever compute a **median EPS growth** from peers (you have `epsGrowth` per peer), you could add "Growth (EPS YoY): X% (Y% vs median)" for consistency.

### 2. Richer data (FMP or elsewhere)

- **Earnings revision trend:** You use annual analyst-estimates. For a true "90-day revision" signal, use a dedicated revisions endpoint (e.g. estimate revisions or analyst estimate changes) if FMP offers it, and label it "90-day EPS revision trend" in the report.
- **Margin trend:** Add operating margin (or EBITDA margin) for the last 3 years from income/statement or key-metrics, and a one-line "3Y operating margin trend: expanding / stable / contracting" to support the Quality / ROE durability message.
- **Sub-industry / D2C peers:** FMP company-screener is sector/industry. If the API allows a more specific tag (e.g. "Streaming" or "Direct-to-Consumer"), using it would improve comparability (e.g. NFLX vs streaming peers rather than all Entertainment).

### 3. Optional UX / robustness

- **Absolute Value when PEG is missing:** You default to "Fair" when PEG is not computed. You could instead show "Absolute Value: — (EPS growth required)" when `pegDisabledReason` is set, so the multi-axis view does not imply a computed absolute view.
- **FCF yield in multi-axis:** You could blend FCF yield into Absolute Value (e.g. if FCF yield > 5% and PEG is cheap → "Cheap"; if FCF < 3% and PEG fair → "Fair to expensive") for a more "reality-based" absolute view alongside PEG.

### 4. What to avoid

- Do **not** use revenue growth for PEG without an explicit "Revenue PEG" label.
- Do **not** show "premium -X%" — keep "X% below industry median" (already enforced).
- Do **not** use unfiltered peer P/E (no ROE filter, no winsorization) for institutional-style output.

---

## Bottom line

- **Logic:** Validated; one fix applied (peerCount = eligible count).
- **Best improvement with current data:** Optional note when peerCount is 0 and we still show reference PE; consider "Absolute Value: —" when PEG is disabled.
- **Best improvements with more data:** 90-day EPS revision trend, 3Y operating margin trend, and sub-industry or D2C peer set when the API allows.
