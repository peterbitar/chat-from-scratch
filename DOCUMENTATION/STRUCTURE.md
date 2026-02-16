# Product structure: Cards vs Chat

The app is organized around two layers:

- **Cards** — Three card types shown per holding: **News**, **Card** (daily summary), **Earnings**.
- **Chat** — The conversational UI; uses the same data via tools when answering questions.

---

## Cards (per holding)

| Card type | What it shows | Tools (data source) | Services |
|-----------|----------------|---------------------|----------|
| **News** | Storyline + headlines for the holding | `getNewsUpdate` | `tools/newsSentiment.ts` (FMP news + optional OpenAI); `services/newsTriggerDetection.ts` (when to fetch news for card context) |
| **Card** | Daily re-rating summary (thesis, revisions, price, risk) | `getDailyCheck`, `getStockSnapshot` | `dailyCheck`, `dominantSignalEngine`, `primaryCardBuilder`, `feedCardGenerator`, `retailFeed` / `dominantSignalFeed`; stores: `estimateSnapshotStore`, `institutionalSnapshotStore`, `shortInterestSnapshotStore` |
| **Earnings** | Last quarter recap (actuals vs estimates, guidance, reaction) | `getEarningsRecap`, `getEarningsCalendar` | `earningsRecap`; `feedCardGenerator.generateEarningsRecapCard` for LLM card |

Card UIs typically call the **services** (or API routes that wrap them) directly. Chat uses the **tools** that return the same data.

---

## Chat

- **Agent:** `agents/financeAgent.ts` — `runFinanceAgent(message, noobMode)`.
- **Tool registry:** `tools/tools.ts` — grouped into:
  - **CARDS** — `getNewsUpdate`, `getDailyCheck`, `getStockSnapshot`, `getEarningsRecap`, `getEarningsCalendar` (same data as the three card types).
  - **CHAT** — `getValuation`, `getPeerComparison`, `getAnalystRatings`, `getSP500Comparison`, `getIndustryComparison`, `getStockCheckup`, `web-search`.

Chat does not own card logic; it calls these tools when answering (e.g. “What’s the news for AAPL?” → `getNewsUpdate`).

---

## Where things live

| Area | Path | Notes |
|------|------|--------|
| Card: News | `tools/newsSentiment.ts`, `services/newsTriggerDetection.ts` | News card data + “when to fetch news” for card/LLM |
| Card: Daily card | `services/dailyCheck.ts`, `dominantSignalEngine.ts`, `primaryCardBuilder.ts`, `feedCardGenerator.ts`, `retailFeed.ts`, `dominantSignalFeed.ts` | Daily check → dominant signal → primary card → optional LLM card |
| Card: Earnings | `services/earningsRecap.ts`, `feedCardGenerator.ts` (earnings card) | Recap + optional LLM earnings card |
| Chat | `agents/financeAgent.ts`, `tools/tools.ts` | Agent + tool registry |
| Shared (used by cards + chat) | `tools/valuationExtractor.ts`, `industryPeers.ts`, `priceHistory.ts`, `analystEstimates.ts`, etc.; `services/industryComparison.ts`, `stockSnapshot.ts` | Valuation, peers, market data, industry comparison, snapshot |

---

## API routes (reference)

- **Cards:** News/card/earnings data is typically loaded per holding by the client (or via endpoints like `/api/daily-check/:ticker`, `/api/earnings-recap/:ticker`).
- **Chat:** `POST /api/chat`, `POST /api/chat/external` — use the tool registry in `tools/tools.ts`.
