# Test Files Documentation

## 📋 Overview

This folder contains all test/debug files used during development and validation of the Finance API.

---

## 📄 Test Files

### Core Agent Tests

#### [`test-agent.ts`](test-agent.ts)
**Purpose:** Test the main stock checkup agent
- Generates stock analysis
- Tests all layers (snapshot, health, financial, etc.)
- Validates data integration
- **Usage:** `npx ts-node test-agent.ts`

#### [`test-noob-chat.ts`](test-noob-chat.ts)
**Purpose:** Test beginner-friendly chat mode
- Simplifies financial jargon
- Tests explanation layer
- Validates accessibility features
- **Usage:** `npx ts-node test-noob-chat.ts`

---

### Endpoint Tests

#### [`test-ratings.ts`](test-ratings.ts)
**Purpose:** Test analyst ratings endpoint
- Validates `/ratings-snapshot` endpoint
- Validates `/grades-consensus` endpoint
- Tests data structure and parsing
- **Usage:** `npx ts-node test-ratings.ts`

#### [`test-sp500.ts`](test-sp500.ts)
**Purpose:** Test S&P 500 comparison
- Tests market context data
- Validates peer comparison
- **Usage:** `npx ts-node test-sp500.ts`

---

### News Endpoint Tests

#### [`test_news_direct.ts`](test_news_direct.ts)
**Purpose:** Direct news endpoint testing
- Tests `/news/stock?symbols=` parameter
- Validates news data structure
- Checks article fields
- **Usage:** `npx ts-node test_news_direct.ts`

#### [`test_news_error.ts`](test_news_error.ts)
**Purpose:** Test news endpoint error handling
- Tests error scenarios
- Validates fallback behavior
- **Usage:** `npx ts-node test_news_error.ts`

#### [`test_news_sentiment.ts`](test_news_sentiment.ts)
**Purpose:** Test sentiment analysis
- Tests sentiment calculation
- Validates categorization
- **Usage:** `npx ts-node test_news_sentiment.ts`

---

### Direct API Tests

#### [`test_axios_direct.ts`](test_axios_direct.ts)
**Purpose:** Direct axios API calls
- Low-level API testing
- Validates raw responses
- Tests endpoint connectivity
- **Usage:** `npx ts-node test_axios_direct.ts`

#### [`test_env.ts`](test_env.ts)
**Purpose:** Test environment variables
- Validates FMP API key setup
- Checks env configuration
- **Usage:** `npx ts-node test_env.ts`

---

## 🧪 Running Tests

### Individual Test
```bash
npx ts-node test-agent.ts
```

### All Tests
```bash
for file in *.ts; do
  echo "Running $file..."
  npx ts-node "$file"
  echo ""
done
```

### With Logging
```bash
npx ts-node test_with_logging.ts
```

---

## 📊 Test Coverage

### What's Tested:
- ✅ Stock checkup generation
- ✅ Analyst ratings endpoint
- ✅ News retrieval
- ✅ Sentiment analysis
- ✅ Market comparison
- ✅ API connectivity
- ✅ Error handling
- ✅ Data parsing
- ✅ Beginner mode
- ✅ Environment setup

### Stocks Tested:
- AAPL (Apple)
- PYPL (PayPal)
- MSFT (Microsoft)
- TSLA (Tesla)
- Various others

---

## 🔍 Debugging Guide

### If Tests Fail:

**API Key Issues**
```bash
# Run test_env.ts to verify
npx ts-node test_env.ts
```

**News Endpoint Issues**
```bash
# Run news-specific test
npx ts-node test_news_direct.ts
```

**Ratings Issues**
```bash
# Run ratings test
npx ts-node test-ratings.ts
```

**General Agent Issues**
```bash
# Run main agent test
npx ts-node test-agent.ts
```

---

## 📝 Test File Descriptions

| File | Type | Purpose | Status |
|------|------|---------|--------|
| test-agent.ts | Core | Main checkup generation | ✅ |
| test-noob-chat.ts | Core | Beginner mode | ✅ |
| test-ratings.ts | Endpoint | Analyst ratings | ✅ |
| test-sp500.ts | Endpoint | Market comparison | ✅ |
| test_news_direct.ts | News | Direct API call | ✅ |
| test_news_error.ts | News | Error handling | ✅ |
| test_news_sentiment.ts | News | Sentiment analysis | ✅ |
| test_axios_direct.ts | API | Raw axios calls | ✅ |
| test_env.ts | Setup | Environment check | ✅ |
| test_with_logging.ts | Debug | Enhanced logging | ✅ |

---

## 🚀 Integration Tests

These files were used to verify:

1. **Data Quality**
   - Real news articles retrieved
   - Real analyst ratings fetched
   - Real growth metrics calculated

2. **API Integration**
   - 8 parallel endpoints working
   - Data merging successful
   - Error handling functional

3. **Performance**
   - ~9-12 second response time
   - No sequential bottlenecks
   - Parallel execution verified

4. **Output Quality**
   - All layers populated correctly
   - Calculations accurate
   - Context-aware analysis working

---

## 📚 Related Documentation

- Main overview: `../README.md`
- API fixes: `../API_FIXES/README.md`
- Features: `../FEATURES/README.md`
- Results: `../TEST_RESULTS/README.md`

---

## 🔗 How These Tests Were Used

### Development Phase:
- Verified each endpoint worked
- Tested data parsing
- Validated calculations

### Debugging Phase:
- Found news endpoint issue
- Identified missing growth data
- Discovered wrong analyst endpoints

### Validation Phase:
- Confirmed all fixes working
- Tested new sector/industry integration
- Verified performance optimization

---

**Last Updated:** February 10, 2026
**Status:** All Tests Archived & Organized ✅
