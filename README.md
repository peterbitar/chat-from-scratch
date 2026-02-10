# Chat From Scratch

Finance-focused chat and stock checkup API (The Rabbit).

**Live:** https://chat-from-scratch-production.up.railway.app

### Endpoints

- `POST /api/chat` — Ask questions (body: `{ "question": "..." }`)
- `GET /api/checkup/:ticker` — Stock checkup (e.g. `/api/checkup/AAPL`)
- `GET /health` — Health check

See [DOCUMENTATION/QUICK_START.md](DOCUMENTATION/QUICK_START.md) for full API and local run.
