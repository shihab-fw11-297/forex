const express = require('express');
const app = express();
const port = 3000;
const axios = require("axios");
const technicalIndicators = require("technicalindicators");
const fs = require("fs/promises");
const moment = require("moment");
const BASE_URL = "https://api.finage.co.uk";
const api = ["API_KEY43K5X8SPEB505UUI124BX3MSKVFNNTWI"]
const cache = {};
// Random API Key Selector
function getRandomApiKey() {
  const index = Math.floor(Math.random() * api.length);
  return api[index];
}

async function fetchHistoricalData(
  symbol,
  timeframe,
  { startDate, endDate, limit } = {}
) {
  const timeframesMap = {
    "2m": { unit: "minute", daysBack:5, apiLimit: 20000, time: 2 },
    "3m": { unit: "minute", daysBack:5, apiLimit: 20000, time: 3 },
    "5m": { unit: "minute", daysBack: 10, apiLimit: 20000, time: 5 },
    "15m": { unit: "minute", daysBack: 25, apiLimit: 20000, time: 15 },
    "30m": { unit: "minute", daysBack: 30, apiLimit: 5000, time: 30 },
    "1h": { unit: "hour", daysBack: 50, apiLimit: 10000, time: 1 },
    "1D": { unit: "day", daysBack: 90, apiLimit: 5000, time: 1 },
  };

  const config = timeframesMap[timeframe];
  if (!config) throw new Error(`Unsupported timeframe: ${timeframe}`);

  // Date handling with validation
  const now = moment().startOf('day');
  const defaultStart = moment(now).subtract(config.daysBack, 'days');
  const defaultEnd = moment(now).add(2, 'days');
  
  const start = startDate 
    ? moment(startDate).startOf('day')
    : defaultStart;
  const end = endDate 
    ? moment(endDate).endOf('day') 
    : defaultEnd;

  if (start.isAfter(end)) {
    throw new Error(`Invalid date range: ${start.format()} > ${end.format()}`);
  }

  // Cache key with date range fingerprint
  const cacheKey = `${symbol}-${timeframe}-${start.format('YYYYMMDD')}-${end.format('YYYYMMDD')}`;
  
  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < 60 * 60 * 1000) {
    return cache[cacheKey].data.slice(0, limit);
  }

  try {
    let allData = [];
    let currentStart = moment(start);
    const apiLimit = Math.min(config.apiLimit, limit || Infinity);
    
    // Pagination handling
    while(currentStart.isBefore(end)) {
      const batchEnd = moment.min(end, moment(currentStart).add(1, 'month'));
      const url = `${BASE_URL}/agg/forex/${symbol.toLowerCase()}/${
        config.time
      }/${config.unit}/${currentStart.format('YYYY-MM-DD')}/${batchEnd.format(
        'YYYY-MM-DD'
      )}?apikey=${getRandomApiKey()}&limit=${apiLimit}`;

      
      
      const { data } = await axios.get(url);
      console.log("url",url,data.results?.length);
      const formattedData = data.results
        .map(({ t, o, h, l, c, v }) => ({
          timestamp: t,
          open: o,
          high: h,
          low: l,
          close: c,
          volume: v,
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

      allData = [...allData, ...formattedData];
      
      if (data.results.length < apiLimit || allData.length >= limit) break;
      currentStart = moment(data.results[data.results.length - 1].t).add(1, 'ms');
    }

    // Cache management
    cache[cacheKey] = {
      data: allData,
      timestamp: Date.now(),
    };

    return limit ? allData.slice(-limit) : allData;
  } catch (error) {
    console.error(`Failed fetching ${symbol} data:`, error.message);
    throw new Error(`Data fetch failed: ${error.response?.statusText || error.message}`);
  }
}

function calculateIndicators(data) {
  try {
    const closes = data.map((candle) => candle.close);
    const highs = data.map((candle) => candle.high);
    const lows = data.map((candle) => candle.low);
    const volumes = data.map((candle) => candle.volume);

    const sma20 = technicalIndicators.SMA.calculate({
      period: 20,
      values: closes,
    });
    const sma50 = technicalIndicators.SMA.calculate({
      period: 50,
      values: closes,
    });
    const sma200 = technicalIndicators.SMA.calculate({
      period: 200,
      values: closes,
    });

    const ema10 = technicalIndicators.EMA.calculate({
      period: 10,
      values: closes,
    });
    const ema21 = technicalIndicators.EMA.calculate({
      period: 21,
      values: closes,
    });

    const macd = technicalIndicators.MACD.calculate({
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      values: closes,
    });

    const rsi14 = technicalIndicators.RSI.calculate({
      period: 14,
      values: closes,
    });
    const rsi5 = technicalIndicators.RSI.calculate({
      period: 5,
      values: closes,
    });
    const bb = technicalIndicators.BollingerBands.calculate({
      period: 20,
      stdDev: 2,
      values: closes,
    });

    const adx = technicalIndicators.ADX.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    });

    const atr = technicalIndicators.ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    });

    return {
      sma: { sma20, sma50, sma200 },
      ema: { ema10, ema21 },
      macd,
      rsi: { rsi14, rsi5 },
      bb,
      adx,
      atr,
      lastClose: closes[closes.length - 1],
      lastCandle: data[data.length - 1],
    };
  } catch (err) {
    console.log("error", err);
  }
}

function detectHeadAndShoulders(data) {
  if (data.length < 30) return { found: false };
  const significantPeaks = findSignificantPeaks(data, 5);

  if (significantPeaks.length < 3) return { found: false };

  for (let i = 0; i < significantPeaks.length - 2; i++) {
    const leftShoulder = significantPeaks[i];
    const head = significantPeaks[i + 1];
    const rightShoulder = significantPeaks[i + 2];
    if (head.value > leftShoulder.value && head.value > rightShoulder.value) {
      const shouldersDiff =
        Math.abs(leftShoulder.value - rightShoulder.value) / leftShoulder.value;
      if (shouldersDiff < 0.02) {
        return {
          found: true,
          pattern: "head and shoulders",
          neckline: Math.min(
            data[leftShoulder.index + 1].low,
            data[head.index + 1].low
          ),
        };
      }
    }
  }

  return { found: false };
}

function detectBullishFlag(data) {
  try {
    if (data.length < 20) return { found: false };
    let flagPoleFound = false;
    let flagPoleStart = 0;
    let flagPoleEnd = 0;

    for (let i = 5; i < data.length - 5; i++) {
      const priceChange = (data[i].close - data[i - 5].close) / data[i - 5].close;
      if (priceChange > 0.03) {
        flagPoleFound = true;
        flagPoleStart = i - 5;
        flagPoleEnd = i;
        break;
      }
    }

    if (!flagPoleFound) return { found: false };
    if (flagPoleEnd + 5 >= data.length) return { found: false };

    const consolidationStart = flagPoleEnd;
    const consolidationEnd = Math.min(consolidationStart + 10, data.length - 1);
    const upperBounds = [];
    const lowerBounds = [];

    for (let i = consolidationStart; i <= consolidationEnd; i++) {
      upperBounds.push(data[i].high);
      lowerBounds.push(data[i].low);
    }

    const consolidationPriceChange =
      (data[consolidationEnd].close - data[consolidationStart].close) /
      data[consolidationStart].close;
    if (consolidationPriceChange > -0.02 && consolidationPriceChange < 0.01) {
      return {
        found: true,
        pattern: "bullish flag",
        flagPoleStart,
        flagPoleEnd,
        consolidationStart,
        consolidationEnd,
        targetPrice:
          data[flagPoleEnd].close +
          (data[flagPoleEnd].close - data[flagPoleStart].close),
      };
    }

    return { found: false };
  } catch (err) {
    console.log(err);
  }
}

function detectBearishFlag(data) {
  try {
    if (data.length < 20) return { found: false };
    let flagPoleFound = false;
    let flagPoleStart = 0;
    let flagPoleEnd = 0;

    for (let i = 5; i < data.length - 5; i++) {
      const priceChange = (data[i].close - data[i - 5].close) / data[i - 5].close;
      if (priceChange < -0.03) {
        flagPoleFound = true;
        flagPoleStart = i - 5;
        flagPoleEnd = i;
        break;
      }
    }

    if (!flagPoleFound) return { found: false };
    if (flagPoleEnd + 5 >= data.length) return { found: false };
    const consolidationStart = flagPoleEnd;
    const consolidationEnd = Math.min(consolidationStart + 10, data.length - 1);
    const upperBounds = [];
    const lowerBounds = [];

    for (let i = consolidationStart; i <= consolidationEnd; i++) {
      upperBounds.push(data[i].high);
      lowerBounds.push(data[i].low);
    }
    const consolidationPriceChange =
      (data[consolidationEnd].close - data[consolidationStart].close) /
      data[consolidationStart].close;
    if (consolidationPriceChange < 0.02 && consolidationPriceChange > -0.01) {
      return {
        found: true,
        pattern: "bearish flag",
        flagPoleStart,
        flagPoleEnd,
        consolidationStart,
        consolidationEnd,
        targetPrice:
          data[flagPoleEnd].close -
          (data[flagPoleStart].close - data[flagPoleEnd].close),
      };
    }

    return { found: false };
  } catch (err) {
    console.log(err);
  }
}

function detectAscendingTriangle(data) {
  if (data.length < 20) return { found: false };
  const recentData = data.slice(-20);
  const highs = recentData.map((candle) => candle.high);
  const lows = recentData.map((candle) => candle.low);
  const potentialResistanceLevels = [];

  for (let i = 0; i < highs.length; i++) {
    let touchCount = 0;
    for (let j = 0; j < highs.length; j++) {
      if (Math.abs(highs[i] - highs[j]) / highs[i] < 0.005) {
        touchCount++;
      }
    }

    if (touchCount >= 3) {
      potentialResistanceLevels.push(highs[i]);
    }
  }

  if (potentialResistanceLevels.length === 0) return { found: false };
  const resistanceLevel = mostCommonValue(potentialResistanceLevels);
  let risingSupport = true;
  for (let i = 5; i < lows.length; i += 5) {
    if (lows[i] <= lows[i - 5]) {
      risingSupport = false;
      break;
    }
  }

  if (risingSupport) {
    return {
      found: true,
      pattern: "ascending triangle",
      resistanceLevel,
      targetPrice: resistanceLevel * 1.03,
    };
  }

  return { found: false };
}

function detectDescendingTriangle(data) {
  if (data.length < 20) return { found: false };
  const recentData = data.slice(-20);
  const highs = recentData.map((candle) => candle.high);
  const lows = recentData.map((candle) => candle.low);
  const potentialSupportLevels = [];
  for (let i = 0; i < lows.length; i++) {
    let touchCount = 0;

    for (let j = 0; j < lows.length; j++) {
      if (Math.abs(lows[i] - lows[j]) / lows[i] < 0.005) {
        touchCount++;
      }
    }

    if (touchCount >= 3) {
      potentialSupportLevels.push(lows[i]);
    }
  }

  if (potentialSupportLevels.length === 0) return { found: false };
  const supportLevel = mostCommonValue(potentialSupportLevels);
  let fallingResistance = true;
  for (let i = 5; i < highs.length; i += 5) {
    if (highs[i] >= highs[i - 5]) {
      fallingResistance = false;
      break;
    }
  }

  if (fallingResistance) {
    return {
      found: true,
      pattern: "descending triangle",
      supportLevel,
      targetPrice: supportLevel * 0.97,
    };
  }
  return { found: false };
}

function detectSymmetricalTriangle(data) {
  try {
    if (data.length < 20) return { found: false };

    const recentData = data.slice(-20);
    const highs = recentData.map((candle) => candle.high);
    const lows = recentData.map((candle) => candle.low);
    let higherLows = true;
    for (let i = 5; i < lows.length; i += 5) {
      if (lows[i] <= lows[i - 5]) {
        higherLows = false;
        break;
      }
    }

    let lowerHighs = true;
    for (let i = 5; i < highs.length; i += 5) {
      if (highs[i] >= highs[i - 5]) {
        lowerHighs = false;
        break;
      }
    }

    if (higherLows && lowerHighs) {
      const lastClose = recentData[recentData.length - 1].close;

      return {
        found: true,
        pattern: "symmetrical triangle",
        currentPrice: lastClose,
        potentialBreakout: determineTrend(data),
      };
    }

    return { found: false };
  } catch (err) {
    console.log(err);
  }
}

function detectCupAndHandle(data) {
  try {
    if (data.length < 60) return { found: false };
    const cupData = data.slice(-60, -20);
    const cupLows = cupData.map((c) => c.low);
    const cupDepth = Math.max(...cupLows) - Math.min(...cupLows);
    const handleData = data.slice(-20);
    const handleHighs = handleData.map((c) => c.high);
    const handleLows = handleData.map((c) => c.low);
    const cupIsValid = technicalIndicators.ROC.calculate({
      values: cupLows,
      period: 10,
    }).every((r) => Math.abs(r) < 0.5);
    const handleRange = Math.max(...handleHighs) - Math.min(...handleLows);
    const handleVolatility = handleRange / data[data.length - 20].close;

    return {
      found: cupIsValid && handleVolatility < 0.15,
      pattern: "cup and handle",
      target: data[data.length - 1].close + cupDepth * 0.8,
      confirmationLevel: Math.max(...handleHighs),
    };
  } catch (err) {
    console.log(err);
  }
}

function calculateSlope(values) {
  const x = values.map((_, i) => i);
  const y = values;
  const n = x.length;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.map((xi, i) => xi * y[i]).reduce((a, b) => a + b, 0);
  const sumXX = x.map(xi => xi * xi).reduce((a, b) => a + b, 0);

  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
}

function standardDeviation(values) {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b, 0) / values.length);
}

function findSignificantPeaks(data, lookbackPeriod) {
  const peaks = [];
  for (let i = lookbackPeriod; i < data.length - lookbackPeriod; i++) {
    let isPeak = true;
    for (let j = 1; j <= lookbackPeriod; j++) {
      if (data[i].high <= data[i - j].high || data[i].high <= data[i + j].high) {
        isPeak = false;
        break;
      }
    }

    if (isPeak) {
      peaks.push({
        index: i,
        value: data[i].high,
      });
    }
  }

  return peaks;
}

function detectWedges(data) {
  const recent = data.slice(-30);
  const highs = recent.map((c) => c.high);
  const lows = recent.map((c) => c.low);
  const risingSlopeHigh = calculateSlope(highs);
  const risingSlopeLow = calculateSlope(lows);
  const risingWedge =
    risingSlopeHigh > 0 &&
    risingSlopeLow > 0 &&
    Math.abs(risingSlopeHigh - risingSlopeLow) < 0.15;
  const fallingSlopeHigh = calculateSlope(highs);
  const fallingSlopeLow = calculateSlope(lows);
  const fallingWedge =
    fallingSlopeHigh < 0 &&
    fallingSlopeLow < 0 &&
    Math.abs(fallingSlopeHigh - fallingSlopeLow) < 0.15;

  return {
    risingWedge: risingWedge,
    fallingWedge: fallingWedge,
    breakoutLevel: risingWedge ? Math.min(...lows) : Math.max(...highs),
  };
}

function detectRectangleFormations(data) {
  try {
    const recent = data.slice(-30);
    const highs = recent.map((c) => c.high);
    const lows = recent.map((c) => c.low);

    const avgRange = technicalIndicators.ATR.calculate({
      high: highs,
      low: lows,
      close: recent.map((c) => c.close),
      period: 14,
    }).pop();

    const highDeviation = standardDeviation(highs) / recent[0].close;
    const lowDeviation = standardDeviation(lows) / recent[0].close;

    return {
      rectangle: highDeviation < 0.02 && lowDeviation < 0.02,
      rangeHigh: Math.max(...highs),
      rangeLow: Math.min(...lows),
      // Murphy's 1-3-5 breakout rule
      minBreakoutBars: Math.floor(recent.length * 0.33),
    };
  } catch (err) {
    console.log(err);
  }
}

function identifyExistingPatterns(data) {
  const patterns = {};
  patterns.headAndShoulders = detectHeadAndShoulders(data);
  patterns.bullishFlag = detectBullishFlag(data);
  patterns.bearishFlag = detectBearishFlag(data);
  patterns.ascendingTriangle = detectAscendingTriangle(data);
  patterns.descendingTriangle = detectDescendingTriangle(data);
  patterns.symmetricalTriangle = detectSymmetricalTriangle(data);
  return patterns;
}

function findSignificantTroughs(data, lookbackPeriod) {
  const troughs = [];
  for (let i = lookbackPeriod; i < data.length - lookbackPeriod; i++) {
    let isTrough = true;
    for (let j = 1; j <= lookbackPeriod; j++) {
      if (data[i].low >= data[i - j].low || data[i].low >= data[i + j].low) {
        isTrough = false;
        break;
      }
    }

    if (isTrough) {
      troughs.push({
        index: i,
        value: data[i].low,
      });
    }
  }

  return troughs;
}

function detectDoubleTopBottom(data) {
  try {
    const peaks = findSignificantPeaks(data, 5);
    const troughs = findSignificantTroughs(data, 5);
    const doubleTop =
      peaks.length >= 2 &&
      Math.abs(peaks[peaks.length - 1].value - peaks[peaks.length - 2].value) <
      0.005 &&
      data
        .slice(peaks[peaks.length - 2].index)
        .some((c) => c.close < troughs[troughs.length - 1].value);
    const doubleBottom =
      troughs.length >= 2 &&
      Math.abs(
        troughs[troughs.length - 1].value - troughs[troughs.length - 2].value
      ) < 0.005 &&
      data
        .slice(troughs[troughs.length - 2].index)
        .some((c) => c.close > peaks[peaks.length - 1].value);

    return { doubleTop, doubleBottom };
  } catch (err) {
    console.log(err);
  }
}

function detectTripleTopBottom(data) {
  try {
    const peaks = findSignificantPeaks(data, 5);
    const troughs = findSignificantTroughs(data, 5);
    const tripleTop =
      peaks.length >= 3 &&
      Math.abs(peaks[peaks.length - 1].value - peaks[peaks.length - 3].value) <
      0.0075 &&
      peaks[peaks.length - 2].value < peaks[peaks.length - 1].value;

    const tripleBottom =
      troughs.length >= 3 &&
      Math.abs(
        troughs[troughs.length - 1].value - troughs[troughs.length - 3].value
      ) < 0.0075 &&
      troughs[troughs.length - 2].value > troughs[troughs.length - 1].value;

    return { tripleTop, tripleBottom };
  } catch (err) {
    console.log(err);
  }
}

function identifyIslandReversals(data) {
  try {
    if (data.length < 10) return false;

    const current = data[data.length - 1];
    const prev = data[data.length - 2];
    const gapUp =
      current.low > prev.high &&
      current.close > prev.high &&
      data.slice(-5, -2).some((c) => c.close < prev.low);
    const gapDown =
      current.high < prev.low &&
      current.close < prev.low &&
      data.slice(-5, -2).some((c) => c.close > prev.high);

    return {
      islandReversal: gapUp || gapDown,
      direction: gapUp ? "bullish" : "bearish",
    };
  } catch (err) {
    console.log(err);
  }
}

function identifyAdvancedPatterns(data) {
  const patterns = {
    ...identifyExistingPatterns(data),
    cupHandle: detectCupAndHandle(data),
    wedges: detectWedges(data),
    rectangle: detectRectangleFormations(data),
    doubleTops: detectDoubleTopBottom(data),
    tripleTops: detectTripleTopBottom(data),
    islandReversals: identifyIslandReversals(data)
  };

  return patterns;
}

function detectHeadAndShoulders(data) {
  try {
    if (data.length < 30) return { found: false };
    const closes = data.map((candle) => candle.close);
    const significantPeaks = findSignificantPeaks(data, 5);

    if (significantPeaks.length < 3) return { found: false };

    for (let i = 0; i < significantPeaks.length - 2; i++) {
      const leftShoulder = significantPeaks[i];
      const head = significantPeaks[i + 1];
      const rightShoulder = significantPeaks[i + 2];
      if (head.value > leftShoulder.value && head.value > rightShoulder.value) {
        const shouldersDiff =
          Math.abs(leftShoulder.value - rightShoulder.value) / leftShoulder.value;
        if (shouldersDiff < 0.02) {
          return {
            found: true,
            pattern: "head and shoulders",
            neckline: Math.min(
              data[leftShoulder.index + 1].low,
              data[head.index + 1].low
            ),
          };
        }
      }
    }

    return { found: false };
  } catch (err) {
    console.log(err);
  }
}

function getCurrentSession() {
  const hour = moment().utc().hour();

  if (hour >= 22 || hour < 7) {
    return "asian";
  } else if (hour >= 7 && hour < 12) {
    return "european";
  } else if (hour >= 16 && hour < 21) {
    return "us";
  } else if (hour >= 12 && hour < 16) {
    return "overlap"; // London-NY overlap
  } else {
    return "transition"; // Session transition period
  }
}

// Enhanced route handler with detailed response
app.get('/analyze/xauusd', async (req, res) => {
  try {
    const analysis = await performFullAnalysis();
    
    // Add summary for quick reference
    const summary = {
      price: analysis.price,
      direction: analysis.overallAssessment.direction,
      confidence: analysis.overallAssessment.confidence,
      recommendation: generateTradeRecommendation(analysis),
      signals: {
        buy: analysis.signals.buy,
        sell: analysis.signals.sell,
        buyConfidence: analysis.signals.buyConfidence,
        sellConfidence: analysis.signals.sellConfidence
      }
    };
    
    res.json({
      status: 'success',
      timestamp: analysis.timestamp,
      summary: summary,
      analysis: analysis
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Function to generate a clear trade recommendation
function generateTradeRecommendation(analysis) {
  // Extract key metrics
  const { direction, confidence } = analysis.overallAssessment;
  const { buy, sell, buyConfidence, sellConfidence } = analysis.signals;

  console.log("direction, confidence",direction, confidence);
  
  
  // Determine if we should recommend a trade
  if (direction === 'bullish' && buy && confidence > 60 && buyConfidence > 60) {
    return {
      action: 'BUY',
      strength: confidence > 80 ? 'Strong' : 'Moderate',
      stopLoss: calculateStopLoss('buy', analysis),
      takeProfit: calculateTakeProfit('buy', analysis),
      rationale: 'Bullish trend with strong buy signals across multiple timeframes'
    };
  } 
  else if (direction === 'bearish' && sell && confidence > 60 && sellConfidence > 60) {
    return {
      action: 'SELL',
      strength: confidence > 80 ? 'Strong' : 'Moderate',
      stopLoss: calculateStopLoss('sell', analysis),
      takeProfit: calculateTakeProfit('sell', analysis),
      rationale: 'Bearish trend with strong sell signals across multiple timeframes'
    };
  }
  else if (confidence > 70 && !buy && !sell) {
    return {
      action: 'HOLD',
      rationale: `Strong ${direction} trend detected but no immediate entry signals`
    };
  }
  else if (buyConfidence > 80 && direction === 'bearish') {
    return {
      action: 'CAUTION - CONFLICTING SIGNALS',
      rationale: 'Buy signal detected against overall bearish trend'
    };
  }
  else if (sellConfidence > 80 && direction === 'bullish') {
    return {
      action: 'CAUTION - CONFLICTING SIGNALS',
      rationale: 'Sell signal detected against overall bullish trend'
    };
  }
  else {
    return {
      action: 'NO CLEAR SIGNAL',
      rationale: 'Insufficient conviction in current market conditions'
    };
  }
}

// Helper functions for risk management
function calculateStopLoss(direction, analysis) {
  const price = analysis.price;
  const atr = analysis.trend.indicators?.atr || 
              analysis.primary?.atr?.[analysis.primary.atr.length - 1] || 
              (price * 0.005); // Default to 0.5% if ATR not available
  
  if (direction === 'buy') {
    return parseFloat((price - (atr * 1.5)).toFixed(2));
  } else {
    return parseFloat((price + (atr * 1.5)).toFixed(2));
  }
}

function calculateTakeProfit(direction, analysis) {
  const price = analysis.price;
  const atr = analysis.trend.indicators?.atr || 
              analysis.primary?.atr?.[analysis.primary.atr.length - 1] || 
              (price * 0.005); // Default to 0.5% if ATR not available
  
  const riskRewardRatio = 2.0; // 1:2 risk-reward
  
  if (direction === 'buy') {
    return parseFloat((price + (atr * 1.5 * riskRewardRatio)).toFixed(2));
  } else {
    return parseFloat((price - (atr * 1.5 * riskRewardRatio)).toFixed(2));
  }
}

async function performFullAnalysis() {
  // 1. Multi-Timeframe Data Collection
  const timeframes = ['2m','3m','5m', '15m',"30m",'1h'];
  const data = {};
  for (const tf of timeframes) {
    data[tf] = await fetchHistoricalData('XAUUSD', tf, 7000);
  }

  // 2. Unified Indicator Calculation
  const indicators = {
    primary: calculateIndicators(data['5m']),
    secondary: {
      '2m': calculateIndicators(data['2m']),
      '3m': calculateIndicators(data['3m']),
      '5m': calculateIndicators(data['5m']),
      '15m': calculateIndicators(data['15m']),
      '30m': calculateIndicators(data['30m']),
      '1h': calculateIndicators(data['1h'])
    }
  };

  // 3. Enhanced Pattern Detection (Your Existing Code)
  const patterns = identifyAdvancedPatterns(data['1h']);
  // 5. Session-Based Adjustments
  const session = getCurrentSession();

  return {
    timestamp: Date.now(),
    price: indicators.primary.lastClose,
    trend: checkTrend(indicators.primary),
    signals: checkEntrySignal(indicators.primary, session),
    patterns: patterns,
    multiTimeframeConfirmation: checkMultiTFAlignment(indicators.secondary),
    session: session
  };
}

// New Critical Integration Points
function checkMultiTFAlignment(timeframeIndicators) {
  const alignmentScore = {
    '2m': timeframeIndicators['2m'].ema.ema21 > timeframeIndicators['2m'].sma.sma50 ? 1 : -1,
    '3m': timeframeIndicators['3m'].ema.ema21 > timeframeIndicators['3m'].sma.sma50 ? 1 : -1,
    '5m': timeframeIndicators['5m'].ema.ema21 > timeframeIndicators['5m'].sma.sma50 ? 1 : -1,
    '15m': timeframeIndicators['15m'].macd.slice(-1)[0].histogram > 0 ? 1 : -1
  };
  return alignmentScore['3m'] + alignmentScore['5m'] + alignmentScore['15m']  + alignmentScore['2m'];
}

// Preserved Pattern Detection (From Your Code)
function identifyAdvancedPatterns(data) {
  return {
    cupHandle: detectCupAndHandle(data),
    wedges: detectWedges(data),
    rectangle: detectRectangleFormations(data),
    doubleTops: detectDoubleTopBottom(data),
    tripleTops: detectTripleTopBottom(data),
    islandReversals: identifyIslandReversals(data)
  };
}

// Missing Functions
function checkTrend(indicators) {
  try {
    // Extract relevant indicators
    const { sma20, sma50, sma200 } = indicators.sma;
    const { ema10, ema21 } = indicators.ema;
    const { adx } = indicators;
    const { rsi14 } = indicators.rsi;
    const { bb } = indicators;
    const lastClose = indicators.lastClose;
    const lastMacd = indicators.macd[indicators.macd.length - 1];
    
    // Direction signals (traditional method)
    const smaDirection = sma50[sma50.length - 1] > sma200[sma200.length - 1] ? 1 : -1;
    const emaDirection = ema10[ema10.length - 1] > ema21[ema21.length - 1] ? 1 : -1;
    const macdDirection = lastMacd.histogram > 0 ? 1 : -1;
    const rsiDirection = rsi14[rsi14.length - 1] > 50 ? 1 : -1;
    const bbPosition = lastClose > bb[bb.length - 1].middle ? 1 : -1;
    
    // Calculate weighted direction score
    const directionWeights = {
      sma: 0.25,
      ema: 0.20,
      macd: 0.25,
      rsi: 0.15,
      bb: 0.15
    };
    
    const directionScore = (
      smaDirection * directionWeights.sma +
      emaDirection * directionWeights.ema +
      macdDirection * directionWeights.macd +
      rsiDirection * directionWeights.rsi +
      bbPosition * directionWeights.bb
    );
    
    // Determine overall direction
    const direction = directionScore > 0 ? 'bullish' : 'bearish';
    
    // Calculate confidence percentage (0 to 100%)
    const confidencePercentage = Math.abs(directionScore) * 100;
    
    // Trend strength calculation based on ADX
    const adxValue = adx[adx.length - 1];
    const trendStrength = adxValue > 25 ? 'strong' : 'weak';
    const strengthIntensity = adxValue > 40 ? 'very strong' : 
                             adxValue > 25 ? 'strong' : 
                             adxValue > 15 ? 'moderate' : 'weak';
    
    // Detailed indicator alignment
    const indicatorAlignment = {
      movingAverages: {
        sma: smaDirection > 0 ? 'bullish' : 'bearish',
        ema: emaDirection > 0 ? 'bullish' : 'bearish',
        aligned: smaDirection === emaDirection
      },
      momentum: {
        macd: macdDirection > 0 ? 'bullish' : 'bearish',
        rsi: rsiDirection > 0 ? 'bullish' : 'bearish',
        aligned: macdDirection === rsiDirection
      }
    };
    
    return {
      direction,
      confidence: parseFloat(confidencePercentage.toFixed(2)),
      strength: trendStrength,
      strengthValue: adxValue,
      strengthIntensity,
      indicators: {
        sma: smaDirection > 0 ? 'bullish' : 'bearish',
        ema: emaDirection > 0 ? 'bullish' : 'bearish',
        macd: macdDirection > 0 ? 'bullish' : 'bearish',
        rsi: rsiDirection > 0 ? 'bullish' : 'bearish',
        bb: bbPosition > 0 ? 'bullish' : 'bearish'
      },
      alignment: indicatorAlignment
    };
  } catch (err) {
    console.log("Error in checkTrend:", err);
    return {
      direction: 'unknown',
      confidence: 0,
      strength: 'unknown',
      error: err.message
    };
  }
}

function checkEntrySignal(indicators, session) {
  try {
    // Extract indicators
    const { macd } = indicators;
    const { rsi14, rsi5 } = indicators.rsi;
    const { sma20, sma50 } = indicators.sma;
    const { bb } = indicators;
    const { atr } = indicators;
    const lastCandle = indicators.lastCandle;
    
    // Extract last values
    const lastMacd = macd[macd.length - 1];
    const prevMacd = macd[macd.length - 2];
    const currentRsi = rsi14[rsi14.length - 1];
    const fastRsi = rsi5[rsi5.length - 1];
    const lastBB = bb[bb.length - 1];
    const lastAtr = atr[atr.length - 1];
    
    // Buy signal criteria
    const macdCrossingUp = lastMacd.MACD > lastMacd.signal && prevMacd.MACD <= prevMacd.signal;
    const macdPositive = lastMacd.histogram > 0;
    const rsiOversold = currentRsi < 40;
    const rsiRecovering = rsi14[rsi14.length - 1] > rsi14[rsi14.length - 2];
    const priceAboveSma = lastCandle.close > sma20[sma20.length - 1];
    const bbSqueezing = (lastBB.upper - lastBB.lower) < (lastBB.upper * 0.02); // 2% range
    
    // Sell signal criteria
    const macdCrossingDown = lastMacd.MACD < lastMacd.signal && prevMacd.MACD >= prevMacd.signal;
    const macdNegative = lastMacd.histogram < 0;
    const rsiOverbought = currentRsi > 60;
    const rsiFalling = rsi14[rsi14.length - 1] < rsi14[rsi14.length - 2];
    const priceBelowSma = lastCandle.close < sma20[sma20.length - 1];
    
    // Session-specific adjustments
    let sessionMultiplier = 1.0;
    switch(session) {
      case 'asian':
        sessionMultiplier = 0.8; // Generally less volatile
        break;
      case 'european':
        sessionMultiplier = 1.1; // More active
        break;
      case 'us':
        sessionMultiplier = 1.2; // Most volatile typically
        break;
      case 'overlap':
        sessionMultiplier = 1.3; // Highest liquidity and volatility
        break;
      default:
        sessionMultiplier = 1.0;
    }
    
    // Calculate buy signal confidence
    const buyFactors = [
      macdCrossingUp ? 30 : (macdPositive ? 15 : 0),
      rsiOversold ? 20 : 0,
      rsiRecovering ? 15 : 0,
      priceAboveSma ? 20 : 0,
      bbSqueezing ? 15 : 0
    ];
    
    const buyConfidence = buyFactors.reduce((sum, factor) => sum + factor, 0) * sessionMultiplier;
    
    // Calculate sell signal confidence
    const sellFactors = [
      macdCrossingDown ? 30 : (macdNegative ? 15 : 0),
      rsiOverbought ? 20 : 0,
      rsiFalling ? 15 : 0,
      priceBelowSma ? 20 : 0,
      bbSqueezing ? 15 : 0
    ];
    
    const sellConfidence = sellFactors.reduce((sum, factor) => sum + factor, 0) * sessionMultiplier;
    
    // Adjust based on volatility
    const volatilityFactor = lastAtr / lastCandle.close;
    const volatilityMultiplier = volatilityFactor > 0.005 ? 1.1 : 0.9; // Adjust based on ATR%
    
    // Final signals
    const buySignal = buyConfidence * volatilityMultiplier >= 50;
    const sellSignal = sellConfidence * volatilityMultiplier >= 50;
    
    return {
      buy: buySignal,
      sell: sellSignal,
      buyConfidence: parseFloat((buyConfidence * volatilityMultiplier).toFixed(2)),
      sellConfidence: parseFloat((sellConfidence * volatilityMultiplier).toFixed(2)),
      signals: {
        macd: {
          crossingUp: macdCrossingUp,
          crossingDown: macdCrossingDown,
          positive: macdPositive,
          negative: macdNegative
        },
        rsi: {
          oversold: rsiOversold,
          overbought: rsiOverbought,
          recovering: rsiRecovering,
          falling: rsiFalling,
          current: currentRsi,
          fast: fastRsi
        },
        price: {
          aboveSma20: priceAboveSma,
          belowSma20: priceBelowSma
        },
        volatility: {
          bbSqueezing,
          atrPercent: parseFloat((volatilityFactor * 100).toFixed(3))
        }
      },
      session: {
        current: session,
        multiplier: sessionMultiplier
      }
    };
  } catch (err) {
    console.log("Error in checkEntrySignal:", err);
    return {
      buy: false,
      sell: false,
      buyConfidence: 0,
      sellConfidence: 0,
      error: err.message
    };
  }
}

function checkMultiTFAlignment(timeframeIndicators) {
  // Calculate alignment scores across timeframes
  const alignmentScores = {
    '2m': {
      direction: timeframeIndicators['2m'].ema.ema21[timeframeIndicators['2m'].ema.ema21.length - 1] > 
                timeframeIndicators['2m'].sma.sma50[timeframeIndicators['2m'].sma.sma50.length - 1] ? 1 : -1,
      macd: timeframeIndicators['2m'].macd[timeframeIndicators['2m'].macd.length - 1].histogram > 0 ? 1 : -1,
      rsi: timeframeIndicators['2m'].rsi.rsi14[timeframeIndicators['2m'].rsi.rsi14.length - 1] > 50 ? 1 : -1
    },
    '3m': {
      direction: timeframeIndicators['3m'].ema.ema21[timeframeIndicators['3m'].ema.ema21.length - 1] > 
                timeframeIndicators['3m'].sma.sma50[timeframeIndicators['3m'].sma.sma50.length - 1] ? 1 : -1,
      macd: timeframeIndicators['3m'].macd[timeframeIndicators['3m'].macd.length - 1].histogram > 0 ? 1 : -1,
      rsi: timeframeIndicators['3m'].rsi.rsi14[timeframeIndicators['3m'].rsi.rsi14.length - 1] > 50 ? 1 : -1
    },
    '5m': {
      direction: timeframeIndicators['5m'].ema.ema21[timeframeIndicators['5m'].ema.ema21.length - 1] > 
                timeframeIndicators['5m'].sma.sma50[timeframeIndicators['5m'].sma.sma50.length - 1] ? 1 : -1,
      macd: timeframeIndicators['5m'].macd[timeframeIndicators['5m'].macd.length - 1].histogram > 0 ? 1 : -1,
      rsi: timeframeIndicators['5m'].rsi.rsi14[timeframeIndicators['5m'].rsi.rsi14.length - 1] > 50 ? 1 : -1
    },
    '15m': {
      direction: timeframeIndicators['15m'].ema.ema21[timeframeIndicators['15m'].ema.ema21.length - 1] > 
                 timeframeIndicators['15m'].sma.sma50[timeframeIndicators['15m'].sma.sma50.length - 1] ? 1 : -1,
      macd: timeframeIndicators['15m'].macd[timeframeIndicators['15m'].macd.length - 1].histogram > 0 ? 1 : -1,
      rsi: timeframeIndicators['15m'].rsi.rsi14[timeframeIndicators['15m'].rsi.rsi14.length - 1] > 50 ? 1 : -1
    },
    '30m': {
      direction: timeframeIndicators['30m'].ema.ema21[timeframeIndicators['30m'].ema.ema21.length - 1] > 
                 timeframeIndicators['30m'].sma.sma50[timeframeIndicators['30m'].sma.sma50.length - 1] ? 1 : -1,
      macd: timeframeIndicators['30m'].macd[timeframeIndicators['30m'].macd.length - 1].histogram > 0 ? 1 : -1,
      rsi: timeframeIndicators['30m'].rsi.rsi14[timeframeIndicators['30m'].rsi.rsi14.length - 1] > 50 ? 1 : -1
    },
    '1h': {
      direction: timeframeIndicators['1h'].ema.ema21[timeframeIndicators['1h'].ema.ema21.length - 1] > 
                 timeframeIndicators['1h'].sma.sma50[timeframeIndicators['1h'].sma.sma50.length - 1] ? 1 : -1,
      macd: timeframeIndicators['1h'].macd[timeframeIndicators['1h'].macd.length - 1].histogram > 0 ? 1 : -1,
      rsi: timeframeIndicators['1h'].rsi.rsi14[timeframeIndicators['1h'].rsi.rsi14.length - 1] > 50 ? 1 : -1
    }
  };
  
  // Calculate bullish score (range -9 to +9 across 3 timeframes and 3 indicators each)
  const bullishScore = Object.values(alignmentScores).reduce((sum, tf) => {
    return sum + tf.direction + tf.macd + tf.rsi;
  }, 0);
  
  // Calculate confidence based on alignment
  const maxPossibleScore = 9; // 3 timeframes * 3 indicators
  const alignmentConfidence = ((bullishScore + maxPossibleScore) / (2 * maxPossibleScore)) * 100;
  
  // Categorize trend agreement
  const trendAgreement = 
    bullishScore >= 7 ? "strongly bullish" :
    bullishScore >= 4 ? "moderately bullish" :
    bullishScore >= 1 ? "weakly bullish" :
    bullishScore <= -7 ? "strongly bearish" :
    bullishScore <= -4 ? "moderately bearish" :
    bullishScore <= -1 ? "weakly bearish" : "neutral";
  
  // Detailed breakdown of timeframe alignments
  const timeframeDetails = {};
  for (const [tf, scores] of Object.entries(alignmentScores)) {
    const tfBullishness = scores.direction + scores.macd + scores.rsi;
    timeframeDetails[tf] = {
      overall: tfBullishness > 0 ? "bullish" : tfBullishness < 0 ? "bearish" : "neutral",
      score: tfBullishness,
      indicators: {
        ma: scores.direction > 0 ? "bullish" : "bearish",
        macd: scores.macd > 0 ? "bullish" : "bearish",
        rsi: scores.rsi > 0 ? "bullish" : "bearish"
      }
    };
  }

  return {
    score: bullishScore,
    confidence: parseFloat(alignmentConfidence.toFixed(2)),
    agreement: trendAgreement,
    direction: bullishScore > 0 ? "bullish" : bullishScore < 0 ? "bearish" : "neutral",
    timeframes: timeframeDetails
  };
}

async function performFullAnalysis() {
  try {
    // 1. Multi-Timeframe Data Collection
    const timeframes = ['2m','3m', '5m', '15m','30m','1h'];
    const data = {};
    for (const tf of timeframes) {
      data[tf] = await fetchHistoricalData('XAUUSD', tf, { limit: 7000 });
    }

    // 2. Unified Indicator Calculation
    const indicators = {
      primary: calculateIndicators(data['5m']),
      secondary: {
        '2m':calculateIndicators(data['2m']),
        '3m':calculateIndicators(data['3m']),
        '5m': calculateIndicators(data['5m']),
        '15m': calculateIndicators(data['15m']),
        '30m': calculateIndicators(data['30m']),
        '1h': calculateIndicators(data['1h'])
      }
    };

    // 3. Enhanced Pattern Detection
    const patterns = identifyAdvancedPatterns(data['1h']);

    const patternDirection = determinePatternDirection(patterns)
    
    console.log("patternDirection",patternDirection);
    
    // 4. Session-Based Context
    const session = getCurrentSession();
    
    // 5. Calculate Trend with Confidence
    const trend = checkTrend(indicators.primary);
    
    // 6. Calculate Entry Signals with Confidence
    const signals = checkEntrySignal(indicators.primary, session);
    
    // 7. Multi-Timeframe Confirmation with Confidence
    const mtfAlignment = checkMultiTFAlignment(indicators.secondary);
    
     // 8. Calculate Overall Direction Confidence with Breakdown
     const weights = {
      primaryTrend: 0.4,
      mtfAlignment: 0.4,
      patternConfirmation: 0.2
    };

    // Calculate individual contributions
    let bullishContrib = 0;
    let bearishContrib = 0;

    // Trend Contribution
    if (trend.direction === 'bullish') {
      bullishContrib += weights.primaryTrend;
    } else {
      bearishContrib += weights.primaryTrend;
    }

    // MTF Alignment Contribution
    if (mtfAlignment.direction === 'bullish') {
      bullishContrib += weights.mtfAlignment;
    } else {
      bearishContrib += weights.mtfAlignment;
    }

    // Pattern Contribution (patternDirection ranges from -1 to 1)
    if (patternDirection > 0) {
      bullishContrib += patternDirection * weights.patternConfirmation;
    } else {
      bearishContrib += Math.abs(patternDirection) * weights.patternConfirmation;
    }

    // Calculate confidence percentages
    const bullishConfidence = bullishContrib * 100;
    const bearishConfidence = bearishContrib * 100;
    const netDirection = bullishContrib - bearishContrib;

    const overallConfidence = {
      direction: netDirection > 0 ? 'bullish' : 'bearish',
      confidence: parseFloat((Math.abs(netDirection) * 100).toFixed(2)),
      bullishConfidence: parseFloat(bullishConfidence.toFixed(2)),
      bearishConfidence: parseFloat(bearishConfidence.toFixed(2)),
      assessment: 
        Math.abs(netDirection) > 0.8 ? 'very high confidence' :
        Math.abs(netDirection) > 0.6 ? 'high confidence' :
        Math.abs(netDirection) > 0.4 ? 'moderate confidence' :
        'low confidence'
    };

    // 9. Compile final analysis
    return {
      timestamp: Date.now(),
      price: indicators.primary.lastClose,
      session: session,
      trend: trend,
      signals: signals,
      patterns: patterns,
      multiTimeframeConfirmation: mtfAlignment,
      overallAssessment: overallConfidence
    };
  } catch (error) {
    console.error("Error in performFullAnalysis:", error);
    return {
      timestamp: Date.now(),
      status: 'error',
      message: error.message
    };
  }
}

// Helper function to determine direction from patterns
function determinePatternDirection(patterns) {
  let patternScore = 0;

  // Check for specific bullish patterns
  if (patterns.bullishFlag?.found) patternScore += 1;
  if (patterns.ascendingTriangle?.found) patternScore += 1;
  if (patterns.cupHandle?.found) patternScore += 1;
  if (patterns.wedges?.fallingWedge) patternScore += 0.5;
  if (patterns.doubleTops?.doubleBottom) patternScore += 0.5;
  if (patterns.tripleTops?.tripleBottom) patternScore += 0.5;
  if (patterns.islandReversals?.islandReversal && patterns.islandReversals?.direction === 'bullish') patternScore += 0.5;
  
  // Check for specific bearish patterns
  if (patterns.headAndShoulders?.found) patternScore -= 1;
  if (patterns.bearishFlag?.found) patternScore -= 1;
  if (patterns.descendingTriangle?.found) patternScore -= 1;
  if (patterns.wedges?.risingWedge) patternScore -= 0.5;
  if (patterns.doubleTops?.doubleTop) patternScore -= 0.5;
  if (patterns.tripleTops?.tripleTop) patternScore -= 0.5;
  if (patterns.islandReversals?.islandReversal && patterns.islandReversals?.direction === 'bearish') patternScore -= 0.5;
  
  // Normalize the score to be between -1 and 1
  const maxPossibleScore = 4; // Reasonable maximum based on the checks above
  return patternScore / maxPossibleScore;
}

app.listen(port, () => {
  console.log(`Analysis API running at http://localhost:${port}`);
});
