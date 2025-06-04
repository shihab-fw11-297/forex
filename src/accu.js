const express = require("express");
const axios = require("axios");
const moment = require("moment");
const TI = require("technicalindicators");

const app = express();
const PORT = 3100;

// Enhanced Configuration with currency-specific settings
const CONFIG = {
  FINAGE_API_KEY: "API_KEYeeVHLBVRLK4R8RVY8NHZ48S5RQZE8ZTD",
  BASE_URL: "https://api.finage.co.uk",
  DEFAULT_SYMBOL: "EURUSD",

  TIMEFRAMES: {
    HIGHER: { interval: "hour", multiplier: 1, name: "1H", priority: "TREND" },
    MEDIUM: { interval: "minute", multiplier: 15, name: "15M", priority: "STRUCTURE" },
    LOWER: { interval: "minute", multiplier: 5, name: "5M", priority: "ENTRY" },
    SCALP: { interval: "minute", multiplier: 1, name: "1M", priority: "EXECUTION" },
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
  VOLUME_LOOKBACK: 10,

  TIMEFRAME_WEIGHTS: {
    HIGHER: 0.4,
    MEDIUM: 0.3,
    LOWER: 0.2,
    SCALP: 0.1,
  },
  
  // Pattern Recognition Thresholds
  VOLUME_SPIKE_THRESHOLD: 1.8,
  BB_SQUEEZE_THRESHOLD: 0.008,
  DIVERGENCE_LOOKBACK: 5,
  MIN_CONFIDENCE: 65,
  MAX_TRADE_DURATION: 4, // minutes
  
  // Currency-specific settings
  CURRENCY_SETTINGS: {
    JPY: { 
      reversalThreshold: 0.7, 
      volatilityMultiplier: 1.4,
      rsiThreshold: 75 
    },
    EMERGING: { 
      reversalThreshold: 0.6, 
      volatilityMultiplier: 1.8,
      rsiThreshold: 80 
    },
    DEFAULT: { 
      reversalThreshold: 0.4, 
      volatilityMultiplier: 1.0,
      rsiThreshold: 70 
    }
  }
};

// Helper function to get currency settings
function getCurrencySettings(symbol) {
  if (symbol.includes("JPY")) return CONFIG.CURRENCY_SETTINGS.JPY;
  if (["MXN", "TRY", "ZAR", "BRL"].some(c => symbol.includes(c))) 
    return CONFIG.CURRENCY_SETTINGS.EMERGING;
  return CONFIG.CURRENCY_SETTINGS.DEFAULT;
}

class TechnicalAnalysis {
  static prepareCandleData(data) {
    return {
      open: data.map((d) => d.o),
      high: data.map((d) => d.h),
      low: data.map((d) => d.l),
      close: data.map((d) => d.c),
      volume: data.map((d) => d.v || 1000),
      timestamp: data.map((d) => d.t)
    };
  }

  // Detect 12 most reliable candlestick patterns
  static detectCandlestickPatterns(data) {
    if (data.length < 5) return [];
    
    const patterns = [];
    const lastCandle = data[data.length - 1];
    const prevCandle = data[data.length - 2];
    const secondPrev = data[data.length - 3];
    
    // Bullish Patterns
    if (TI.bullishhammerstick({ 
      open: [lastCandle.o], 
      high: [lastCandle.h], 
      low: [lastCandle.l], 
      close: [lastCandle.c] 
    })) patterns.push('BULLISH_HAMMER');
    
    if (TI.bullishengulfingpattern({
      open: [prevCandle.o, lastCandle.o],
      close: [prevCandle.c, lastCandle.c],
      high: [prevCandle.h, lastCandle.h],
      low: [prevCandle.l, lastCandle.l]
    })) patterns.push('BULLISH_ENGULFING');
    
    if (TI.morningstar({
      open: [secondPrev.o, prevCandle.o, lastCandle.o],
      close: [secondPrev.c, prevCandle.c, lastCandle.c],
      high: [secondPrev.h, prevCandle.h, lastCandle.h],
      low: [secondPrev.l, prevCandle.l, lastCandle.l]
    })) patterns.push('MORNING_STAR');
    
    // Bearish Patterns
    if (TI.bearishhammerstick({ 
      open: [lastCandle.o], 
      high: [lastCandle.h], 
      low: [lastCandle.l], 
      close: [lastCandle.c] 
    })) patterns.push('BEARISH_HAMMER');
    
    if (TI.bearishengulfingpattern({
      open: [prevCandle.o, lastCandle.o],
      close: [prevCandle.c, lastCandle.c],
      high: [prevCandle.h, lastCandle.h],
      low: [prevCandle.l, lastCandle.l]
    })) patterns.push('BEARISH_ENGULFING');
    
    if (TI.eveningstar({
      open: [secondPrev.o, prevCandle.o, lastCandle.o],
      close: [secondPrev.c, prevCandle.c, lastCandle.c],
      high: [secondPrev.h, prevCandle.h, lastCandle.h],
      low: [secondPrev.l, prevCandle.l, lastCandle.l]
    })) patterns.push('EVENING_STAR');
    
    // Price Action Patterns
    const last5 = data.slice(-5);
    let higherHighs = 0;
    let lowerLows = 0;
    
    for (let i = 1; i < last5.length; i++) {
      if (last5[i].h > last5[i-1].h) higherHighs++;
      if (last5[i].l < last5[i-1].l) lowerLows++;
    }
    
    if (higherHighs >= 3 && lowerLows >= 3) patterns.push('STRONG_UPTREND');
    if (higherHighs <= 1 && lowerLows <= 1) patterns.push('CONSOLIDATION');
    
    // Detect pin bars
    const upperTail = lastCandle.h - Math.max(lastCandle.o, lastCandle.c);
    const lowerTail = Math.min(lastCandle.o, lastCandle.c) - lastCandle.l;
    const body = Math.abs(lastCandle.o - lastCandle.c);
    
    if (upperTail > body * 2 && lowerTail < body * 0.5) {
      patterns.push('BEARISH_PINBAR');
    }
    if (lowerTail > body * 2 && upperTail < body * 0.5) {
      patterns.push('BULLISH_PINBAR');
    }
    
    return patterns;
  }

  static calculateAllIndicators(data) {
    const candleData = this.prepareCandleData(data);
    const { open, high, low, close, volume } = candleData;

    if (close.length < CONFIG.EMA_TREND) return null;

    try {
      const indicators = {
        ema20: TI.EMA.calculate({ period: CONFIG.EMA_FAST, values: close }),
        ema50: TI.EMA.calculate({ period: CONFIG.EMA_SLOW, values: close }),
        ema200: TI.EMA.calculate({ period: CONFIG.EMA_TREND, values: close }),
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
        adx: TI.ADX.calculate({
          high: high,
          low: low,
          close: close,
          period: CONFIG.ADX_PERIOD,
        }),
        volume: volume
      };

      // Volume spike detection
      const volumeLookback = Math.min(CONFIG.VOLUME_LOOKBACK, indicators.volume.length);
      const recentVolumes = indicators.volume.slice(-volumeLookback);
      const volumeAvg = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
      const currentVolume = indicators.volume[indicators.volume.length - 1];
      indicators.volumeSpike = currentVolume > volumeAvg * CONFIG.VOLUME_SPIKE_THRESHOLD;
      
      // Volume direction
      const currentPrice = close[close.length - 1];
      const prevPrice = close[close.length - 2];
      indicators.volumeDirection = currentPrice > prevPrice ? "BULLISH" : "BEARISH";

      return indicators;
    } catch (error) {
      console.error("Error calculating indicators:", error.message);
      return null;
    }
  }

  static generateTechnicalScore(indicators, data, mainDirection, currencySettings) {
    if (!indicators) return 0;

    let score = 0;
    let weight = 0;

    // RSI Analysis with currency-specific thresholds
    const currentRSI = indicators.rsi[indicators.rsi.length - 1];
    if (currentRSI < 30) {
      score += 20;
    } else if (currentRSI > currencySettings.rsiThreshold) {
      score -= 20;
    }
    weight += 20;

    // MACD Analysis
    const currentMACD = indicators.macd[indicators.macd.length - 1];
    if (currentMACD && currentMACD.MACD > currentMACD.signal) {
      score += 15;
    } else if (currentMACD && currentMACD.MACD < currentMACD.signal) {
      score -= 15;
    }
    weight += 15;

    // EMA Alignment
    const ema20 = indicators.ema20[indicators.ema20.length - 1];
    const ema50 = indicators.ema50[indicators.ema50.length - 1];
    const ema200 = indicators.ema200[indicators.ema200.length - 1];

    if (ema20 > ema50 && ema50 > ema200) {
      score += 25;
    } else if (ema20 < ema50 && ema50 < ema200) {
      score -= 25;
    }
    weight += 25;
    
    // Volume Analysis with direction confirmation
    if (indicators.volumeSpike) {
      if (mainDirection === "LONG" && indicators.volumeDirection === "BULLISH") {
        score += 20; // Bonus for aligned volume spike
      } else if (mainDirection === "SHORT" && indicators.volumeDirection === "BEARISH") {
        score -= 20;
      }
    }
    weight += 20;
    
    // Stochastic Confirmation
    const currentStoch = indicators.stoch[indicators.stoch.length - 1];
    if (currentStoch && currentStoch.k < 20 && currentStoch.d < 20) {
      score += 15;
    } else if (currentStoch && currentStoch.k > 80 && currentStoch.d > 80) {
      score -= 15;
    }
    weight += 15;
    
    // Candlestick Pattern Recognition
    const patterns = this.detectCandlestickPatterns(data);
    const bullishPatterns = ['BULLISH_HAMMER', 'BULLISH_ENGULFING', 'MORNING_STAR', 'BULLISH_PINBAR'];
    const bearishPatterns = ['BEARISH_HAMMER', 'BEARISH_ENGULFING', 'EVENING_STAR', 'BEARISH_PINBAR'];
    
    patterns.forEach(pattern => {
      if (bullishPatterns.includes(pattern)) {
        score += 10;
        weight += 10;
      } else if (bearishPatterns.includes(pattern)) {
        score -= 10;
        weight += 10;
      }
    });
    
    // EMA Distance Factor
    const currentPrice = data[data.length - 1].c;
    const emaDistance = (currentPrice - ema20) / (ema50 - ema20);
    if (emaDistance > 0.3) {
      score += 10;
    } else if (emaDistance < -0.3) {
      score -= 10;
    }
    weight += 10;
    
    // Bollinger Band Squeeze Detection
    const currentBB = indicators.bollingerBands[indicators.bollingerBands.length - 1];
    const bbWidth = (currentBB.upper - currentBB.lower) / currentPrice;
    if (bbWidth < CONFIG.BB_SQUEEZE_THRESHOLD) {
      patterns.push('BB_SQUEEZE');
      // Boost signal during volatility contractions
      score = score * 1.25;
    }

    return weight > 0 ? Math.max(-100, Math.min(100, (score / weight) * 100)) : 0;
  }
}

class MultiTimeframeAnalysis {
  static identifyTrend(indicators) {
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
      } else if (macdCurrent.MACD < macdCurrent.signal && macdCurrent.MACD < 0) {
        trendScore -= 2;
      }
      signals += 2;
    }

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

  static analyzeTimeframeAlignment(timeframeData, symbol) {
    const alignment = {
      bullishCount: 0,
      bearishCount: 0,
      totalWeight: 0,
      weightedScore: 0,
      confluence: "NONE",
    };

    const currencySettings = getCurrencySettings(symbol);

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

    const totalTimeframes = Object.keys(timeframeData).length;
    
    // Enhanced Confluence Logic
    if (alignment.bullishCount === totalTimeframes) {
      alignment.confluence = "PERFECT_BULLISH";
    } else if (alignment.bearishCount === totalTimeframes) {
      alignment.confluence = "PERFECT_BEARISH";
    } else if (alignment.bullishCount >= totalTimeframes * 0.75) {
      alignment.confluence = "STRONG_BULLISH";
    } else if (alignment.bearishCount >= totalTimeframes * 0.75) {
      alignment.confluence = "STRONG_BEARISH";
    } else if (alignment.bullishCount > alignment.bearishCount) {
      alignment.confluence = "WEAK_BULLISH";
    } else if (alignment.bearishCount > alignment.bullishCount) {
      alignment.confluence = "WEAK_BEARISH";
    }

    // Momentum Filter
    const scalp = timeframeData.scalp?.indicators;
    const lower = timeframeData.lower?.indicators;
    
    if (scalp && lower) {
      if (scalp.rsi > 60 && lower.rsi > 60) {
        alignment.momentum = "BULLISH";
      } else if (scalp.rsi < 40 && lower.rsi < 40) {
        alignment.momentum = "BEARISH";
      } else {
        alignment.momentum = "NEUTRAL";
      }
    }

    // Confluence-Momentum Alignment
    if (alignment.confluence.includes("BULLISH") && alignment.momentum !== "BULLISH") {
      alignment.confluence = "WEAK_" + alignment.confluence;
    } else if (alignment.confluence.includes("BEARISH") && alignment.momentum !== "BEARISH") {
      alignment.confluence = "WEAK_" + alignment.confluence;
    }
    
    // Divergence Detection
    const divergence = this.detectDivergence(
      timeframeData.lower.data, 
      timeframeData.lower.indicators.macd
    );
    alignment.divergence = divergence;
    
    // Divergence confirmation bonus
    if (divergence === "BULLISH_DIVERGENCE") {
      alignment.weightedScore += 15;
    } else if (divergence === "BEARISH_DIVERGENCE") {
      alignment.weightedScore -= 15;
    }
    
    // Currency-specific reversal threshold
    if (alignment.weightedScore > currencySettings.reversalThreshold) {
      alignment.reversalRisk = "LOW";
    } else {
      alignment.reversalRisk = "HIGH";
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

        // Direction alignment bonus
        if (
          (mainDirection === "LONG" && data.technicalScore > 0) ||
          (mainDirection === "SHORT" && data.technicalScore < 0)
        ) {
          score += 30;
        }
        
        // Volume spike bonus
        if (data.indicators.volumeSpike) {
          score += 20;
        }
        
        // Pattern confirmation bonus
        if (data.candlestickAnalysis.patterns.length > 0) {
          score += 15;
        }

        if (score > bestScore) {
          bestScore = score;
          bestTimeframe = tf;
        }
      }
    });

    return { timeframe: bestTimeframe, score: bestScore };
  }
  
  // Enhanced Divergence Detection with Confirmation
  static detectDivergence(priceData, macdData) {
    if (!priceData || !macdData || priceData.length < 6 || macdData.length < 6) 
      return "NO_DATA";

    const lookback = CONFIG.DIVERGENCE_LOOKBACK;
    const priceSlice = priceData.slice(-lookback);
    const macdSlice = macdData.slice(-lookback);

    let bullishCount = 0, bearishCount = 0;
    
    for (let i = 2; i < lookback; i++) {
      // Bullish divergence: Lower lows in price + higher lows in MACD
      if (priceSlice[i].l < priceSlice[i-1].l && 
          macdSlice[i].MACD > macdSlice[i-1].MACD) {
        bullishCount++;
      }
      // Bearish divergence: Higher highs in price + lower highs in MACD
      if (priceSlice[i].h > priceSlice[i-1].h && 
          macdSlice[i].MACD < macdSlice[i-1].MACD) {
        bearishCount++;
      }
    }

    if (bullishCount >= 2 && bearishCount <= 1) return "BULLISH_DIVERGENCE";
    if (bearishCount >= 2 && bullishCount <= 1) return "BEARISH_DIVERGENCE";
    return "NO_DIVERGENCE";
  }
}

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
      console.error(`Error fetching ${timeframe.name} data for ${symbol}:`, error.message);
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
        console.error(`Failed to fetch ${timeframe.name} data for ${symbol}:`, error.message);
      }
    }

    return timeframeData;
  }
}

class TradingSystem {
  constructor(symbol) {
    this.symbol = symbol || CONFIG.DEFAULT_SYMBOL;
    this.timeframeData = {};
    this.currencySettings = getCurrencySettings(this.symbol);
  }

  async fetchAllData() {
    this.timeframeData = await DataFetcher.fetchAllTimeframes(this.symbol);
    return this.timeframeData;
  }

  analyzeTimeframe(timeframeKey, mainDirection) {
    const timeframeInfo = this.timeframeData[timeframeKey];
    if (!timeframeInfo || !timeframeInfo.data || timeframeInfo.data.length === 0) {
      return null;
    }

    const data = timeframeInfo.data;

    const indicators = TechnicalAnalysis.calculateAllIndicators(data);
    if (!indicators) return null;

    const patterns = TechnicalAnalysis.detectCandlestickPatterns(data);
    const technicalScore = TechnicalAnalysis.generateTechnicalScore(
      indicators, 
      data, 
      mainDirection,
      this.currencySettings
    );
    const trendAnalysis = MultiTimeframeAnalysis.identifyTrend(indicators);

    const currentPrice = data[data.length - 1].c;
    const currentATR = indicators.atr[indicators.atr.length - 1];
    const currentRSI = indicators.rsi[indicators.rsi.length - 1];
    const currentMACD = indicators.macd[indicators.macd.length - 1];
    const currentBB = indicators.bollingerBands[indicators.bollingerBands.length - 1];
    const currentADX = indicators.adx[indicators.adx.length - 1];
    const currentStoch = indicators.stoch[indicators.stoch.length - 1];
    
    // Volume spike detection
    const volumeLookback = Math.min(CONFIG.VOLUME_LOOKBACK, indicators.volume.length);
    const recentVolumes = indicators.volume.slice(-volumeLookback);
    const volumeAvg = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
    const currentVolume = indicators.volume[indicators.volume.length - 1];
    const volumeSpike = currentVolume > volumeAvg * CONFIG.VOLUME_SPIKE_THRESHOLD;

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
        volumeSpike,
        volumeDirection: indicators.volumeDirection
      },
      candlestickAnalysis: {
        patterns,
        signal: patterns.length > 0 ? "STRONG_SIGNAL" : "NEUTRAL",
        strength: patterns.length * 10
      },
      timestamp: moment().toISOString(),
    };
  }

  performMultiTimeframeAnalysis() {
    const mtfAnalysis = {};
    
    // First pass to get main direction
    Object.keys(this.timeframeData).forEach((tf) => {
      const analysis = this.analyzeTimeframe(tf, "NO_DIRECTION");
      if (analysis) {
        mtfAnalysis[tf] = analysis;
      }
    });

    const alignment = MultiTimeframeAnalysis.analyzeTimeframeAlignment(mtfAnalysis, this.symbol);

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
    
    // Second pass with main direction for more accurate scoring
    Object.keys(this.timeframeData).forEach((tf) => {
      mtfAnalysis[tf] = this.analyzeTimeframe(tf, mainDirection);
    });

    const bestEntry = MultiTimeframeAnalysis.findBestEntryTimeframe(mtfAnalysis, mainDirection);
    
    // Execution Signal Filter with strict confluence
    let executionSignal = "NO_SIGNAL";
    const scalp = mtfAnalysis.scalp;
    const lower = mtfAnalysis.lower;
    
    // Require at least 3 timeframes aligned
    if (mainDirection === "LONG" && alignment.bullishCount >= 3) {
      if (scalp && lower) {
        if (
          scalp.indicators.rsi < this.currencySettings.rsiThreshold &&
          scalp.indicators.stochastic.k < 70 &&
          scalp.indicators.ema20 > scalp.indicators.ema50 &&
          scalp.technicalScore > 25
        ) {
          executionSignal = "CONFIRMED_LONG";
        }
      }
    } else if (mainDirection === "SHORT" && alignment.bearishCount >= 3) {
      if (scalp && lower) {
        if (
          scalp.indicators.rsi > (100 - this.currencySettings.rsiThreshold) &&
          scalp.indicators.stochastic.k > 30 &&
          scalp.indicators.ema20 < scalp.indicators.ema50 &&
          scalp.technicalScore < -25
        ) {
          executionSignal = "CONFIRMED_SHORT";
        }
      }
    }
    
    // Add divergence to execution signal
    if (alignment.divergence === "BULLISH_DIVERGENCE" && executionSignal === "CONFIRMED_LONG") {
      executionSignal = "STRONG_LONG_DIVERGENCE";
    } else if (alignment.divergence === "BEARISH_DIVERGENCE" && executionSignal === "CONFIRMED_SHORT") {
      executionSignal = "STRONG_SHORT_DIVERGENCE";
    }

    return {
      individual: mtfAnalysis,
      alignment,
      mainDirection,
      bestEntry,
      confluence: alignment.confluence,
      momentum: alignment.momentum,
      executionSignal,
      divergence: alignment.divergence,
      reversalRisk: alignment.reversalRisk
    };
  }

  async analyze() {
    try {
      await this.fetchAllData();
      const mtfAnalysis = this.performMultiTimeframeAnalysis();

      // Enhanced Dynamic Risk Management with currency adjustments
      const currentPrice = mtfAnalysis.individual.scalp?.indicators.currentPrice || 
                          mtfAnalysis.individual.lower?.indicators.currentPrice || 1.0;
      const atr = mtfAnalysis.individual.scalp?.indicators.atr || 
                  mtfAnalysis.individual.lower?.indicators.atr || 0.0002;
                  
      const volatilityFactor = (atr / currentPrice) * 10000; // In pips percentage
      
      // Apply currency-specific volatility multiplier
      const adjustedVolatility = volatilityFactor * this.currencySettings.volatilityMultiplier;
      
      let stopLoss, takeProfit;
      if (adjustedVolatility > 8) { // High volatility
        stopLoss = atr * 1.2;
        takeProfit = atr * 2.0;
      } else if (adjustedVolatility < 3) { // Low volatility
        stopLoss = atr * 0.8;
        takeProfit = atr * 3.5;
      } else { // Moderate volatility
        stopLoss = atr * 1.0;
        takeProfit = atr * 3.0;
      }
      
      const riskRewardRatio = takeProfit / stopLoss;
      
      // Strict 4-minute trade duration
      const entryTime = moment();
      const expiryTime = entryTime.clone().add(CONFIG.MAX_TRADE_DURATION, 'minutes').toISOString();
      
      // Confidence Score Calculation
      const confidenceScore = Math.min(100, Math.max(0, 
        (mtfAnalysis.alignment.weightedScore * 0.6) + 
        (mtfAnalysis.bestEntry.score * 0.4)
      ));
      
      // Market Condition Classification
      const marketCondition = 
        adjustedVolatility > 10 ? "HIGH_VOLATILITY" :
        adjustedVolatility < 2 ? "LOW_VOLATILITY" : 
        "MODERATE_VOLATILITY";

      return {
        success: true,
        symbol: this.symbol.toUpperCase(),
        analysis: {
          multiTimeframe: mtfAnalysis,
          riskManagement: {
            stopLoss: Math.round(stopLoss * 100000) / 100000,
            takeProfit: Math.round(takeProfit * 100000) / 100000,
            riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
            maxDuration: CONFIG.MAX_TRADE_DURATION + " minutes",
            timeEntry: entryTime.toISOString(),
            timeExpiry: expiryTime
          },
          confidenceScore: Math.round(confidenceScore),
          marketCondition,
          tradeRecommended: confidenceScore > CONFIG.MIN_CONFIDENCE && 
                           mtfAnalysis.executionSignal !== "NO_SIGNAL" &&
                           mtfAnalysis.reversalRisk === "LOW"
        },
        message: "Enhanced multi-timeframe scalping analysis completed"
      };
    } catch (error) {
      console.error("Analysis error:", error.message);
      throw error;
    }
  }
}

// Express Routes
app.use(express.json());

app.get("/api/mtf-scalping-signal", async (req, res) => {
  try {
    const symbol = req.query.symbol || CONFIG.DEFAULT_SYMBOL;

    if (!symbol || typeof symbol !== "string" || symbol.length < 3) {
      return res.status(400).json({
        success: false,
        error: "Invalid symbol parameter",
        message: "Please provide a valid trading symbol (e.g., EURUSD, GBPUSD, XAUUSD)",
      });
    }

    const tradingSystem = new TradingSystem(symbol.toUpperCase());
    const result = await tradingSystem.analyze();

    res.json(result);
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Failed to generate multi-timeframe signal",
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Enhanced Trading System running on port ${PORT}`);
});

module.exports = app;
