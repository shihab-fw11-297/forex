const axios = require("axios");
const technicalIndicators = require("technicalindicators");
const fs = require("fs/promises");
const moment = require("moment");

// Constants
const FINAGE_API_KEY = "API_KEYf7BXPN4LJOH0A56FSU4BWLI2DZDC5CGD";
const BASE_URL = "https://api.finage.co.uk";
const TIMEFRAMES = ["1m", "2m","5m", '1h','2h','4h','1D'];
const api = ["API_KEY20P3QCQOJ6CE8M5BS04LLHOF6SGMTKBR","API_KEYf7BXPN4LJOH0A56FSU4BWLI2DZDC5CGD","API_KEY22YYXQN80WL5H4K3IIF82W5WVAKFR746"]

// Cache for storing fetched data
const cache = {};

// Random API Key Selector
function getRandomApiKey() {
  const index = Math.floor(Math.random() * api.length);
  return api[index];
}

async function fetchHistoricalData(symbol, timeframe, limit = 100) {
  const timeframesMap = {
    "1m": { unit: "minute", daysBack: 5, limits: 20000, time: 1 },
    "2m": { unit: "minute", daysBack: 15, limits: 20000, time: 2 },
    "4m": { unit: "minute", daysBack: 25, limits: 20000, time: 4 },
    "5m": { unit: "minute", daysBack: 25, limits: 20000, time: 5 },
    "15m": { unit: "minute", daysBack: 25, limits: 20000, time: 15 },
    "30m": { unit: "minute", daysBack: 25, limits: 5000, time: 30 },
    "1h": { unit: "hour", daysBack: 30, limits: 10000, time: 1 },
    "2h": { unit: "hour", daysBack: 80, limits: 10000, time: 2 },
    "4h": { unit: "hour", daysBack: 80, limits: 5000, time: 4 },
    "1D": { unit: "day", daysBack: 90, limits: 5000, time: 1 },
  };

  const config = timeframesMap[timeframe];
  if (!config) throw new Error(`Unsupported timeframe: ${timeframe}`);

  const cacheKey = `${symbol}-${timeframe}`;
  const cacheEntry = cache[cacheKey];

  if (cacheEntry && Date.now() - cacheEntry.timestamp < 60 * 60 * 1000) {
    console.log(`Cache hit for ${symbol} (${timeframe})`);
    return cacheEntry.data;
  }

  console.log(`Cache miss or expired for ${symbol} (${timeframe}). Fetching from API...`);

  const today = new Date();
  const startDateObj = new Date(today);
  startDateObj.setDate(today.getDate() - config.daysBack);
  const endDateObj = new Date(today);
  endDateObj.setDate(today.getDate() + 2);

  const formatDate = (date) => date.toISOString().split("T")[0];
  const startDate = formatDate(startDateObj);
  const endDate = formatDate(endDateObj);

  const selectedApiKey = getRandomApiKey();
  const url = `${BASE_URL}/agg/forex/${symbol.toLowerCase()}/${config.time}/${config.unit}/${startDate}/${endDate}?apikey=${selectedApiKey}&limit=${config.limits}`;

  try {
    console.log("Fetching data from URL:", url);
    const { data } = await axios.get(url);

    const formattedData = data.results.map(({ t, o, h, l, c, v }) => ({
      timestamp: t,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v,
    }));

    cache[cacheKey] = {
      data: formattedData,
      timestamp: Date.now(),
    };

    return formattedData;
  } catch (err) {
    console.error(`Error fetching data for ${symbol} (${timeframe}): ${err.message}`);
    return [];
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

function calculateFibonacciLevels(data) {
  const recentData = data.slice(-20);
  let highestPrice = Math.max(...recentData.map((candle) => candle.high));
  let lowestPrice = Math.min(...recentData.map((candle) => candle.low));

  const midTermData = data.slice(-100);
  let midTermHighestPrice = Math.max(
    ...midTermData.map((candle) => candle.high)
  );
  let midTermLowestPrice = Math.min(...midTermData.map((candle) => candle.low));

  const range = highestPrice - lowestPrice;
  const midTermRange = midTermHighestPrice - midTermLowestPrice;

  const shortTermLevels = {
    level_0: highestPrice,
    level_23_6: highestPrice - range * 0.236,
    level_38_2: highestPrice - range * 0.382,
    level_50_0: highestPrice - range * 0.5,
    level_61_8: highestPrice - range * 0.618,
    level_78_6: highestPrice - range * 0.786,
    level_100: lowestPrice,
  };

  const midTermLevels = {
    level_0: midTermHighestPrice,
    level_23_6: midTermHighestPrice - midTermRange * 0.236,
    level_38_2: midTermHighestPrice - midTermRange * 0.382,
    level_50_0: midTermHighestPrice - midTermRange * 0.5,
    level_61_8: midTermHighestPrice - midTermRange * 0.618,
    level_78_6: midTermHighestPrice - midTermRange * 0.786,
    level_100: midTermLowestPrice,
  };

  return {
    shortTerm: shortTermLevels,
    midTerm: midTermLevels,
  };
}

function calculatePivotPoints(lastDayData) {
  if (!lastDayData) return null;

  const { high, low, close } = lastDayData;
  const pivot = (high + low + close) / 3;
  const r1 = 2 * pivot - low;
  const r2 = pivot + (high - low);
  const r3 = high + 2 * (pivot - low);
  const s1 = 2 * pivot - high;
  const s2 = pivot - (high - low);
  const s3 = low - 2 * (high - pivot);

  return {
    pivot,
    resistance: { r1, r2, r3 },
    support: { s1, s2, s3 },
  };
}

function calculateVolumeIndicators(data) {
  const closes = data.map((candle) => candle.close);
  const volumes = data.map((candle) => candle.volume);
  let obv = [0];
  for (let i = 1; i < data.length; i++) {
    if (closes[i] > closes[i - 1]) {
      obv.push(obv[i - 1] + volumes[i]);
    } else if (closes[i] < closes[i - 1]) {
      obv.push(obv[i - 1] - volumes[i]);
    } else {
      obv.push(obv[i - 1]);
    }
  }

  const volumeSMA = [];
  for (let i = 19; i < volumes.length; i++) {
    let sum = 0;
    for (let j = 0; j < 20; j++) {
      sum += volumes[i - j];
    }
    volumeSMA.push(sum / 20);
  }

  const vroc = [];
  for (let i = 10; i < volumes.length; i++) {
    vroc.push(((volumes[i] - volumes[i - 10]) / volumes[i - 10]) * 100);
  }

  const priceChangeLastN = (n) => {
    const recentCloses = closes.slice(-n);
    return (
      ((recentCloses[recentCloses.length - 1] - recentCloses[0]) /
        recentCloses[0]) *
      100
    );
  };

  const volumeChangeLastN = (n) => {
    const recentVolumes = volumes.slice(-n);
    return (
      ((recentVolumes[recentVolumes.length - 1] - recentVolumes[0]) /
        recentVolumes[0]) *
      100
    );
  };

  const priceChange5 = priceChangeLastN(5);
  const volumeChange5 = volumeChangeLastN(5);
  const shortTermDivergence =
    (priceChange5 > 0 && volumeChange5 < 0) ||
    (priceChange5 < 0 && volumeChange5 > 0);
  const priceChange20 = priceChangeLastN(20);
  const volumeChange20 = volumeChangeLastN(20);
  const midTermDivergence =
    (priceChange20 > 0 && volumeChange20 < 0) ||
    (priceChange20 < 0 && volumeChange20 > 0);

  return {
    obv: obv[obv.length - 1],
    volumeSMA: volumeSMA[volumeSMA.length - 1],
    vroc: vroc[vroc.length - 1],
    divergence: {
      shortTerm: shortTermDivergence,
      midTerm: midTermDivergence,
    },
    volumeTrend:
      volumes[volumes.length - 1] > volumeSMA[volumeSMA.length - 1]
        ? "increasing"
        : "decreasing",
  };
}

function detectCupAndHandle(data) {
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
}

function calculateSlope(values) {
  const x = values.map((_,i) => i);
  const y = values;
  const n = x.length;
  
  const sumX = x.reduce((a,b) => a + b, 0);
  const sumY = y.reduce((a,b) => a + b, 0);
  const sumXY = x.map((xi, i) => xi * y[i]).reduce((a,b) => a + b, 0);
  const sumXX = x.map(xi => xi * xi).reduce((a,b) => a + b, 0);
  
  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
}

function standardDeviation(values) {
  const avg = values.reduce((a,b) => a + b, 0) / values.length;
  return Math.sqrt(values.map(x => Math.pow(x - avg, 2)).reduce((a,b) => a + b, 0) / values.length);
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
}

function detectTripleTopBottom(data) {
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
}

function identifyIslandReversals(data) {
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

function detectBullishFlag(data) {
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
}

function detectBearishFlag(data) {
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
}

function mostCommonValue(arr) {
  const counts = {};
  let maxCount = 0;
  let maxValue = null;

  for (const value of arr) {
    counts[value] = (counts[value] || 0) + 1;
    if (counts[value] > maxCount) {
      maxCount = counts[value];
      maxValue = value;
    }
  }

  return maxValue;
}

function determineTrend(data) {
  const closes = data.map((candle) => candle.close);
  const sma20 = technicalIndicators.SMA.calculate({
    period: 20,
    values: closes,
  });

  if (closes[closes.length - 1] > sma20[sma20.length - 1]) {
    return "bullish";
  } else {
    return "bearish";
  }
}

function identifyPatterns(data) {
  try {
    const patterns = {};
    patterns.doubleBottom = detectDoubleBottom(data);
    patterns.doubleTop = detectDoubleTop(data);
    const insideBars = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i].high <= data[i - 1].high && data[i].low >= data[i - 1].low) {
        insideBars.push(i);
      }
    }
    patterns.insideBars =
      insideBars.length > 0
        ? { found: true, positions: insideBars }
        : { found: false };

    const rsi5 = calculateRSI(
      data.map((c) => c.close),
      5
    );
    patterns.momentumBurst = {
      bullish: rsi5[rsi5.length - 2] < 30 && rsi5[rsi5.length - 1] > 30,
      bearish: rsi5[rsi5.length - 2] > 70 && rsi5[rsi5.length - 1] < 70,
    };

    return patterns;
  } catch (err) {
    console.log(err);
    return { error: err.message };
  }
}

function detectDoubleBottom(data) {
  if (data.length < 30) return false;
  const segment = data.slice(-30);
  const significantLows = [];

  for (let i = 2; i < segment.length - 2; i++) {
    if (
      segment[i].low < segment[i - 1].low &&
      segment[i].low < segment[i - 2].low &&
      segment[i].low < segment[i + 1].low &&
      segment[i].low < segment[i + 2].low
    ) {
      significantLows.push({
        index: i,
        value: segment[i].low,
      });
    }
  }

  if (significantLows.length < 2) return false;
  for (let i = 0; i < significantLows.length - 1; i++) {
    for (let j = i + 1; j < significantLows.length; j++) {
      const low1 = significantLows[i];
      const low2 = significantLows[j];

      const priceDifference = Math.abs(low1.value - low2.value) / low1.value;
      const separation = low2.index - low1.index;
      let hasPeakBetween = false;
      let peakValue = Number.NEGATIVE_INFINITY;

      for (let k = low1.index + 1; k < low2.index; k++) {
        if (segment[k].high > peakValue) {
          peakValue = segment[k].high;
        }
      }

      hasPeakBetween = (peakValue - low1.value) / low1.value > 0.03;
      if (priceDifference < 0.02 && separation >= 5 && hasPeakBetween) {
        return true;
      }
    }
  }

  return false;
}

function detectDoubleTop(data) {
  if (data.length < 30) return false;
  const segment = data.slice(-30);
  const significantHighs = [];

  for (let i = 2; i < segment.length - 2; i++) {
    if (
      segment[i].high > segment[i - 1].high &&
      segment[i].high > segment[i - 2].high &&
      segment[i].high > segment[i + 1].high &&
      segment[i].high > segment[i + 2].high
    ) {
      significantHighs.push({
        index: i,
        value: segment[i].high,
      });
    }
  }

  if (significantHighs.length < 2) return false;
  for (let i = 0; i < significantHighs.length - 1; i++) {
    for (let j = i + 1; j < significantHighs.length; j++) {
      const high1 = significantHighs[i];
      const high2 = significantHighs[j];
      const priceDifference = Math.abs(high1.value - high2.value) / high1.value;
      const separation = high2.index - high1.index;
      let hasTroughBetween = false;
      let troughValue = Number.POSITIVE_INFINITY;

      for (let k = high1.index + 1; k < high2.index; k++) {
        if (segment[k].low < troughValue) {
          troughValue = segment[k].low;
        }
      }

      hasTroughBetween = (high1.value - troughValue) / high1.value > 0.03;
      if (priceDifference < 0.02 && separation >= 5 && hasTroughBetween) {
        return true;
      }
    }
  }

  return false;
}

function calculateRSI(prices, period) {
  if (prices.length <= period) {
    return Array(prices.length).fill(50);
  }

  const rsi = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const difference = prices[i] - prices[i - 1];
    if (difference >= 0) {
      gains += difference;
    } else {
      losses -= difference;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period; i < prices.length; i++) {
    if (i > period) {
      const difference = prices[i] - prices[i - 1];
      if (difference >= 0) {
        avgGain = (avgGain * (period - 1) + difference) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - difference) / period;
      }
    }

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }

  const result = Array(period).fill(null).concat(rsi);
  return result;
}

function calculateVolatilityMetrics(data) {
  const atr = technicalIndicators.ATR.calculate({
    high: data.map((c) => c.high),
    low: data.map((c) => c.low),
    close: data.map((c) => c.close),
    period: 14,
  });

  const currentATR = atr[atr.length - 1];
  const lastClose = data[data.length - 1].close;
  const atrPercentage = (currentATR / lastClose) * 100;
  const bb = technicalIndicators.BollingerBands.calculate({
    period: 20,
    stdDev: 2,
    values: data.map((c) => c.close),
  });

  const currentBB = bb[bb.length - 1];
  const bandWidth = (currentBB.upper - currentBB.lower) / currentBB.middle;
  const bandWidths = bb.slice(-20).map((b) => (b.upper - b.lower) / b.middle);
  const avgBandWidth =
    bandWidths.reduce((sum, width) => sum + width, 0) / bandWidths.length;
  const volatilitySqueeze = bandWidth < avgBandWidth * 0.8;

  return {
    atr: currentATR,
    atrPercentage,
    bandWidth,
    avgBandWidth,
    volatilitySqueeze,
  };
}

function analyzeTradingOpportunity(
  indicators,
  patterns,
  volatility,
  timeframe
) {
  const { sma, ema, macd, rsi, adx, lastClose } = indicators;
  const lastMACD = macd[macd.length - 1];
  const lastRSI14 = rsi.rsi14[rsi.rsi14.length - 1];
  const lastEMA10 = ema.ema10[ema.ema10.length - 1];
  const lastEMA21 = ema.ema21[ema.ema21.length - 1];
  const lastSMA20 = sma.sma20[sma.sma20.length - 1];
  const lastSMA50 = sma.sma50[sma.sma50.length - 1];
  const lastSMA200 = sma.sma200[sma.sma200.length - 1];
  const lastADX = adx[adx.length - 1];

  const maAlignment = lastEMA10 > lastEMA21 && lastClose > lastSMA50;
  const trendDirection = maAlignment ? "bullish" : "bearish";
  const trendStrength =
    lastADX.adx > 25 ? "strong" : lastADX.adx > 20 ? "moderate" : "weak";
  const macdCrossover =
    macd[macd.length - 2]?.MACD < macd[macd.length - 2]?.signal &&
    lastMACD.MACD > lastMACD.signal;

  const macdCrossunder =
    macd[macd.length - 2]?.MACD > macd[macd.length - 2]?.signal &&
    lastMACD.MACD < lastMACD.signal;

  const momentum = {
    bullish: macdCrossover || (lastRSI14 > 50 && lastRSI14 < 70),
    bearish: macdCrossunder || (lastRSI14 < 50 && lastRSI14 > 30),
  };

  const bullishSignals = [
    maAlignment,
    macdCrossover,
    patterns.doubleBottom,
    patterns.momentumBurst.bullish,
    lastRSI14 < 40,
  ].filter(Boolean).length;

  const bearishSignals = [
    !maAlignment,
    macdCrossunder,
    patterns.doubleTop,
    patterns.momentumBurst.bearish,
    lastRSI14 > 60,
  ].filter(Boolean).length;

  const session = getCurrentSession();
  const sessionMultiplier =
    session === "overlap" ? 1.2 : session === "asian" ? 0.8 : 1;

  const bullScore = (bullishSignals / 5) * sessionMultiplier;
  const bearScore = (bearishSignals / 5) * sessionMultiplier;

  const recommendedPositionSize = volatility.volatilitySqueeze
    ? 0.5
    : volatility.atrPercentage > 1
    ? 0.75
    : 1;

  const stopLossPips = Math.ceil(volatility.atr * 100);
  const targetPips = Math.ceil(stopLossPips * 1.5);

  return {
    timeframe,
    trendDirection,
    trendStrength,
    momentum,
    bullScore,
    bearScore,
    recommendedPositionSize,
    stopLossPips,
    targetPips,
    volatilityCondition: volatility.volatilitySqueeze ? "Squeeze" : "Normal",
    recommendation:
      bullScore > 0.6 ? "BUY" : bearScore > 0.6 ? "SELL" : "NEUTRAL",
  };
}

function checkTimeframeAlignment(analysis) {
  const directions = Object.values(analysis).map((a) => a.trendDirection);
  const bullCount = directions.filter((d) => d === "bullish").length;
  const bearCount = directions.filter((d) => d === "bearish").length;

  const aligned = bullCount >= 3 || bearCount >= 3;
  const direction = bullCount >= bearCount ? "bullish" : "bearish";

  return {
    aligned,
    direction,
    bullCount,
    bearCount,
  };
}

async function enhancedMarketAnalysis(symbol) {
  const timeframeAnalysis = {};
  let dayTradingOpportunities = [];
  let midTermOutlook = {};

  const dailyData = await fetchHistoricalData(symbol, "1D");
  const lastCompleteDailyCandle = dailyData[dailyData.length - 2]; // Yesterday's candle
  const pivotPoints = calculatePivotPoints(lastCompleteDailyCandle);

  for (const timeframe of TIMEFRAMES) {
    const data = await fetchHistoricalData(symbol, timeframe);
    if (data.length < 200) {
      console.warn(`Insufficient data for ${symbol} on ${timeframe}`);
      continue;
    }

    const indicators = calculateIndicators(data);
    const patterns = identifyPatterns(data);
    const advancedPatterns = identifyAdvancedPatterns(data);
    const volatility = calculateVolatilityMetrics(data);
    const volumeIndicators = calculateVolumeIndicators(data);
    const fibLevels = calculateFibonacciLevels(data);

    timeframeAnalysis[timeframe] = analyzeTradingOpportunity(
      indicators,
      patterns,
      volatility,
      timeframe
    );

    if (["1m", "2m", "4m", "5m", "15m", "30m"].includes(timeframe)) {
      const dayTradingAnalysis = analyzeForDayTrading(
        data,
        indicators,
        patterns,
        advancedPatterns,
        volatility,
        volumeIndicators,
        pivotPoints,
        fibLevels.shortTerm
      );
      if (dayTradingAnalysis.tradingOpportunity) {
        dayTradingOpportunities.push({ timeframe, ...dayTradingAnalysis });
      }
    }

    if (["1h", "2h", "4h"].includes(timeframe)) {
      const midTermAnalysis = analyzeForMidTerm(
        data,
        indicators,
        patterns,
        advancedPatterns,
        volatility,
        volumeIndicators,
        fibLevels.midTerm
      );
      midTermOutlook[timeframe] = midTermAnalysis;
    }
  }

  const mtfAligned = checkTimeframeAlignment(timeframeAnalysis);
  return {
    symbol,
    timestamp: new Date().toISOString(),
    timeframeAnalysis,
    multiTimeframeAligned: mtfAligned,
    dayTradingOpportunities,
    midTermOutlook,
    pivotPoints,
    overallRecommendation: enhancedOverallRecommendation(
      timeframeAnalysis,
      mtfAligned,
      dayTradingOpportunities,
      midTermOutlook
    ),
  };
}

function enhancedOverallRecommendation(
  timeframeAnalysis,
  mtfAligned,
  dayTradingOpportunities,
  midTermOutlook
) {
  const strongAlignment = mtfAligned.strength > 0.7;
  const hasDayTradingOpportunity = dayTradingOpportunities.length > 0;
  const hasMidTermOpportunity = Object.values(midTermOutlook).some(
    (analysis) => analysis.tradingOpportunity
  );

  let bestMidTermTimeframe = null;
  let bestMidTermConfidence = 0;

  for (const [timeframe, analysis] of Object.entries(midTermOutlook)) {
    if (analysis.tradingOpportunity && analysis.confidence === "high") {
      bestMidTermTimeframe = timeframe;
      bestMidTermConfidence = "high";
      break;
    } else if (
      analysis.tradingOpportunity &&
      analysis.confidence === "moderate" &&
      bestMidTermConfidence !== "high"
    ) {
      bestMidTermTimeframe = timeframe;
      bestMidTermConfidence = "moderate";
    }
  }

  let bestDayTradingOpportunity = null;

  if (hasDayTradingOpportunity) {
    bestDayTradingOpportunity = dayTradingOpportunities.reduce(
      (best, current) => {
        if (!best) return current;
        return current.riskRewardRatio > best.riskRewardRatio ? current : best;
      },
      null
    );
  }

  const recommendation = {
    shortTerm: {
      action: hasDayTradingOpportunity
        ? bestDayTradingOpportunity.direction
        : "wait",
      confidence: hasDayTradingOpportunity
        ? bestDayTradingOpportunity.confidence
        : "low",
      timeframe: hasDayTradingOpportunity
        ? bestDayTradingOpportunity.timeframe
        : null,
      entry: hasDayTradingOpportunity ? bestDayTradingOpportunity.entry : null,
      stopLoss: hasDayTradingOpportunity
        ? bestDayTradingOpportunity.stopLoss
        : null,
      target: hasDayTradingOpportunity
        ? bestDayTradingOpportunity.target
        : null,
      riskRewardRatio: hasDayTradingOpportunity
        ? bestDayTradingOpportunity.riskRewardRatio
        : null,
    },
    midTerm: {
      action: hasMidTermOpportunity
        ? midTermOutlook[bestMidTermTimeframe].direction
        : "wait",
      confidence: hasMidTermOpportunity
        ? midTermOutlook[bestMidTermTimeframe].confidence
        : "low",
      timeframe: bestMidTermTimeframe,
      entry: hasMidTermOpportunity
        ? midTermOutlook[bestMidTermTimeframe].entry
        : null,
      stopLoss: hasMidTermOpportunity
        ? midTermOutlook[bestMidTermTimeframe].stopLoss
        : null,
      target: hasMidTermOpportunity
        ? midTermOutlook[bestMidTermTimeframe].target
        : null,
      riskRewardRatio: hasMidTermOpportunity
        ? midTermOutlook[bestMidTermTimeframe].riskRewardRatio
        : null,
    },
  };

  const dayTradingDirection = hasDayTradingOpportunity
    ? bestDayTradingOpportunity.direction
    : "neutral";
  const midTermDirection = hasMidTermOpportunity
    ? midTermOutlook[bestMidTermTimeframe].direction
    : "neutral";

  let overallSentiment;

  if (
    dayTradingDirection === midTermDirection &&
    dayTradingDirection !== "neutral"
  ) {
    overallSentiment = dayTradingDirection;
  } else if (strongAlignment) {
    overallSentiment = mtfAligned.direction;
  } else if (hasMidTermOpportunity) {
    overallSentiment = midTermDirection;
  } else if (hasDayTradingOpportunity) {
    overallSentiment = dayTradingDirection;
  } else {
    overallSentiment = "neutral";
  }

  const marketConditions = {
    volatility: Object.values(timeframeAnalysis).some(
      (analysis) => analysis.volatility === "high"
    )
      ? "high"
      : "normal",
    trend: strongAlignment ? "strong" : "mixed",
    recommendation: overallSentiment,
  };

  return {
    sentiment: overallSentiment,
    marketConditions,
    shortTerm: recommendation.shortTerm,
    midTerm: recommendation.midTerm,
    timeframeAlignment: strongAlignment ? "strong" : "weak",
    confidence: strongAlignment ? "high" : "moderate",
  };
}

async function analyzeMarketBreadth(symbol, sectorSymbols) {
  const data = await fetchHistoricalData(symbol, "1h", 100);
  const sectorData = {};
  for (const relatedSymbol of sectorSymbols) {
    sectorData[relatedSymbol] = await fetchHistoricalData(
      relatedSymbol,
      "1h",
      100
    );
  }

  let symbolsInUptrend = 0;
  let symbolsInDowntrend = 0;

  for (const [relatedSymbol, relatedData] of Object.entries(sectorData)) {
    if (relatedData.length < 50) continue;

    const closes = relatedData.map((candle) => candle.close);
    const sma20 = technicalIndicators.SMA.calculate({
      period: 20,
      values: closes,
    });
    const sma50 = technicalIndicators.SMA.calculate({
      period: 50,
      values: closes,
    });

    if (sma20[sma20.length - 1] > sma50[sma50.length - 1]) {
      symbolsInUptrend++;
    } else {
      symbolsInDowntrend++;
    }
  }

  const percentInUptrend =
    (symbolsInUptrend / (symbolsInUptrend + symbolsInDowntrend)) * 100;
  let advanceCount = 0;
  let declineCount = 0;

  for (const [relatedSymbol, relatedData] of Object.entries(sectorData)) {
    if (relatedData.length < 2) continue;

    const lastClose = relatedData[relatedData.length - 1].close;
    const previousClose = relatedData[relatedData.length - 2].close;

    if (lastClose > previousClose) {
      advanceCount++;
    } else {
      declineCount++;
    }
  }

  const advanceDeclineRatio = advanceCount / (declineCount || 1);
  const correlations = {};
  const mainSymbolCloses = data.map((candle) => candle.close);

  for (const [relatedSymbol, relatedData] of Object.entries(sectorData)) {
    if (relatedData.length < 50) continue;

    const relatedCloses = relatedData.map((candle) => candle.close);
    const minLength = Math.min(mainSymbolCloses.length, relatedCloses.length);

    if (minLength < 30) continue;
    const correlation = calculateCorrelation(
      mainSymbolCloses.slice(-minLength),
      relatedCloses.slice(-minLength)
    );

    correlations[relatedSymbol] = correlation;
  }

  const avgCorrelation =
    Object.values(correlations).reduce((sum, corr) => sum + corr, 0) /
    Object.values(correlations).length;

  let marketBreadthStrength;
  if (percentInUptrend > 70 && advanceDeclineRatio > 1.5) {
    marketBreadthStrength = "very bullish";
  } else if (percentInUptrend > 60 && advanceDeclineRatio > 1) {
    marketBreadthStrength = "bullish";
  } else if (percentInUptrend < 30 && advanceDeclineRatio < 0.5) {
    marketBreadthStrength = "very bearish";
  } else if (percentInUptrend < 40 && advanceDeclineRatio < 1) {
    marketBreadthStrength = "bearish";
  } else {
    marketBreadthStrength = "neutral";
  }

  return {
    symbol,
    sectorSymbolsAnalyzed: Object.keys(sectorData).length,
    percentInUptrend,
    advanceDeclineRatio,
    marketBreadthStrength,
    avgCorrelation,
    stronglyCorrelatedSymbols: Object.entries(correlations)
      .filter(([_, corr]) => Math.abs(corr) > 0.7)
      .map(([sym, corr]) => ({ symbol: sym, correlation: corr })),
  };
}

function calculateCorrelation(arr1, arr2) {
  const n = arr1.length;
  let sum1 = 0;
  let sum2 = 0;
  let sum1Sq = 0;
  let sum2Sq = 0;
  let psum = 0;

  for (let i = 0; i < n; i++) {
    sum1 += arr1[i];
    sum2 += arr2[i];
    sum1Sq += arr1[i] ** 2;
    sum2Sq += arr2[i] ** 2;
    psum += arr1[i] * arr2[i];
  }

  const num = psum - (sum1 * sum2) / n;
  const den = Math.sqrt((sum1Sq - sum1 ** 2 / n) * (sum2Sq - sum2 ** 2 / n));

  return num / den;
}

function calculateVolatilityMetrics(data) {
  if (data.length < 20) return {};

  const closes = data.map((candle) => candle.close);
  const highs = data.map((candle) => candle.high);
  const lows = data.map((candle) => candle.low);

  const trueRanges = [];
  for (let i = 1; i < data.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trueRanges.push(Math.max(hl, hc, lc));
  }

  const atr14 = [];
  if (trueRanges.length >= 14) {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      sum += trueRanges[i];
    }
    atr14.push(sum / 14);

    for (let i = 14; i < trueRanges.length; i++) {
      atr14.push((atr14[atr14.length - 1] * 13 + trueRanges[i]) / 14);
    }
  }

  const sma20 = technicalIndicators.SMA.calculate({
    period: 20,
    values: closes,
  });
  const standardDeviation = calculateStandardDeviation(closes.slice(-20));

  const upperBand = sma20[sma20.length - 1] + 2 * standardDeviation;
  const lowerBand = sma20[sma20.length - 1] - 2 * standardDeviation;

  const bandWidth = (upperBand - lowerBand) / sma20[sma20.length - 1];

  const periodReturns = [];
  for (let i = 1; i < closes.length; i++) {
    periodReturns.push(Math.log(closes[i] / closes[i - 1]));
  }

  const historicalVolatility =
    calculateStandardDeviation(periodReturns.slice(-20)) * Math.sqrt(365);

  const recentBandWidth = [];
  for (let i = 0; i < 10; i++) {
    if (i < sma20.length) {
      const stdDev = calculateStandardDeviation(closes.slice(-(20 + i), -i));
      recentBandWidth.push(
        (sma20[sma20.length - 1 - i] +
          2 * stdDev -
          (sma20[sma20.length - 1 - i] - 2 * stdDev)) /
          sma20[sma20.length - 1 - i]
      );
    }
  }

  const volatilitySqueeze =
    bandWidth < Math.min(...recentBandWidth.slice(0, -1)) &&
    atr14[atr14.length - 1] < Math.min(...atr14.slice(-5, -1));
  let volatilityLevel;
  if (bandWidth < 0.015) {
    volatilityLevel = "very low";
  } else if (bandWidth < 0.025) {
    volatilityLevel = "low";
  } else if (bandWidth < 0.035) {
    volatilityLevel = "moderate";
  } else if (bandWidth < 0.05) {
    volatilityLevel = "high";
  } else {
    volatilityLevel = "very high";
  }

  return {
    atr: atr14[atr14.length - 1],
    historicalVolatility,
    bollingerBandWidth: bandWidth,
    volatilityLevel,
    volatilitySqueeze,
    bollingerBands: {
      upper: upperBand,
      middle: sma20[sma20.length - 1],
      lower: lowerBand,
    },
  };
}

function calculateStandardDeviation(values) {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  return Math.sqrt(
    squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length
  );
}

async function comprehensiveTradingAnalysis(symbol, sectorSymbols = []) {
  const analysisResults = await enhancedMarketAnalysis(symbol);
  let marketBreadth = null;
  if (sectorSymbols.length > 0) {
    marketBreadth = await analyzeMarketBreadth(symbol, sectorSymbols);
  }

  return {
    symbol,
    timestamp: new Date().toISOString(),
    technicalAnalysis: analysisResults,
    marketBreadth,
    summary: createAnalysisSummary(analysisResults, marketBreadth),
  };
}

function createAnalysisSummary(analysisResults, marketBreadth) {
  const {
    overallRecommendation,
    dayTradingOpportunities,
    midTermOutlook,
    symbol,
  } = analysisResults;
  let summaryText = `Analysis for ${symbol}: `;
  summaryText += `The overall sentiment is ${overallRecommendation.sentiment}. `;
  if (dayTradingOpportunities.length > 0) {
    const bestOpportunity = dayTradingOpportunities[0];
    summaryText += `For day trading, a ${bestOpportunity.direction} opportunity was identified on the ${bestOpportunity.timeframe} timeframe with ${bestOpportunity.confidence} confidence. `;

    if (bestOpportunity.patterns) {
      const patternNames = Object.entries(bestOpportunity.patterns)
        .filter(
          ([key, value]) =>
            (typeof value === "boolean" && value === true) ||
            (typeof value === "object" && value.found === true)
        )
        .map(([key]) => key);

      if (patternNames.length > 0) {
        summaryText += `Key patterns identified: ${patternNames.join(", ")}. `;
      }
    }
  } else {
    summaryText += `No significant day trading opportunities identified at this time. `;
  }

  const midTermTimeframes = Object.keys(midTermOutlook);
  if (midTermTimeframes.length > 0) {
    const bestMidTerm =
      midTermTimeframes.find((tf) => midTermOutlook[tf].tradingOpportunity) ||
      midTermTimeframes[0];

    if (midTermOutlook[bestMidTerm].tradingOpportunity) {
      summaryText += `For mid-term trading, a ${midTermOutlook[bestMidTerm].direction} opportunity was identified on the ${bestMidTerm} timeframe with ${midTermOutlook[bestMidTerm].confidence} confidence. `;

      if (midTermOutlook[bestMidTerm].trendDirection !== "neutral") {
        summaryText += `The trend is ${midTermOutlook[bestMidTerm].trendStrength} and ${midTermOutlook[bestMidTerm].trendDirection}. `;
      }
    } else {
      summaryText += `No significant mid-term trading opportunities identified at this time. `;
    }
  }

  if (marketBreadth) {
    summaryText += `Market breadth analysis shows ${
      marketBreadth.marketBreadthStrength
    } conditions with ${marketBreadth.percentInUptrend.toFixed(
      1
    )}% of related symbols in uptrends. `;

    if (marketBreadth.stronglyCorrelatedSymbols.length > 0) {
      const correlatedSymbols = marketBreadth.stronglyCorrelatedSymbols
        .map((item) => item.symbol)
        .slice(0, 3);
      summaryText += `Strongly correlated symbols include: ${correlatedSymbols.join(
        ", "
      )}. `;
    }
  }

  summaryText += `Note: All trading involves risk. Use proper risk management and consider these analyses as one of many inputs for decision making.`;

  return {
    text: summaryText,
    shortTermDirection: overallRecommendation.shortTerm.action,
    midTermDirection: overallRecommendation.midTerm.action,
    overallSentiment: overallRecommendation.sentiment,
    confidence: overallRecommendation.confidence,
    marketConditions: overallRecommendation.marketConditions,
  };
}

function analyzeForDayTrading(
  data,
  indicators,
  patterns,
  advancedPatterns,
  volatility,
  volumeIndicators,
  pivotPoints,
  fibLevels
) {
  const lastCandle = data[data.length - 1];
  const lastClose = lastCandle.close;
  const nearPivotSupport =
    pivotPoints &&
    (Math.abs(lastClose - pivotPoints.support.s1) / lastClose < 0.002 ||
      Math.abs(lastClose - pivotPoints.support.s2) / lastClose < 0.002);

  const nearPivotResistance =
    pivotPoints &&
    (Math.abs(lastClose - pivotPoints.resistance.r1) / lastClose < 0.002 ||
      Math.abs(lastClose - pivotPoints.resistance.r2) / lastClose < 0.002);

  const nearFibLevel =
    Math.abs(lastClose - fibLevels.level_38_2) / lastClose < 0.002 ||
    Math.abs(lastClose - fibLevels.level_50_0) / lastClose < 0.002 ||
    Math.abs(lastClose - fibLevels.level_61_8) / lastClose < 0.002;

  const patternOpportunity =
    patterns.doubleBottom ||
    patterns.insideBars.found ||
    advancedPatterns.bullishFlag.found ||
    advancedPatterns.bearishFlag.found;

  const momentumCondition =
    patterns.momentumBurst.bullish ||
    patterns.momentumBurst.bearish ||
    indicators.rsi.rsi5[indicators.rsi.rsi5.length - 1] < 30 ||
    indicators.rsi.rsi5[indicators.rsi.rsi5.length - 1] > 70;

  const volatilitySqueeze = volatility.volatilitySqueeze;

  const volumeConfirmation =
    !volumeIndicators.divergence.shortTerm &&
    volumeIndicators.volumeTrend === "increasing";

  const tradingOpportunity =
    (nearPivotSupport || nearPivotResistance || nearFibLevel) &&
    (patternOpportunity || momentumCondition) &&
    volumeConfirmation;

  let direction = "neutral";
  if (
    nearPivotSupport &&
    indicators.rsi.rsi5[indicators.rsi.rsi5.length - 1] < 30
  ) {
    direction = "long";
  } else if (
    nearPivotResistance &&
    indicators.rsi.rsi5[indicators.rsi.rsi5.length - 1] > 70
  ) {
    direction = "short";
  } else if (advancedPatterns.bullishFlag.found) {
    direction = "long";
  } else if (advancedPatterns.bearishFlag.found) {
    direction = "short";
  }

  let stopLoss, target;
  if (direction === "long") {
    stopLoss = Math.min(
      lastCandle.low,
      pivotPoints ? pivotPoints.support.s1 : lastCandle.low * 0.998
    );
    target = lastClose + (lastClose - stopLoss) * 1.5; // 1.5:1 reward-to-risk ratio
  } else if (direction === "short") {
    stopLoss = Math.max(
      lastCandle.high,
      pivotPoints ? pivotPoints.resistance.r1 : lastCandle.high * 1.002
    );
    target = lastClose - (stopLoss - lastClose) * 1.5; // 1.5:1 reward-to-risk ratio
  }

  return {
    tradingOpportunity,
    direction,
    keyLevels: {
      supportLevels: pivotPoints
        ? [pivotPoints.support.s1, pivotPoints.support.s2]
        : [],
      resistanceLevels: pivotPoints
        ? [pivotPoints.resistance.r1, pivotPoints.resistance.r2]
        : [],
      fibonacciLevels: [
        fibLevels.level_38_2,
        fibLevels.level_50_0,
        fibLevels.level_61_8,
      ],
    },
    patterns: {
      ...patterns,
      ...advancedPatterns,
    },
    entry: lastClose,
    stopLoss,
    target,
    riskRewardRatio:
      stopLoss && target
        ? Math.abs((target - lastClose) / (stopLoss - lastClose))
        : null,
    timeValidity: "1-4 hours", // Day trading positions should not be held overnight
    confidence: tradingOpportunity ? "high" : "low",
  };
}

function analyzeForMidTerm(
  data,
  indicators,
  patterns,
  advancedPatterns,
  volatility,
  volumeIndicators,
  fibLevels
) {
  const lastCandle = data[data.length - 1];
  const lastClose = lastCandle.close;
  const { sma, ema, macd, rsi, adx } = indicators;
  const lastSMA20 = sma.sma20[sma.sma20.length - 1];
  const lastSMA50 = sma.sma50[sma.sma50.length - 1];
  const lastSMA200 = sma.sma200[sma.sma200.length - 1];
  const lastADX = adx[adx.length - 1];
  let trendDirection = "neutral";
  if (lastSMA20 > lastSMA50 && lastSMA50 > lastSMA200) {
    trendDirection = "bullish";
  } else if (lastSMA20 < lastSMA50 && lastSMA50 < lastSMA200) {
    trendDirection = "bearish";
  }

  const potentialReversal =
    patterns.doubleBottom ||
    patterns.doubleTop ||
    advancedPatterns.headAndShoulders.found;

  const continuationPattern =
    advancedPatterns.ascendingTriangle.found ||
    advancedPatterns.descendingTriangle.found ||
    advancedPatterns.symmetricalTriangle.found ||
    advancedPatterns.bullishFlag.found ||
    advancedPatterns.bearishFlag.found;

  const nearFibLevel =
    Math.abs(lastClose - fibLevels.level_38_2) / lastClose < 0.005 ||
    Math.abs(lastClose - fibLevels.level_50_0) / lastClose < 0.005 ||
    Math.abs(lastClose - fibLevels.level_61_8) / lastClose < 0.005;

  const strongTrend = lastADX > 25;
  const healthyVolume = !volumeIndicators.divergence.midTerm;
  const tradingOpportunity =
    (strongTrend && continuationPattern && healthyVolume) ||
    (potentialReversal && nearFibLevel);

  let direction = "neutral";
  if (
    (trendDirection === "bullish" && !potentialReversal) ||
    (trendDirection === "bearish" && potentialReversal)
  ) {
    direction = "long";
  } else if (
    (trendDirection === "bearish" && !potentialReversal) ||
    (trendDirection === "bullish" && potentialReversal)
  ) {
    direction = "short";
  }

  let stopLoss, target;
  if (direction === "long") {
    stopLoss = Math.min(lastCandle.low, fibLevels.level_61_8, lastSMA50);
    target = lastClose + (lastClose - stopLoss) * 2; // 2:1 reward-to-risk ratio
  } else if (direction === "short") {
    stopLoss = Math.max(lastCandle.high, fibLevels.level_38_2, lastSMA50);
    target = lastClose - (stopLoss - lastClose) * 2; // 2:1 reward-to-risk ratio
  }

  return {
    tradingOpportunity,
    direction,
    trendStrength: lastADX > 25 ? "strong" : "weak",
    trendDirection,
    keyLevels: {
      movingAverages: {
        sma20: lastSMA20,
        sma50: lastSMA50,
        sma200: lastSMA200,
      },
      fibonacciLevels: [
        fibLevels.level_38_2,
        fibLevels.level_50_0,
        fibLevels.level_61_8,
      ],
    },
    patterns: {
      reversal: potentialReversal,
      continuation: continuationPattern,
      details: {
        ...patterns,
        ...advancedPatterns,
      },
    },
    entry: lastClose,
    stopLoss,
    target,
    riskRewardRatio:
      stopLoss && target
        ? Math.abs((target - lastClose) / (stopLoss - lastClose))
        : null,
    timeValidity: "1-3 weeks", // Mid-term positions
    confidence: tradingOpportunity && strongTrend ? "high" : "moderate",
  };
}

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3100;

app.use(express.json());

app.get("/api/enhanced-analyze/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const analysis = await comprehensiveTradingAnalysis(symbol);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Forex trading API running on port ${PORT}`);
});
