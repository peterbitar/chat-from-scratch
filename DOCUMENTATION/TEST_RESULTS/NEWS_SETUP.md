# News Sentiment Tool Setup

The news sentiment tool now uses **OpenAI's web search with sentiment analysis** to fetch real news headlines instead of hardcoded data.

## How It Works

The tool:

1. **Searches the web** for recent news about the stock using OpenAI's web search
2. **Classifies sentiment** for each headline (Positive/Negative/Neutral)
3. **Returns structured data** with title, URL, and sentiment classification

## Implementation Details

Uses OpenAI's Responses API with web search:
- ✅ Real headlines from live financial news sources
- ✅ AI-classified sentiment (accurate classification)
- ✅ Includes links to original articles
- ✅ No additional API keys needed (uses existing OPENAI_API_KEY)
- ✅ Always returns current/fresh news

## Example Response

```
Amazon (AMZN) recent news sentiment:
✅ "Amazon Q4 revenue beats expectations" - Positive
✅ "AWS growth remains strong in 2026" - Positive
✅ "Concerns over marketplace competition" - Negative
✅ "Amazon expands fulfillment centers" - Neutral
✅ "Cloud growth accelerates amid AI demand" - Positive
```

## Testing

Run the test suite to see news sentiment in action:

```bash
npm run build
npx ts-node test-agent.ts
```

Look for the "What's the market saying about Amazon?" question to see real news sentiment data with classification.

## Why This Approach?

- **No legacy endpoints**: Uses current OpenAI API, not deprecated FMP endpoints
- **Better accuracy**: GPT-4 classifies sentiment, not pre-computed scores
- **Always fresh**: Real-time web search for latest news
- **Integrated**: Works with the agent's existing web search capability
