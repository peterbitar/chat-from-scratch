# Deploy to Railway

## Quick deploy

1. **Connect repo**  
   [railway.app](https://railway.app) → New Project → Deploy from GitHub repo

2. **Environment variables** (in Railway project → Variables)  
   - `FMP_API_KEY` – your Financial Modeling Prep API key  
   - `OPENAI_API_KEY` – your OpenAI API key (for chat, news storyline)

3. **Add domain**  
   Project → Settings → Networking → Generate Domain

## Endpoints

After deploy, your API is at `https://your-app.up.railway.app`:

- `GET /health` – health check
- `POST /api/chat` – chat
- `POST /api/snapshot` – stock snapshot (iOS)
- `GET /api/snapshot/:ticker` – stock snapshot
- `POST /api/holding-checkup` – holding checkup

## iOS app

Base URL: `https://your-app.up.railway.app`

```http
POST /api/snapshot
Content-Type: application/json

{"ticker": "AAPL", "type": "stock"}
```
