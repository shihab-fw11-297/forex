const express = require("express");
const axios = require("axios");
const moment = require("moment");
const TI = require("technicalindicators");

const app = express();
const PORT = 3000;

// Configuration with Multiple Timeframes
const CONFIG = {
  FINAGE_API_KEY: "API_KEY25MSCN60UREJFFDJIDQV630EGBQ8CNHA",
  BASE_URL: "https://api.finage.co.uk",
  DEFAULT_SYMBOL: "EURUSD",

  // Multi-Timeframe Configuration test
  TIMEFRAMES: {
    HIGHER: { interval: "hour", multiplier: 1, name: "1H", priority: "TREND" },
    MEDIUM: {
      interval: "minute",
      multiplier: 15,
      name: "15M",
      priority: "STRUCTURE",
    },
    LOWER: { interval: "minute", multiplier: 5, name: "5M", priority: "ENTRY" },
    SCALP: {
      interval: "minute",
      multiplier: 2,
      name: "2M",
      priority: "EXECUTION",
    },
  },

  // Technical Analysis Parameters
  ATR_PERIOD: 14,
  RSI_PERIOD: 14,
  MACD_FAST: 12,
  MACD_SLOW: 26,
  MACD_SIGNAL: 9,
  EMA_FAST: 20,
  EMA_SLOW: 50,
  EMA_TREND: 200,
  BB_PERIOD: 20,
  BB_STDDEV: 2,
  ADX_PERIOD: 14,
  STOCH_K_PERIOD: 14,
  STOCH_D_PERIOD: 3,
  CCI_PERIOD: 20,
  WILLIAMS_R_PERIOD: 14,

  // Multi-Timeframe Weights
  TIMEFRAME_WEIGHTS: {
    HIGHER: 0.4, // 40% weight for trend
    MEDIUM: 0.3, // 30% weight for structure
    LOWER: 0.2, // 20% weight for entry
    SCALP: 0.1, // 10% weight for execution timing
  },
};

// Enhanced Technical Analysis using technicalindicators package
class EnhancedTechnicalAnalysis {
  static prepareCandleData(data) {
    return {
      open: data.map((d) => d.o),
      high: data.map((d) => d.h),
      low: data.map((d) => d.l),
      close: data.map((d) => d.c),
      volume: data.map((d) => d.v || 1000), // Use volume if available, otherwise default
    };
  }

  static calculateAllIndicators(data) {
    const candleData = this.prepareCandleData(data);
    const { open, high, low, close, volume } = candleData;

    if (close.length < CONFIG.EMA_TREND) {
      return null;
    }

    try {
      return {
        // Moving Averages
        sma20: TI.SMA.calculate({ period: 20, values: close }),
        sma50: TI.SMA.calculate({ period: 50, values: close }),
        ema20: TI.EMA.calculate({ period: CONFIG.EMA_FAST, values: close }),
        ema50: TI.EMA.calculate({ period: CONFIG.EMA_SLOW, values: close }),
        ema200: TI.EMA.calculate({ period: CONFIG.EMA_TREND, values: close }),

        // Oscillators
        rsi: TI.RSI.calculate({ period: CONFIG.RSI_PERIOD, values: close }),
        macd: TI.MACD.calculate({
          fastPeriod: CONFIG.MACD_FAST,
          slowPeriod: CONFIG.MACD_SLOW,
          signalPeriod: CONFIG.MACD_SIGNAL,
          values: close,
        }),
        stoch: TI.Stochastic.calculate({
          high: high,
          low: low,
          close: close,
          period: CONFIG.STOCH_K_PERIOD,
          signalPeriod: CONFIG.STOCH_D_PERIOD,
        }),
        williamsR: TI.WilliamsR.calculate({
          high: high,
          low: low,
          close: close,
          period: CONFIG.WILLIAMS_R_PERIOD,
        }),

        // Volatility Indicators
        atr: TI.ATR.calculate({
          high: high,
          low: low,
          close: close,
          period: CONFIG.ATR_PERIOD,
        }),
        bollingerBands: TI.BollingerBands.calculate({
          period: CONFIG.BB_PERIOD,
          values: close,
          stdDev: CONFIG.BB_STDDEV,
        }),

        // Trend Indicators
        adx: TI.ADX.calculate({
          high: high,
          low: low,
          close: close,
          period: CONFIG.ADX_PERIOD,
        }),
        cci: TI.CCI.calculate({
          high: high,
          low: low,
          close: close,
          period: CONFIG.CCI_PERIOD,
        }),

        // Volume Indicators
        obv: TI.OBV.calculate({
          close: close,
          volume: volume,
        }),
        mfi: TI.MFI.calculate({
          high: high,
          low: low,
          close: close,
          volume: volume,
          period: 14,
        }),

        // Momentum Indicators
        roc: TI.ROC.calculate({
          values: close,
          period: 12,
        }),
        ao: TI.AwesomeOscillator.calculate({
          high: high,
          low: low,
          fastPeriod: 5,
          slowPeriod: 34,
        }),
      };
    } catch (error) {
      console.error("Error calculating indicators:", error.message);
      return null;
    }
  }

  static analyzeCandlestickPatterns(data) {
    if (data.length < 5)
      return { patterns: [], signal: "NEUTRAL", strength: 0 };

    const candleData = this.prepareCandleData(data);
    const { open, high, low, close } = candleData;

    const patterns = [];
    let bullishCount = 0;
    let bearishCount = 0;

    try {
      // Major Reversal Patterns
      const doji = TI.doji({ open, high, low, close });
      const hammer = TI.bullishhammer({ open, high, low, close });
      const shootingStar = TI.shootingstar({ open, high, low, close });
      const engulfingBull = TI.bullishengulfingpattern({
        open,
        high,
        low,
        close,
      });
      const engulfingBear = TI.bearishengulfingpattern({
        open,
        high,
        low,
        close,
      });
      const harami = TI.bullishharami({ open, high, low, close });
      const bearishHarami = TI.bearishharami({ open, high, low, close });
      const morningStar = TI.morningstar({ open, high, low, close });
      const eveningStar = TI.eveningstar({ open, high, low, close });
      const hangingMan = TI.hangingman({ open, high, low, close });
      const darkCloudCover = TI.darkcloudcover({ open, high, low, close });
      const piercingLine = TI.piercingline({ open, high, low, close });

      // Check recent patterns (last few candles)
      const checkRecent = (pattern, name, type) => {
        if (pattern && pattern.length > 0) {
          const recent = pattern.slice(-3); // Check last 3 signals
          if (recent.some((val) => val === true)) {
            patterns.push({ name, type, strength: 0.7 });
            if (type === "BULLISH") bullishCount++;
            else bearishCount++;
          }
        }
      };

      // Analyze patterns
      checkRecent(doji, "Doji", "NEUTRAL");
      checkRecent(hammer, "Bullish Hammer", "BULLISH");
      checkRecent(shootingStar, "Shooting Star", "BEARISH");
      checkRecent(engulfingBull, "Bullish Engulfing", "BULLISH");
      checkRecent(engulfingBear, "Bearish Engulfing", "BEARISH");
      checkRecent(harami, "Bullish Harami", "BULLISH");
      checkRecent(bearishHarami, "Bearish Harami", "BEARISH");
      checkRecent(morningStar, "Morning Star", "BULLISH");
      checkRecent(eveningStar, "Evening Star", "BEARISH");
      checkRecent(hangingMan, "Hanging Man", "BEARISH");
      checkRecent(darkCloudCover, "Dark Cloud Cover", "BEARISH");
      checkRecent(piercingLine, "Piercing Line", "BULLISH");
    } catch (error) {
      console.log(
        "Some candlestick patterns failed to calculate:",
        error.message
      );
    }

    // Determine overall signal
    let signal = "NEUTRAL";
    let strength = 0;

    if (bullishCount > bearishCount && bullishCount > 0) {
      signal = "BULLISH";
      strength = Math.min(1, bullishCount / 3);
    } else if (bearishCount > bullishCount && bearishCount > 0) {
      signal = "BEARISH";
      strength = Math.min(1, bearishCount / 3);
    }

    return { patterns, signal, strength };
  }

  static generateTechnicalScore(indicators, patterns) {
    if (!indicators) return 0;

    let score = 0;
    let weight = 0;

    // RSI Analysis (Oversold/Overbought)
    const currentRSI = indicators.rsi[indicators.rsi.length - 1];
    if (currentRSI < 30) {
      score += 20; // Oversold - bullish
    } else if (currentRSI > 70) {
      score -= 20; // Overbought - bearish
    }
    weight += 20;

    // MACD Analysis
    const currentMACD = indicators.macd[indicators.macd.length - 1];
    if (currentMACD && currentMACD.MACD > currentMACD.signal) {
      score += 15; // MACD above signal - bullish
    } else if (currentMACD && currentMACD.MACD < currentMACD.signal) {
      score -= 15; // MACD below signal - bearish
    }
    weight += 15;

    // ADX Trend Strength
    const currentADX = indicators.adx[indicators.adx.length - 1];
    if (currentADX && currentADX.adx > 25) {
      // Strong trend - amplify other signals
      score *= 1.2;
    }

    // Bollinger Bands Position
    const currentBB =
      indicators.bollingerBands[indicators.bollingerBands.length - 1];
    const currentPrice = indicators.ema20[indicators.ema20.length - 1]; // Use latest price proxy
    if (currentBB) {
      if (currentPrice < currentBB.lower) {
        score += 10; // Below lower band - potential bullish
      } else if (currentPrice > currentBB.upper) {
        score -= 10; // Above upper band - potential bearish
      }
    }
    weight += 10;

    // EMA Alignment
    const ema20 = indicators.ema20[indicators.ema20.length - 1];
    const ema50 = indicators.ema50[indicators.ema50.length - 1];
    const ema200 = indicators.ema200[indicators.ema200.length - 1];

    if (ema20 > ema50 && ema50 > ema200) {
      score += 25; // Bullish alignment
    } else if (ema20 < ema50 && ema50 < ema200) {
      score -= 25; // Bearish alignment
    }
    weight += 25;

    // Candlestick Pattern Weight
    if (patterns.signal === "BULLISH") {
      score += 15 * patterns.strength;
    } else if (patterns.signal === "BEARISH") {
      score -= 15 * patterns.strength;
    }
    weight += 15;

    // Normalize score to -100 to +100 range
    return weight > 0
      ? Math.max(-100, Math.min(100, (score / weight) * 100))
      : 0;
  }
}

// Enhanced Multi-Timeframe Analysis
class MultiTimeframeAnalysis {
  static identifyTrend(indicators, patterns, timeframeName) {
    if (!indicators) return { trend: "SIDEWAYS", strength: 0 };

    let trendScore = 0;
    let signals = 0;

    // EMA Trend Analysis
    const ema20 = indicators.ema20[indicators.ema20.length - 1];
    const ema50 = indicators.ema50[indicators.ema50.length - 1];
    const ema200 = indicators.ema200[indicators.ema200.length - 1];

    if (ema20 > ema50 && ema50 > ema200) {
      trendScore += 3;
    } else if (ema20 < ema50 && ema50 < ema200) {
      trendScore -= 3;
    }
    signals += 3;

    // ADX Trend Strength
    const currentADX = indicators.adx[indicators.adx.length - 1];
    if (currentADX && currentADX.adx > 25) {
      // Strong trend exists, determine direction from other indicators
      if (currentADX.pdi > currentADX.mdi) {
        trendScore += 2;
      } else {
        trendScore -= 2;
      }
      signals += 2;
    }

    // MACD Trend
    const macdCurrent = indicators.macd[indicators.macd.length - 1];
    if (macdCurrent) {
      if (macdCurrent.MACD > macdCurrent.signal && macdCurrent.MACD > 0) {
        trendScore += 2;
      } else if (
        macdCurrent.MACD < macdCurrent.signal &&
        macdCurrent.MACD < 0
      ) {
        trendScore -= 2;
      }
      signals += 2;
    }

    // Determine trend
    let trend = "SIDEWAYS";
    let strength = 0;

    if (signals > 0) {
      const trendRatio = trendScore / signals;
      strength = Math.abs(trendRatio) * 100;

      if (trendRatio > 0.3) {
        trend = "UPTREND";
      } else if (trendRatio < -0.3) {
        trend = "DOWNTREND";
      }
    }

    return { trend, strength };
  }

  static analyzeTimeframeAlignment(timeframeData) {
    const alignment = {
      bullishCount: 0,
      bearishCount: 0,
      totalWeight: 0,
      weightedScore: 0,
      confluence: "NONE",
    };

    Object.keys(timeframeData).forEach((tf) => {
      const data = timeframeData[tf];
      if (data.analysis && data.analysis.trend) {
        const weight = CONFIG.TIMEFRAME_WEIGHTS[tf.toUpperCase()] || 0.1;
        alignment.totalWeight += weight;

        if (data.analysis.trend === "UPTREND") {
          alignment.bullishCount++;
          alignment.weightedScore += weight * data.analysis.strength;
        } else if (data.analysis.trend === "DOWNTREND") {
          alignment.bearishCount++;
          alignment.weightedScore -= weight * data.analysis.strength;
        }
      }
    });

    // Determine confluence
    const totalTimeframes = Object.keys(timeframeData).length;
    if (alignment.bullishCount >= totalTimeframes * 0.75) {
      alignment.confluence = "STRONG_BULLISH";
    } else if (alignment.bearishCount >= totalTimeframes * 0.75) {
      alignment.confluence = "STRONG_BEARISH";
    } else if (alignment.bullishCount > alignment.bearishCount) {
      alignment.confluence = "WEAK_BULLISH";
    } else if (alignment.bearishCount > alignment.bullishCount) {
      alignment.confluence = "WEAK_BEARISH";
    }

    return alignment;
  }

  static findBestEntryTimeframe(timeframeData, mainDirection) {
    let bestTimeframe = "SCALP";
    let bestScore = 0;

    Object.keys(timeframeData).forEach((tf) => {
      const data = timeframeData[tf];
      if (data.analysis && data.technicalScore !== undefined) {
        let score = Math.abs(data.technicalScore);

        // Favor alignment with main direction
        if (
          (mainDirection === "LONG" && data.technicalScore > 0) ||
          (mainDirection === "SHORT" && data.technicalScore < 0)
        ) {
          score += 25;
        }

        // Add bonus for strong patterns
        if (
          data.candlestickAnalysis &&
          data.candlestickAnalysis.strength > 0.5
        ) {
          score += 20;
        }

        if (score > bestScore) {
          bestScore = score;
          bestTimeframe = tf;
        }
      }
    });

    return { timeframe: bestTimeframe, score: bestScore };
  }
}

// Data Fetcher (keeping original implementation)
class DataFetcher {
  static async fetchTimeframeData(timeframe, symbol, days = 30) {
    try {
      const startDate = moment().subtract(days, "days").format("YYYY-MM-DD");
      const endDate = moment().format("YYYY-MM-DD");

      let url;
      if (timeframe.interval === "minute") {
        url = `${CONFIG.BASE_URL}/agg/forex/${symbol}/${timeframe.multiplier}/${timeframe.interval}/${startDate}/${endDate}`;
      } else {
        url = `${CONFIG.BASE_URL}/agg/forex/${symbol}/${timeframe.multiplier}/${timeframe.interval}/${startDate}/${endDate}`;
      }

      const response = await axios.get(url, {
        params: {
          apikey: CONFIG.FINAGE_API_KEY,
          limit: 10000,
        },
      });

      return response.data.results || [];
    } catch (error) {
      console.error(
        `Error fetching ${timeframe.name} data for ${symbol}:`,
        error.message
      );
      throw error;
    }
  }

  static async fetchAllTimeframes(symbol) {
    const timeframeData = {};

    for (const [key, timeframe] of Object.entries(CONFIG.TIMEFRAMES)) {
      try {
        const data = await this.fetchTimeframeData(timeframe, symbol);
        timeframeData[key.toLowerCase()] = {
          data,
          timeframe: timeframe.name,
          priority: timeframe.priority,
        };
      } catch (error) {
        console.error(
          `❌ Failed to fetch ${timeframe.name} data for ${symbol}:`,
          error.message
        );
        // Continue with other timeframes
      }
    }

    return timeframeData;
  }
}

// Session Analysis (keeping original)
class SessionAnalysis {
  static getCurrentSession() {
    const now = moment.utc();
    const hour = now.hour();

    if (hour >= 8 && hour < 9) {
      return {
        session: "LONDON_OPEN",
        priority: "HIGH",
        description: "London First Hour",
        volatility: "HIGH",
      };
    } else if (hour >= 14 && hour < 15) {
      return {
        session: "NY_SECOND_HOUR",
        priority: "HIGH",
        description: "New York Second Hour",
        volatility: "HIGH",
      };
    } else if (hour >= 13 && hour < 16) {
      return {
        session: "OVERLAP",
        priority: "MEDIUM",
        description: "London-NY Overlap",
        volatility: "MEDIUM",
      };
    } else if (hour >= 8 && hour < 16) {
      return {
        session: "LONDON",
        priority: "MEDIUM",
        description: "London Session",
        volatility: "MEDIUM",
      };
    } else if (hour >= 13 && hour < 21) {
      return {
        session: "NEW_YORK",
        priority: "MEDIUM",
        description: "New York Session",
        volatility: "MEDIUM",
      };
    } else {
      return {
        session: "ASIAN",
        priority: "LOW",
        description: "Asian Session",
        volatility: "LOW",
      };
    }
  }
}

// Enhanced Gold Scalping System
class EnhancedGoldScalpingSystem {
  constructor(symbol) {
    this.symbol = symbol || CONFIG.DEFAULT_SYMBOL;
    this.timeframeData = {};
    this.analysis = {};
  }

  async fetchAllData() {
    this.timeframeData = await DataFetcher.fetchAllTimeframes(this.symbol);
    return this.timeframeData;
  }

  analyzeTimeframe(timeframeKey) {
    const timeframeInfo = this.timeframeData[timeframeKey];
    if (
      !timeframeInfo ||
      !timeframeInfo.data ||
      timeframeInfo.data.length === 0
    ) {
      return null;
    }

    const data = timeframeInfo.data;

    // Calculate all technical indicators
    const indicators = EnhancedTechnicalAnalysis.calculateAllIndicators(data);
    if (!indicators) return null;

    // Analyze candlestick patterns
    const candlestickAnalysis =
      EnhancedTechnicalAnalysis.analyzeCandlestickPatterns(data);

    // Generate technical score
    const technicalScore = EnhancedTechnicalAnalysis.generateTechnicalScore(
      indicators,
      candlestickAnalysis
    );

    // Trend Analysis
    const trendAnalysis = MultiTimeframeAnalysis.identifyTrend(
      indicators,
      candlestickAnalysis,
      timeframeInfo.timeframe
    );

    // Current market data
    const currentPrice = data[data.length - 1].c;
    const currentATR = indicators.atr[indicators.atr.length - 1];
    const currentRSI = indicators.rsi[indicators.rsi.length - 1];

    // Current indicator values
    const currentMACD = indicators.macd[indicators.macd.length - 1];
    const currentBB =
      indicators.bollingerBands[indicators.bollingerBands.length - 1];
    const currentADX = indicators.adx[indicators.adx.length - 1];
    const currentStoch = indicators.stoch[indicators.stoch.length - 1];

    return {
      timeframe: timeframeInfo.timeframe,
      priority: timeframeInfo.priority,
      analysis: trendAnalysis,
      technicalScore,
      indicators: {
        rsi: currentRSI,
        atr: currentATR,
        macd: currentMACD,
        bollingerBands: currentBB,
        adx: currentADX,
        stochastic: currentStoch,
        currentPrice,
        ema20: indicators.ema20[indicators.ema20.length - 1],
        ema50: indicators.ema50[indicators.ema50.length - 1],
        ema200: indicators.ema200[indicators.ema200.length - 1],
      },
      candlestickAnalysis,
      timestamp: moment().toISOString(),
    };
  }

  performMultiTimeframeAnalysis() {
    const mtfAnalysis = {};

    // Analyze each timeframe
    Object.keys(this.timeframeData).forEach((tf) => {
      const analysis = this.analyzeTimeframe(tf);
      if (analysis) {
        mtfAnalysis[tf] = analysis;
      }
    });

    // Calculate timeframe alignment
    const alignment =
      MultiTimeframeAnalysis.analyzeTimeframeAlignment(mtfAnalysis);

    // Determine main direction from higher timeframes
    let mainDirection = "NO_TRADE";
    if (mtfAnalysis.higher && mtfAnalysis.medium) {
      const higherScore = mtfAnalysis.higher.technicalScore || 0;
      const mediumScore = mtfAnalysis.medium.technicalScore || 0;

      if (higherScore > 30 && mediumScore > 20) {
        mainDirection = "LONG";
      } else if (higherScore < -30 && mediumScore < -20) {
        mainDirection = "SHORT";
      }
    }

    // Find best entry timeframe
    const bestEntry = MultiTimeframeAnalysis.findBestEntryTimeframe(
      mtfAnalysis,
      mainDirection
    );

    return {
      individual: mtfAnalysis,
      alignment,
      mainDirection,
      bestEntry,
      confluence: alignment.confluence,
    };
  }

  generateEnhancedSignal() {
    const mtfAnalysis = this.performMultiTimeframeAnalysis();
    const sessionInfo = SessionAnalysis.getCurrentSession();

    // Get primary timeframe data for risk calculations
    const primaryData =
      this.timeframeData.lower?.data || this.timeframeData.scalp?.data;
    if (!primaryData || primaryData.length === 0) {
      throw new Error("No primary timeframe data available");
    }

    const currentPrice = primaryData[primaryData.length - 1].c;
    const atr =
      mtfAnalysis.individual.lower?.indicators.atr ||
      mtfAnalysis.individual.scalp?.indicators.atr ||
      20;

    // Calculate composite technical score
    let compositeScore = 0;
    let totalWeight = 0;

    Object.keys(mtfAnalysis.individual).forEach((tf) => {
      const weight = CONFIG.TIMEFRAME_WEIGHTS[tf.toUpperCase()] || 0.1;
      const score = mtfAnalysis.individual[tf].technicalScore || 0;
      compositeScore += score * weight;
      totalWeight += weight;
    });

    compositeScore = totalWeight > 0 ? compositeScore / totalWeight : 0;

    // Determine final direction and confidence
    let finalDirection = "NO_TRADE";
    let confidence = "LOW";

    if (compositeScore > 40) {
      finalDirection = "LONG";
      confidence = compositeScore > 60 ? "HIGH" : "MEDIUM";
    } else if (compositeScore < -40) {
      finalDirection = "SHORT";
      confidence = compositeScore < -60 ? "HIGH" : "MEDIUM";
    }

    // Session filter
    if (sessionInfo.priority === "LOW") {
      confidence = confidence === "HIGH" ? "MEDIUM" : "LOW";
    }

    // Risk management based on ATR and volatility
    const volatilityMultiplier =
      sessionInfo.volatility === "HIGH"
        ? 1.5
        : sessionInfo.volatility === "MEDIUM"
        ? 1.2
        : 1.0;

    const stopLoss = atr * 1.5 * volatilityMultiplier;
    const takeProfit = atr * 3.0 * volatilityMultiplier;
    const riskRewardRatio = takeProfit / stopLoss;

    // Entry refinement
    const entryTimeframe = mtfAnalysis.bestEntry.timeframe;
    const entryAnalysis = mtfAnalysis.individual[entryTimeframe.toLowerCase()];

    return {
      finalDirection,
      confidence,
      compositeScore: Math.round(compositeScore),
      currentPrice,
      stopLoss: Math.round(stopLoss * 100) / 100,
      takeProfit: Math.round(takeProfit * 100) / 100,
      riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,

      // Multi-timeframe specific data
      multiTimeframeAnalysis: mtfAnalysis,
      entryTimeframe,
      entryAnalysis,
      sessionInfo,

      // Enhanced summary with technical indicators
      summary: {
        trend: mtfAnalysis.mainDirection,
        confluence: mtfAnalysis.confluence,
        session: sessionInfo.session,
        volatility: sessionInfo.volatility,
        bestEntryTF: entryTimeframe,
        compositeScore: Math.round(compositeScore),
        keyIndicators: this.getKeyIndicatorSummary(mtfAnalysis.individual),
      },

      timestamp: moment().toISOString(),
    };
  }

  getKeyIndicatorSummary(individualAnalysis) {
    const summary = {};

    // Get key indicators from primary timeframes
    ["medium", "lower"].forEach((tf) => {
      if (individualAnalysis[tf] && individualAnalysis[tf].indicators) {
        const ind = individualAnalysis[tf].indicators;
        summary[tf] = {
          rsi: Math.round(ind.rsi),
          macdSignal: ind.macd
            ? ind.macd.MACD > ind.macd.signal
              ? "BULL"
              : "BEAR"
            : "N/A",
          adxStrength: ind.adx ? Math.round(ind.adx.adx) : "N/A",
          bbPosition: this.getBBPosition(ind.currentPrice, ind.bollingerBands),
        };
      }
    });

    return summary;
  }

  getBBPosition(price, bb) {
    if (!bb) return "N/A";

    if (price > bb.upper) return "ABOVE_UPPER";
    if (price < bb.lower) return "BELOW_LOWER";
    if (price > bb.middle) return "ABOVE_MIDDLE";
    return "BELOW_MIDDLE";
  }

  async analyze() {
    try {
      await this.fetchAllData();
      const signal = this.generateEnhancedSignal();
      return signal;
    } catch (error) {
      console.error("❌ Analysis error:", error.message);
      throw error;
    }
  }
}

// Express Routes
app.use(express.json());

app.get("/api/mtf-scalping-signal", async (req, res) => {
  try {
    // Get symbol from query parameters, default to EURUSD if not provided
    const symbol = req.query.symbol || CONFIG.DEFAULT_SYMBOL;

    // Validate symbol format (basic validation)
    if (!symbol || typeof symbol !== "string" || symbol.length < 3) {
      return res.status(400).json({
        success: false,
        error: "Invalid symbol parameter",
        message:
          "Please provide a valid trading symbol (e.g., EURUSD, GBPUSD, XAUUSD)",
      });
    }

    const tradingSystem = new EnhancedGoldScalpingSystem(symbol.toUpperCase());
    const signal = await tradingSystem.analyze();

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      // signal,
      analysis: {
        direction: signal.finalDirection,
        confidence: signal.confidence,
        score: signal.compositeScore,
        currentPrice: signal.currentPrice,
        session: signal.sessionInfo,
        multiTimeframe: signal.multiTimeframeAnalysis,
        riskManagement: {
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          riskRewardRatio: signal.riskRewardRatio,
        },
        recommendation: {
          action: signal.finalDirection,
          entry: signal.currentPrice,
          stop:
            signal.finalDirection === "LONG"
              ? signal.currentPrice - signal.stopLoss
              : signal.currentPrice + signal.stopLoss,
          target:
            signal.finalDirection === "LONG"
              ? signal.currentPrice + signal.takeProfit
              : signal.currentPrice - signal.takeProfit,
        },
      },
      message: "Multi-timeframe scalping analysis completed successfully",
    });
  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Failed to generate multi-timeframe signal",
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Gold Scalping Trading System running on port ${PORT}`);
});

module.exports = app;
