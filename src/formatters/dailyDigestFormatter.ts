import { NewsDigest } from '../agents/dailyNewsDigest';

export function formatDailyDigest(digest: NewsDigest, mode: 'noob' | 'professional' = 'professional'): string {
  if (mode === 'noob') {
    return formatNoobDigest(digest);
  }
  return formatProfessionalDigest(digest);
}

function formatProfessionalDigest(digest: NewsDigest): string {
  let output = '';

  output += `\n${'═'.repeat(80)}\n`;
  output += `  📰 DAILY MARKET DIGEST — ${digest.date}\n`;
  output += `${'═'.repeat(80)}\n\n`;

  // Market Overview
  output += `1️⃣  MARKET OVERVIEW\n${'─'.repeat(80)}\n`;
  output += `  S&P 500:  ${digest.marketOverview.sp500.price.toFixed(2)} | Change: ${digest.marketOverview.sp500.changePercent.toFixed(2)}%\n`;
  output += `  Nasdaq:   ${digest.marketOverview.nasdaq.price.toFixed(2)} | Change: ${digest.marketOverview.nasdaq.changePercent.toFixed(2)}%\n\n`;

  // Stock News
  if (digest.stockNews.length > 0) {
    output += `2️⃣  YOUR WATCHLIST\n${'─'.repeat(80)}\n`;
    digest.stockNews.forEach((stock) => {
      const icon = stock.sentiment === 'Positive' ? '✅' : stock.sentiment === 'Negative' ? '⚠️' : '⚪';
      const importance = stock.importance === 'High' ? '🔴' : stock.importance === 'Medium' ? '🟡' : '⚪';
      output += `  ${importance} ${icon} ${stock.symbol}: ${stock.title}\n`;
    });
    output += '\n';
  }

  // Sector News
  if (digest.sectorNews.length > 0) {
    output += `3️⃣  SECTOR TRENDS\n${'─'.repeat(80)}\n`;
    digest.sectorNews.forEach((sector) => {
      const icon = sector.sentiment === 'Positive' ? '📈' : sector.sentiment === 'Negative' ? '📉' : '→';
      output += `  ${icon} ${sector.sector}: ${sector.title}\n`;
    });
    output += '\n';
  }

  // Economic News
  if (digest.economicNews.length > 0) {
    output += `4️⃣  ECONOMIC INDICATORS\n${'─'.repeat(80)}\n`;
    digest.economicNews.forEach((econ) => {
      const icon = econ.sentiment === 'Positive' ? '📊' : econ.sentiment === 'Negative' ? '⚠️' : '📋';
      output += `  ${icon} ${econ.event.toUpperCase()}\n`;
      output += `     ${econ.impact}\n`;
    });
    output += '\n';
  }

  // Key Takeaways
  output += `5️⃣  KEY TAKEAWAYS\n${'─'.repeat(80)}\n`;
  digest.keyTakeaways.forEach((takeaway) => {
    output += `  • ${takeaway}\n`;
  });

  output += `\n${'═'.repeat(80)}\n`;
  return output;
}

function formatNoobDigest(digest: NewsDigest): string {
  let output = '';

  output += `\n${'═'.repeat(80)}\n`;
  output += `  🌱 DAILY MARKET DIGEST FOR BEGINNERS — ${digest.date}\n`;
  output += `  (Simple English, no jargon)\n`;
  output += `${'═'.repeat(80)}\n\n`;

  // Market Overview
  output += `📊 HOW IS THE MARKET DOING TODAY?\n${'─'.repeat(80)}\n`;
  const sp500Direction = digest.marketOverview.sp500.changePercent > 0 ? 'UP ⬆️' : 'DOWN ⬇️';
  const nasdaqDirection = digest.marketOverview.nasdaq.changePercent > 0 ? 'UP ⬆️' : 'DOWN ⬇️';

  output += `\nS&P 500 (the average of 500 big companies):\n`;
  output += `  ${sp500Direction} by ${Math.abs(digest.marketOverview.sp500.changePercent).toFixed(2)}%\n`;
  output += `  → This is the main market benchmark. If it's up, the market is generally healthy.\n`;

  output += `\nNasdaq (tech-heavy index):\n`;
  output += `  ${nasdaqDirection} by ${Math.abs(digest.marketOverview.nasdaq.changePercent).toFixed(2)}%\n`;
  output += `  → This has a lot of tech companies like Apple, Microsoft, etc.\n\n`;

  // Stock News
  if (digest.stockNews.length > 0) {
    output += `👀 NEWS ABOUT STOCKS YOU CARE ABOUT\n${'─'.repeat(80)}\n`;
    digest.stockNews.forEach((stock) => {
      const emoji =
        stock.sentiment === 'Positive' ? '😊 Good news' : stock.sentiment === 'Negative' ? '😟 Bad news' : '😐 Neutral news';

      output += `\n${emoji} — ${stock.symbol}\n`;
      output += `"${stock.title}"\n`;
    });
    output += '\n';
  }

  // Sector News
  if (digest.sectorNews.length > 0) {
    output += `🏭 WHAT'S HAPPENING IN DIFFERENT INDUSTRIES\n${'─'.repeat(80)}\n`;
    digest.sectorNews.forEach((sector) => {
      const emoji = sector.sentiment === 'Positive' ? '📈' : sector.sentiment === 'Negative' ? '📉' : '→';
      output += `\n${emoji} ${sector.sector} Industry\n`;
      output += `"${sector.title}"\n`;
    });
    output += '\n';
  }

  // Economic News
  if (digest.economicNews.length > 0) {
    output += `💰 IMPORTANT ECONOMIC NEWS\n${'─'.repeat(80)}\n`;
    output += `\nThese are things that affect YOUR money:\n`;
    digest.economicNews.forEach((econ) => {
      output += `\n• ${econ.event.toUpperCase()}\n`;
      output += `  ${econ.impact}\n`;
      output += `  Why it matters: Things like interest rates and inflation affect\n`;
      output += `  how much your money is worth and how companies perform.\n`;
    });
    output += '\n';
  }

  // Simple Takeaways
  output += `✅ QUICK SUMMARY (What You Need to Know)\n${'─'.repeat(80)}\n`;
  digest.keyTakeaways.forEach((takeaway) => {
    output += `  • ${takeaway}\n`;
  });

  output += `\n💡 TIP: Don't panic if the market is down 1-2% in a day.\n`;
  output += `    That's normal! Focus on long-term trends, not daily swings.\n`;

  output += `\n${'═'.repeat(80)}\n`;
  return output;
}
