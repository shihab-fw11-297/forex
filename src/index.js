const express = require("express");
const app = express();
const axios = require("axios");
const technicalIndicators = require("technicalindicators");
const moment = require("moment");
const { SMA, EMA, RSI, MACD, ATR, BollingerBands, Stochastic } =
  technicalIndicators;

const PORT = process.env.PORT || 3100;
const API_KEY =
  process.env.API_KEY || "API_KEY3f7ADF6GLZQVJRHF8QILKAMRDCE5UEUP"; // Replace with actual key

// Initialize Express
app.use(express.json());

// Error handler middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
});

// 1. Enhanced Data Fetching with proper error handling
async function fetchMarketData(symbol, timeframe, days = 5) {
  try {
    const now = moment();
    const to = now.format("YYYY-MM-DD");

    const from = moment(now).subtract(days, "days").format("YYYY-MM-DD");
    const defaultEnd = moment(now).add(2, "days").format("YYYY-MM-DD");

    // Parse timeframe to get interval for API
    let interval = "5/minute"; // default
    if (timeframe === "1m") interval = "1/minute";
    if (timeframe === "2m") interval = "2/minute";
    if (timeframe === "3m") interval = "3/minute";
    if (timeframe === "5m") interval = "5/minute";
    if (timeframe === "15m") interval = "15/minute";
    if (timeframe === "30m") interval = "30/minute";
    if (timeframe === "1h") interval = "1/hour";


    const url = `https://api.finage.co.uk/agg/forex/${symbol}/${interval}/${from}/${defaultEnd}?apikey=${API_KEY}&limit=1500`;

    const response = await axios.get(url, { timeout: 10000 });
    console.log("url",url);

    // Validate response data
    if (
      !response.data ||
      !response.data.results ||
      !Array.isArray(response.data.results)
    ) {
      throw new Error("Invalid API response format");
    }

    return response.data.results
      .map((entry) => ({
        timestamp: entry.t,
        open: parseFloat(entry.o),
        high: parseFloat(entry.h),
        low: parseFloat(entry.l),
        close: parseFloat(entry.c),
        volume: parseFloat(entry.v || 0), // Handle missing volume data
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    console.error("Data fetch error:", error.message);
    // Throw error to be handled by caller
    throw new Error(`Failed to fetch market data: ${error.message}`);
  }
}

// 1. Add this function to analyze volume pressure
function analyzeVolumePressure(data) {
  if (!data || data.length < 10) {
    return { buyPressure: 0, sellPressure: 0, netPressure: 0 };
  }

  // Only analyze the most recent 20 candles for volume pressure
  const recentData = data.slice(-20);

  // Calculate average volume for baseline
  const avgVolume =
    recentData.reduce((sum, candle) => sum + (candle.volume || 0), 0) /
    recentData.length;

  // Initialize pressure metrics
  let buyVolume = 0;
  let sellVolume = 0;
  let strongBuyVolume = 0;
  let strongSellVolume = 0;

  // Analyze each candle for buying/selling pressure
  recentData.forEach((candle) => {
    // Skip candles with no volume data
    if (!candle.volume) return;

    const range = candle.high - candle.low;
    const bodySize = Math.abs(candle.close - candle.open);
    const isStrongCandle = bodySize > range * 0.6;

    if (candle.close > candle.open) {
      // Bullish candle
      if (isStrongCandle) {
        // Strong bullish candle with high volume indicates strong buying
        strongBuyVolume += candle.volume * (bodySize / range) * 1.5;
      } else {
        buyVolume += candle.volume * (bodySize / range);
      }
    } else if (candle.close < candle.open) {
      // Bearish candle
      if (isStrongCandle) {
        // Strong bearish candle with high volume indicates strong selling
        strongSellVolume += candle.volume * (bodySize / range) * 1.5;
      } else {
        sellVolume += candle.volume * (bodySize / range);
      }
    }
  });

  // Calculate relative pressures (normalized to 0-100 scale)
  const totalAnalyzedVolume =
    buyVolume + sellVolume + strongBuyVolume + strongSellVolume;

  // Avoid division by zero
  if (totalAnalyzedVolume === 0) {
    return { buyPressure: 50, sellPressure: 50, netPressure: 0 };
  }

  // Calculate weighted buy/sell pressure
  const totalBuyPressure = buyVolume + strongBuyVolume * 1.5;
  const totalSellPressure = sellVolume + strongSellVolume * 1.5;

  // Convert to percentage (0-100)
  const buyPressure = Math.min(
    100,
    Math.round((totalBuyPressure / totalAnalyzedVolume) * 100)
  );
  const sellPressure = Math.min(
    100,
    Math.round((totalSellPressure / totalAnalyzedVolume) * 100)
  );

  // Calculate net pressure (-100 to +100, where positive means buying pressure)
  const netPressure = Math.round(
    ((totalBuyPressure - totalSellPressure) / totalAnalyzedVolume) * 100
  );

  // Calculate recent volume trend (increasing or decreasing volume)
  const firstHalf = recentData.slice(0, Math.floor(recentData.length / 2));
  const secondHalf = recentData.slice(Math.floor(recentData.length / 2));

  const firstHalfAvgVol =
    firstHalf.reduce((sum, candle) => sum + (candle.volume || 0), 0) /
    firstHalf.length;
  const secondHalfAvgVol =
    secondHalf.reduce((sum, candle) => sum + (candle.volume || 0), 0) /
    secondHalf.length;

  const volumeTrend =
    secondHalfAvgVol > firstHalfAvgVol * 1.1
      ? "increasing"
      : secondHalfAvgVol < firstHalfAvgVol * 0.9
      ? "decreasing"
      : "stable";

  // Check for volume spikes
  const hasVolumeSpikeUp = recentData
    .slice(-3)
    .some(
      (candle) => candle.volume > avgVolume * 1.8 && candle.close > candle.open
    );

  const hasVolumeSpikeDown = recentData
    .slice(-3)
    .some(
      (candle) => candle.volume > avgVolume * 1.8 && candle.close < candle.open
    );

  // Calculate volume divergence with price
  const priceChange =
    recentData[recentData.length - 1].close - recentData[0].close;
  const isPriceUp = priceChange > 0;
  const isVolumeDivergent =
    (isPriceUp && volumeTrend === "decreasing") ||
    (!isPriceUp && volumeTrend === "increasing");

  return {
    buyPressure,
    sellPressure,
    netPressure,
    volumeTrend,
    hasVolumeSpikeUp,
    hasVolumeSpikeDown,
    isVolumeDivergent,
    recentVolumeChange: (secondHalfAvgVol / firstHalfAvgVol - 1) * 100,
  };
}

// 2. Expanded Indicator Calculation with additional indicators
function calculateIndicators(data) {
  // Validate input data
  if (!Array.isArray(data) || data.length < 30) {
    throw new Error(
      `Insufficient data points for indicator calculation ${data.length}`
    );
  }

  const closes = data.map((d) => d.close);
  const highs = data.map((d) => d.high);
  const lows = data.map((d) => d.low);
  const opens = data.map((d) => d.open);

  try {
    return {
      sma20: SMA.calculate({ period: 20, values: closes }),
      sma50: SMA.calculate({ period: 50, values: closes }),
      ema10: EMA.calculate({ period: 10, values: closes }),
      ema21: EMA.calculate({ period: 21, values: closes }),
      rsi: RSI.calculate({ period: 14, values: closes }),
      macd: MACD.calculate({
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        values: closes,
      }),
      atr: ATR.calculate({ period: 14, high: highs, low: lows, close: closes }),
      bb: BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }),
      stochastic: Stochastic.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: 14,
        signalPeriod: 3,
      }),
    };
  } catch (error) {
    throw new Error(`Indicator calculation failed: ${error.message}`);
  }
}

// 2. Update the generateSignal function to include volume pressure
function generateSignal(data, indicators) {
  if (data.length < 3) {
    throw new Error("Insufficient data for signal generation");
  }

  const lastCandle = data[data.length - 1];
  const prevCandle = data[data.length - 2];
  const thirdCandle = data[data.length - 3];

  // Get volume pressure analysis
  const volumePressure = analyzeVolumePressure(data);

  // Enhanced Price Action Patterns
  const patterns = {
    // Standard patterns
    bullishEngulfing:
      lastCandle.open < prevCandle.close &&
      lastCandle.close > prevCandle.open &&
      lastCandle.close > lastCandle.open,
    bearishEngulfing:
      lastCandle.open > prevCandle.close &&
      lastCandle.close < prevCandle.open &&
      lastCandle.close < lastCandle.open,

    // More sensitive pin bar detection
    bullishPinBar:
      lastCandle.low < prevCandle.low &&
      lastCandle.high - lastCandle.close <
        (lastCandle.close - lastCandle.low) * 0.5 &&
      lastCandle.close > lastCandle.open,

    bearishPinBar:
      lastCandle.high > prevCandle.high &&
      lastCandle.close - lastCandle.low <
        (lastCandle.high - lastCandle.close) * 0.5 &&
      lastCandle.close < lastCandle.open,

    // Momentum patterns
    strongBullishCandle:
      lastCandle.close > lastCandle.open &&
      lastCandle.close - lastCandle.open >
        (lastCandle.high - lastCandle.low) * 0.6,

    strongBearishCandle:
      lastCandle.close < lastCandle.open &&
      lastCandle.open - lastCandle.close >
        (lastCandle.high - lastCandle.low) * 0.6,

    // Three candle patterns
    morningStarFormed:
      prevCandle.open > prevCandle.close && // First candle bearish
      Math.abs(thirdCandle.open - thirdCandle.close) <
        Math.abs(prevCandle.open - prevCandle.close) * 0.5 && // Second candle small
      lastCandle.close > lastCandle.open && // Third candle bullish
      lastCandle.close > (prevCandle.open + prevCandle.close) / 2, // Third candle retraces first

    eveningStarFormed:
      prevCandle.close > prevCandle.open && // First candle bullish
      Math.abs(thirdCandle.open - thirdCandle.close) <
        Math.abs(prevCandle.open - prevCandle.close) * 0.5 && // Second candle small
      lastCandle.open > lastCandle.close && // Third candle bearish
      lastCandle.close < (prevCandle.open + prevCandle.close) / 2, // Third candle retraces first
  };

  // Get indicator values
  const lastIdx = data.length - 1;

  // RSI values
  const currentRSI = indicators.rsi[indicators.rsi.length - 1];
  const prevRSI = indicators.rsi[indicators.rsi.length - 2];

  // MACD values
  const currentMACD = indicators.macd[indicators.macd.length - 1];
  const prevMACD = indicators.macd[indicators.macd.length - 2];

  // Bollinger Bands values
  const currentBB = indicators.bb[indicators.bb.length - 1];

  // Moving Averages
  const ema10 = indicators.ema10[indicators.ema10.length - 1];
  const ema21 = indicators.ema21[indicators.ema21.length - 1];

  // Stochastic
  const stoch = indicators.stochastic[indicators.stochastic.length - 1];
  const prevStoch = indicators.stochastic[indicators.stochastic.length - 2];

  // SIGNAL GENERATION LOGIC - Now including volume pressure

  // BUY SIGNALS - Need to meet 3 of these 7 conditions (added volume condition)
  const buySignals = [
    // Bullish price action
    patterns.bullishEngulfing ||
      patterns.bullishPinBar ||
      patterns.strongBullishCandle ||
      patterns.morningStarFormed,

    // RSI conditions - more relaxed
    currentRSI < 65 && currentRSI > prevRSI,

    // MACD conditions - histogram or signal line crossing
    currentMACD.histogram > 0 ||
      (currentMACD.histogram > prevMACD.histogram && prevMACD.histogram < 0),

    // Bollinger Band condition
    lastCandle.close > currentBB.middle || lastCandle.low <= currentBB.lower,

    // Moving average alignment
    lastCandle.close > ema10 && ema10 > ema21,

    // Stochastic conditions
    stoch.k < 80 && stoch.k > stoch.d && prevStoch.k < prevStoch.d,

    // NEW: Volume pressure conditions for buy
    volumePressure.buyPressure > 60 ||
      volumePressure.netPressure > 20 ||
      volumePressure.hasVolumeSpikeUp,
  ];

  // SELL SIGNALS - Need to meet 3 of these 7 conditions (added volume condition)
  const sellSignals = [
    // Bearish price action
    patterns.bearishEngulfing ||
      patterns.bearishPinBar ||
      patterns.strongBearishCandle ||
      patterns.eveningStarFormed,

    // RSI conditions - more relaxed
    currentRSI > 35 && currentRSI < prevRSI,

    // MACD conditions - histogram or signal line crossing
    currentMACD.histogram < 0 ||
      (currentMACD.histogram < prevMACD.histogram && prevMACD.histogram > 0),

    // Bollinger Band condition
    lastCandle.close < currentBB.middle || lastCandle.high >= currentBB.upper,

    // Moving average alignment
    lastCandle.close < ema10 && ema10 < ema21,

    // Stochastic conditions
    stoch.k > 20 && stoch.k < stoch.d && prevStoch.k > prevStoch.d,

    // NEW: Volume pressure conditions for sell
    volumePressure.sellPressure > 60 ||
      volumePressure.netPressure < -20 ||
      volumePressure.hasVolumeSpikeDown,
  ];

  // Count how many buy and sell conditions are met
  const buyConditionsMet = buySignals.filter(Boolean).length;
  const sellConditionsMet = sellSignals.filter(Boolean).length;

  // Determine signal based on minimum threshold of conditions
  let signal = "HOLD";
  let signalStrength = 0;

  if (buyConditionsMet >= 3 && buyConditionsMet > sellConditionsMet) {
    signal = "BUY";
    signalStrength = buyConditionsMet;
  } else if (sellConditionsMet >= 3 && sellConditionsMet > buyConditionsMet) {
    signal = "SELL";
    signalStrength = sellConditionsMet;
  }

  // Add volume divergence warning - this can reduce confidence if volume doesn't support price
  let volumeWarning = null;
  if (
    signal === "BUY" &&
    volumePressure.sellPressure > volumePressure.buyPressure
  ) {
    volumeWarning =
      "Caution: Volume pressure shows selling despite bullish signal";
  } else if (
    signal === "SELL" &&
    volumePressure.buyPressure > volumePressure.sellPressure
  ) {
    volumeWarning =
      "Caution: Volume pressure shows buying despite bearish signal";
  }

  // Adjust confidence if volume divergence exists
  let confidenceAdjustment = 0;
  if (volumeWarning) {
    confidenceAdjustment = -15; // Reduce confidence by 15% if volume doesn't support signal
  } else if (
    (signal === "BUY" && volumePressure.buyPressure > 70) ||
    (signal === "SELL" && volumePressure.sellPressure > 70)
  ) {
    confidenceAdjustment = 10; // Increase confidence by 10% if strong supporting volume
  }

  return {
    signal,
    signalStrength,
    conditionsMet:
      signal === "BUY"
        ? buyConditionsMet
        : signal === "SELL"
        ? sellConditionsMet
        : 0,
    totalConditions: 7, // Total possible conditions (now includes volume)
    confidence:
      calculateConfidence(
        indicators,
        lastCandle,
        currentBB,
        signal,
        signalStrength
      ) + confidenceAdjustment,
    timestamp: lastCandle.timestamp,
    price: lastCandle.close,
    patterns: Object.keys(patterns).filter((key) => patterns[key]),
    volumeAnalysis: volumePressure, // Include volume analysis in the signal
    volumeWarning, // Include any warnings about volume divergence
  };
}

// 4. Enhanced Confidence Calculation with signal strength
function calculateConfidence(
  indicators,
  lastCandle,
  bb,
  signal,
  signalStrength
) {
  // Base confidence from signal strength (number of conditions met)
  const baseConfidence = Math.min(100, Math.floor((signalStrength / 6) * 100));

  // No confidence for HOLD signals
  if (signal === "HOLD") return 0;

  // Additional confidence factors
  let additionalConfidence = 0;

  // RSI extremes add confidence
  const currentRSI = indicators.rsi[indicators.rsi.length - 1];
  if (
    (signal === "BUY" && currentRSI < 30) ||
    (signal === "SELL" && currentRSI > 70)
  ) {
    additionalConfidence += 10;
  }

  // Price relative to Bollinger Bands
  if (
    (signal === "BUY" && lastCandle.close < bb.lower) ||
    (signal === "SELL" && lastCandle.close > bb.upper)
  ) {
    additionalConfidence += 15;
  }

  // MACD histogram strength
  const macdHist = indicators.macd[indicators.macd.length - 1].histogram;
  if (
    (signal === "BUY" && macdHist > 0.0005) ||
    (signal === "SELL" && macdHist < -0.0005)
  ) {
    additionalConfidence += 10;
  }

  // Stochastic extreme values
  const stoch = indicators.stochastic[indicators.stochastic.length - 1];
  if (
    (signal === "BUY" && stoch.k < 20) ||
    (signal === "SELL" && stoch.k > 80)
  ) {
    additionalConfidence += 10;
  }

  // Combine base and additional confidence, cap at 100
  return Math.min(100, baseConfidence + additionalConfidence);
}

// 5. Aggressive Risk Management suitable for high-risk strategy
function calculateRiskParameters(data, indicators, signal) {
  if (!data.length || !indicators.atr || !indicators.atr.length) {
    throw new Error("Insufficient data for risk calculation");
  }

  const lastCandle = data[data.length - 1];
  const atr = indicators.atr[indicators.atr.length - 1];

  // Different risk parameters based on signal confidence
  let stopMultiplier, takeProfitMultiplier;

  if (signal.confidence >= 80) {
    // High confidence = tighter stops, higher TP
    stopMultiplier = 1.0;
    takeProfitMultiplier = 2.5;
  } else if (signal.confidence >= 60) {
    // Medium confidence
    stopMultiplier = 1.2;
    takeProfitMultiplier = 2.0;
  } else {
    // Lower confidence = wider stops needed
    stopMultiplier = 1.5;
    takeProfitMultiplier = 1.8;
  }

  // Calculate stop loss and take profit based on signal direction
  let stopLoss, takeProfit;

  if (signal.signal === "BUY") {
    stopLoss = lastCandle.close - atr * stopMultiplier;
    takeProfit = lastCandle.close + atr * takeProfitMultiplier;
  } else if (signal.signal === "SELL") {
    stopLoss = lastCandle.close + atr * stopMultiplier;
    takeProfit = lastCandle.close - atr * takeProfitMultiplier;
  } else {
    // HOLD signal - no SL/TP needed
    stopLoss = null;
    takeProfit = null;
  }

  return {
    stopLoss,
    takeProfit,
    riskRewardRatio:
      stopLoss && takeProfit
        ? Math.abs(takeProfit - lastCandle.close) /
          Math.abs(stopLoss - lastCandle.close)
        : null,
    atrValue: atr,
    recommendedPositionSizePercent:
      signal.confidence >= 70 ? 5 : signal.confidence >= 50 ? 3 : 2,
    expiry: Date.now() + 900000, // 15 minutes (3 candles)
  };
}

// 6. Signal Generation Endpoint - Get symbol and timeframe from query parameters
app.get("/signal", async (req, res) => {
  try {
    // Get parameters from query with defaults
    const symbol = req.query.symbol || "audusd";
    const timeframe = req.query.timeframe || "5m";

    // Validate parameters
    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Valid symbol parameter is required",
      });
    }

    if (!["1m", "5m", "15m", "30m", "1h", "3m", "2m"].includes(timeframe)) {
      return res.status(400).json({
        status: "error",
        message: "Timeframe must be one of: 1m, 5m, 15m, 30m, 1h, 3m, 2m",
      });
    }

    // Fetch data from API for requested symbol and timeframe
    const historicalData = await fetchMarketData(symbol, timeframe);

    // Check if we have data
    if (historicalData.length < 50) {
      return res.status(503).json({
        status: "error",
        message: "Insufficient historical data for signal generation",
      });
    }

    // Calculate indicators
    const indicators = calculateIndicators(historicalData);

    // Generate signal
    const signal = generateSignal(historicalData, indicators);
    const riskParams = calculateRiskParameters(
      historicalData,
      indicators,
      signal
    );

    // Add indicator values for additional context
    const indicatorValues = {
      rsi: indicators.rsi.slice(-1)[0],
      macd: {
        histogram: indicators.macd.slice(-1)[0].histogram,
        signal: indicators.macd.slice(-1)[0].signal,
        MACD: indicators.macd.slice(-1)[0].MACD,
      },
      stochastic: indicators.stochastic.slice(-1)[0],
      bb: {
        upper: indicators.bb.slice(-1)[0].upper,
        middle: indicators.bb.slice(-1)[0].middle,
        lower: indicators.bb.slice(-1)[0].lower,
      },
      atr: indicators.atr.slice(-1)[0],
      ema10: indicators.ema10.slice(-1)[0],
      ema21: indicators.ema21.slice(-1)[0],
    };

    // Volume pressure summary for easy reading
    const volumeSummary = {
      dominantPressure:
        signal.volumeAnalysis.netPressure > 10
          ? "Buyers"
          : signal.volumeAnalysis.netPressure < -10
          ? "Sellers"
          : "Neutral",
      buyPressure: signal.volumeAnalysis.buyPressure + "%",
      sellPressure: signal.volumeAnalysis.sellPressure + "%",
      trend: signal.volumeAnalysis.volumeTrend,
      recentChange: signal.volumeAnalysis.recentVolumeChange.toFixed(1) + "%",
      hasVolumeSpikeUp: signal.volumeAnalysis.hasVolumeSpikeUp,
      hasVolumeSpikeDown: signal.volumeAnalysis.hasVolumeSpikeDown,
      warning: signal.volumeWarning,
    };

    res.json({
      status: "success",
      symbol: symbol,
      timeframe: timeframe,
      ...signal,
      ...riskParams,
      generatedAt: Date.now(),
      indicators: indicatorValues,
      activePatterns: signal.patterns,
      volumeSummary,
    });
  } catch (error) {
    console.error("Signal generation error:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Signal generation failed",
    });
  }
});

// 7. Improved Backtesting Endpoint with on-demand data fetching
app.get("/backtest", async (req, res) => {
  try {
    // Get parameters from query
    const symbol = req.query.symbol || "audusd";
    const timeframe = req.query.timeframe || "5m";
    const period = parseInt(req.query.period) || 20;
    const futureCandleCount = parseInt(req.query.lookAhead) || 3; // Default to 3 candles (15 min)
    const minConfidence = parseInt(req.query.minConfidence) || 0; // Minimum confidence filter

    // Validate symbol and timeframe
    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Valid symbol parameter is required",
      });
    }

    if (!["1m", "5m", "15m", "30m", "1h", "3m", "2m"].includes(timeframe)) {
      return res.status(400).json({
        status: "error",
        message: "Timeframe must be one of: 1m, 5m, 15m, 30m, 1h, 3m, 2m",
      });
    }

    if (period < 10 || period > 100) {
      return res.status(400).json({
        status: "error",
        message: "Period must be between 10 and 100",
      });
    }

    if (futureCandleCount < 1 || futureCandleCount > 12) {
      return res.status(400).json({
        status: "error",
        message: "Look ahead period must be between 1 and 12 candles",
      });
    }

    // Fetch historical data for backtesting (increase days to get enough data)
    const historicalData = await fetchMarketData(symbol, timeframe, 20); // 20 days should be enough

    // Validate data availability
    if (historicalData.length < 100) {
      return res.status(503).json({
        status: "error",
        message: "Insufficient historical data for backtesting",
      });
    }

    const results = [];
    let wins = 0;
    let losses = 0;

    // Sliding window approach for more accurate backtesting
    for (let i = period; i < historicalData.length - futureCandleCount; i++) {
      // Use a sliding window of data
      const window = historicalData.slice(i - period, i);
      const indicators = calculateIndicators(window);
      const signal = generateSignal(window, indicators);
      const riskParams = calculateRiskParameters(window, indicators, signal);

      if (signal.signal !== "HOLD" && signal.confidence >= minConfidence) {
        // Get future data to determine outcome
        const futureCandles = historicalData.slice(
          i,
          i + futureCandleCount + 1
        );
        let outcome = "unknown";
        let exitPrice = null;
        let exitTime = null;
        let profitPips = null;

        if (futureCandles.length > 0) {
          // Check for stop loss or take profit hits
          if (signal.signal === "BUY") {
            // Check for TP hit
            const tpHit = futureCandles.find(
              (candle) => candle.high >= riskParams.takeProfit
            );
            // Check for SL hit
            const slHit = futureCandles.find(
              (candle) => candle.low <= riskParams.stopLoss
            );

            if (tpHit && (!slHit || tpHit.timestamp < slHit.timestamp)) {
              outcome = "win";
              exitPrice = riskParams.takeProfit;
              exitTime = tpHit.timestamp;
              profitPips = (riskParams.takeProfit - signal.price) * 100;
            } else if (slHit) {
              outcome = "loss";
              exitPrice = riskParams.stopLoss;
              exitTime = slHit.timestamp;
              profitPips = (riskParams.stopLoss - signal.price) * 100;
            } else {
              // If neither SL nor TP hit, check final candle
              const finalCandle = futureCandles[futureCandles.length - 1];
              outcome = finalCandle.close > signal.price ? "win" : "loss";
              exitPrice = finalCandle.close;
              exitTime = finalCandle.timestamp;
              profitPips = (finalCandle.close - signal.price) * 100;
            }
          } else {
            // SELL signal
            // Check for TP hit
            const tpHit = futureCandles.find(
              (candle) => candle.low <= riskParams.takeProfit
            );
            // Check for SL hit
            const slHit = futureCandles.find(
              (candle) => candle.high >= riskParams.stopLoss
            );

            if (tpHit && (!slHit || tpHit.timestamp < slHit.timestamp)) {
              outcome = "win";
              exitPrice = riskParams.takeProfit;
              exitTime = tpHit.timestamp;
              profitPips = (signal.price - riskParams.takeProfit) * 100;
            } else if (slHit) {
              outcome = "loss";
              exitPrice = riskParams.stopLoss;
              exitTime = slHit.timestamp;
              profitPips = (signal.price - riskParams.stopLoss) * 100;
            } else {
              // If neither SL nor TP hit, check final candle
              const finalCandle = futureCandles[futureCandles.length - 1];
              outcome = finalCandle.close < signal.price ? "win" : "loss";
              exitPrice = finalCandle.close;
              exitTime = finalCandle.timestamp;
              profitPips = (signal.price - finalCandle.close) * 100;
            }
          }

          if (outcome === "win") wins++;
          if (outcome === "loss") losses++;
        }

        results.push({
          timestamp: moment(signal.timestamp).format("YYYY-MM-DD HH:mm"),
          signal: signal.signal,
          entryPrice: signal.price,
          stopLoss: riskParams.stopLoss,
          takeProfit: riskParams.takeProfit,
          exitPrice,
          exitTime: exitTime
            ? moment(exitTime).format("YYYY-MM-DD HH:mm")
            : null,
          outcome,
          profitPips: profitPips ? profitPips.toFixed(1) : null,
          confidence: signal.confidence,
          conditionsMet: signal.conditionsMet,
        });
      }
    }

    const winRate = results.length > 0 ? (wins / results.length) * 100 : 0;
    const profitFactor =
      losses > 0
        ? results
            .filter((r) => r.outcome === "win")
            .reduce((sum, r) => sum + parseFloat(r.profitPips || 0), 0) /
          Math.abs(
            results
              .filter((r) => r.outcome === "loss")
              .reduce((sum, r) => sum + parseFloat(r.profitPips || 0), 0)
          )
        : 0;

    // Calculate metrics for different confidence levels
    const confidenceLevels = [
      { min: 0, max: 100 },
      { min: 50, max: 100 },
      { min: 60, max: 100 },
      { min: 70, max: 100 },
      { min: 80, max: 100 },
    ];

    const confidenceMetrics = confidenceLevels.map((level) => {
      const levelResults = results.filter(
        (r) => r.confidence >= level.min && r.confidence <= level.max
      );
      const levelWins = levelResults.filter((r) => r.outcome === "win").length;

      return {
        confidenceRange: `${level.min}%+`,
        trades: levelResults.length,
        winRate:
          levelResults.length > 0
            ? ((levelWins / levelResults.length) * 100).toFixed(2) + "%"
            : "N/A",
        avgProfitPips:
          levelResults.length > 0
            ? (
                levelResults.reduce(
                  (sum, r) => sum + parseFloat(r.profitPips || 0),
                  0
                ) / levelResults.length
              ).toFixed(1)
            : "N/A",
      };
    });

    res.json({
      symbol,
      timeframe,
      totalTrades: results.length,
      winRate: `${winRate.toFixed(2)}%`,
      profitFactor: profitFactor.toFixed(2),
      totalWins: wins,
      totalLosses: losses,
      averageConfidence:
        results.length > 0
          ? (
              results.reduce((a, b) => a + b.confidence, 0) / results.length
            ).toFixed(2)
          : 0,
      confidenceMetrics,
      recentResults: results.slice(-12),
    });
  } catch (error) {
    console.error("Backtest error:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Backtesting failed",
    });
  }
});

// 8. Enhanced Status endpoint - fetches data on demand
app.get("/status", async (req, res) => {
  try {
    // Get parameters from query with defaults
    const symbol = req.query.symbol || "audusd";
    const timeframe = req.query.timeframe || "5m";

    // Validate parameters
    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Valid symbol parameter is required",
      });
    }

    if (!["1m", "5m", "15m", "30m", "1h", "3m", "2m"].includes(timeframe)) {
      return res.status(400).json({
        status: "error",
        message: "Timeframe must be one of: 1m, 5m, 15m, 30m, 1h, 3m, 2m",
      });
    }

    // Fetch latest data
    const historicalData = await fetchMarketData(symbol, timeframe, 1);
    const lastCandle = historicalData.length
      ? historicalData[historicalData.length - 1]
      : null;

    // Calculate basic statistics
    const signalCount = {
      buy: 0,
      sell: 0,
      hold: 0,
    };

    // Count signals in recent data (limit to 50 candles for performance)
    if (historicalData.length >= 50) {
      const recentData = historicalData.slice(-100);

      for (let i = 50; i < recentData.length; i++) {
        const window = recentData.slice(i - 50, i);
        try {
          const indicators = calculateIndicators(window);
          const signal = generateSignal(window, indicators);

          if (signal.signal === "BUY") signalCount.buy++;
          else if (signal.signal === "SELL") signalCount.sell++;
          else signalCount.hold++;
        } catch (error) {
          console.error("Error calculating recent signals:", error);
        }
      }
    }

    res.json({
      status: "online",
      symbol: symbol,
      timeframe: timeframe,
      dataPoints: historicalData.length,
      lastCandleTime: lastCandle
        ? moment(lastCandle.timestamp).format()
        : "never",
      lastPrice: lastCandle ? lastCandle.close : null,
      recentSignalStats: {
        buySignals: signalCount.buy,
        sellSignals: signalCount.sell,
        holdSignals: signalCount.hold,
        totalScanned: signalCount.buy + signalCount.sell + signalCount.hold,
      },
      serverTime: moment().format(),
    });
  } catch (error) {
    console.error("Backtest error:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Backtesting failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running :${PORT}`);
});
