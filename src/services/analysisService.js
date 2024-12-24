class AnalysisService {
  constructor() {
    this.TREND_PERIOD = 14;
    this.MOMENTUM_LOOKBACK = 5;
    this.STRONG_BAR_THRESHOLD = 0.7;
    this.KEY_LEVEL_SENSITIVITY = 0.001;
    this.SCALP_LOOKBACK = 10;
    this.REVERSAL_THRESHOLD = 0.003;
    this.SENTIMENT_VOLUME_THRESHOLD = 1.5; 
    this.RSI_PERIOD = 14;
    this.RSI_OVERBOUGHT = 70;
    this.RSI_OVERSOLD = 30;
    this.FAST_MA = 9;
    this.SLOW_MA = 21;
    this.MACD_FAST = 12;
    this.MACD_SLOW = 26;
    this.MACD_SIGNAL = 9;
  }
  analyzeTrend(data) {
      const closes = data.map((candle) => parseFloat(candle.c));
      const highs = data.map((candle) => parseFloat(candle.h));
      const lows = data.map((candle) => parseFloat(candle.l));
      const sma20 = this.calculateSMA(closes, 20);
      const sma50 = this.calculateSMA(closes, 50);
      const ema20 = this.calculateEMA(closes, 20);
      const bollingerBands = this.calculateBollingerBands(closes, 20, 2);
      const macd = this.calculateTechnicalMACD(closes);
      const rsi = this.calculateTechnicalRSI(closes);
      const ttmSqueeze = this.calculateTechnicalTTMSqueeze(data);
      const recentHigh = Math.max(...highs.slice(-50));
      const recentLow = Math.min(...lows.slice(-50));
      const fibLevels = this.calculateFibonacciLevels(recentHigh, recentLow);
      const trending = this.isTrending(closes, sma20, sma50);
      const swingPoints = this.findSwingPoints(data);
      const marketStructure = this.analyzeMarketStructure(data, swingPoints);
      const patterns = this.identifyCandlePatterns(data);
      const priceAction = this.analyzePriceAction(data);
      const momentum = this.analyzeDetailedMomentum(data);
      const scalpingAnalysis = {
        trendContinuation: this.analyzeTrendContinuation(data),
        reversalSetups: this.analyzeReversalSetups(data),
        marketSentiment: this.analyzeMarketSentiment(data),
      };
      const consolidationZones = this.identifyConsolidationZones(data);
      const rsiAnalysis = this.calculateRSI(data);
      const maTrend = this.analyzeMATrend(data);
      const macdAnalysis = this.calculateMACD(data);
      const chartPatterns = this.identifyChartPatterns(data);
      const shortTermDirection = this.determineShortTermDirection({
        rsi: rsiAnalysis,
        maTrend,
        macd: macdAnalysis,
        currentPrice: closes[closes.length - 1],
        sma20: sma20[sma20.length - 1],
        sma50: sma50[sma50.length - 1],
      });
      const direction = this.determineDirection({
        macd,
        rsi,
        sma: { sma20: sma20[sma20.length - 1], sma50: sma50[sma50.length - 1] },
        ema20: ema20[ema20.length - 1],
        currentPrice: closes[closes.length - 1],
        bollingerBands,
      });

      const breakoutSignals = this.analyzeBreakoutSignals(data, {
        bollingerBands,
        consolidationZones,
        sma20,
        sma50,
      });

      return {
        isTrending: trending,
        trend: trending
          ? sma20[sma20.length - 1] > sma50[sma50.length - 1]
            ? "uptrend"
            : "downtrend"
          : "ranging",
        currentPrice: closes[closes.length - 1],
        technicalIndicators: {
          sma: {
            sma20: sma20[sma20.length - 1],
            sma50: sma50[sma50.length - 1],
            trend:
              sma20[sma20.length - 1] > sma50[sma50.length - 1]
                ? "bullish"
                : "bearish",
          },
          ema20: ema20[ema20.length - 1],
          bollingerBands,
          macd,
          rsi,
          ttmSqueeze,
          fibonacciLevels: fibLevels,
        },
        shortTermAnalysis: {
          direction: shortTermDirection.direction,
          confidence: shortTermDirection.confidence,
          rsi: rsiAnalysis,
          maTrend,
          macd: macdAnalysis,
          signals: shortTermDirection.signals,
          patterns: chartPatterns.slice(0, 3),
        },
        signals: {
          macdCrossover: macd.histogram > 0 ? "bullish" : "bearish",
          rsiSignal: rsi.overbought
            ? "overbought"
            : rsi.oversold
            ? "oversold"
            : "neutral",
          squeezeAlert: ttmSqueeze.isSqueezing,
          priceLocation: this.analyzePriceLocation(
            closes[closes.length - 1],
            bollingerBands
          ),
        },
        directionShortTermAnother: direction,
        scalping: scalpingAnalysis,
        breakoutAnalysis: breakoutSignals,
        marketStructure,
        patterns,
        priceAction,
        momentum,
      };
  }
  determineDirection(indicators) {
    let bullishSignals = 0;
    let totalSignals = 0;

    // MACD Analysis
    if (indicators.macd.trend === "bullish") bullishSignals++;
    totalSignals++;

    // RSI Analysis
    if (indicators.rsi.value > 50) bullishSignals++;
    totalSignals++;

    // Moving Average Analysis
    if (indicators.currentPrice > indicators.sma.sma20) bullishSignals++;
    if (indicators.currentPrice > indicators.sma.sma50) bullishSignals++;
    totalSignals += 2;

    // Bollinger Bands Analysis
    if (indicators.currentPrice > indicators.bollingerBands.middle)
      bullishSignals++;
    totalSignals++;

    const confidence = bullishSignals / totalSignals;

    return {
      trend: confidence > 0.5 ? "bullish" : "bearish",
      confidence: Math.abs(confidence - 0.5) * 2, // Scale to 0-1
    };
  }
  calculateTechnicalMACD(closes) {
    if (closes.length < 26) {
      return {
        macdLine: 0,
        signalLine: 0,
        histogram: 0,
        trend: "neutral",
        momentum: 0,
      };
    }
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macdLine = new Array(closes.length);
    for (let i = 25; i < closes.length; i++) {
      macdLine[i] = ema12[i] - ema26[i];
    }
    const validMacd = macdLine.slice(25);
    const signalLine = this.calculateEMA(validMacd, 9);
    const histogram =
      macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1];
    return {
      macdLine: macdLine[macdLine.length - 1],
      signalLine: signalLine[signalLine.length - 1],
      histogram,
      trend: histogram > 0 ? "bullish" : "bearish",
      momentum: Math.abs(histogram),
    };
  }
  calculateTechnicalRSI(closes, period = 14) {
    if (closes.length < period + 1) {
      return {
        value: 50,
        overbought: false,
        oversold: false,
      };
    }
    const gains = new Array(closes.length - 1);
    const losses = new Array(closes.length - 1);
    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      gains[i - 1] = change > 0 ? change : 0;
      losses[i - 1] = change < 0 ? -change : 0;
    }
    let avgGain =
      gains.slice(0, period).reduce((sum, gain) => sum + gain, 0) / period;
    let avgLoss =
      losses.slice(0, period).reduce((sum, loss) => sum + loss, 0) / period;

    for (let i = period; i < closes.length - 1; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }
    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    return {
      value: rsi,
      overbought: rsi > 70,
      oversold: rsi < 30,
    };
  }
  calculateTechnicalTTMSqueeze(data, period = 20) {
    if (data.length < period) {
      return {
        isSqueezing: false,
        intensity: 0,
        duration: 0,
      };
    }
    const closes = data.map((candle) => parseFloat(candle.c));
    const highs = data.map((candle) => parseFloat(candle.h));
    const lows = data.map((candle) => parseFloat(candle.l));
    const bb = this.calculateBollingerBands(closes.slice(-period));
    const sma = this.calculateSMA(closes.slice(-period), period);
    const atr = this.calculateTechnicalATR(
      highs.slice(-period),
      lows.slice(-period),
      closes.slice(-period)
    );
    const keltnerUpper = sma[sma.length - 1] + 2 * atr;
    const keltnerLower = sma[sma.length - 1] - 2 * atr;
    const isSqueezing = bb.upper < keltnerUpper && bb.lower > keltnerLower;
    let duration = 0;
    if (isSqueezing) {
      for (
        let i = data.length - 1;
        i >= Math.max(0, data.length - period);
        i--
      ) {
        const currentData = data.slice(0, i + 1);
        if (currentData.length < period) break;

        const currentBB = this.calculateBollingerBands(
          currentData.map((d) => parseFloat(d.c)).slice(-period)
        );
        const currentSMA = this.calculateSMA(
          currentData.map((d) => parseFloat(d.c)).slice(-period),
          period
        );
        const currentATR = this.calculateATR(
          currentData.map((d) => parseFloat(d.h)).slice(-period),
          currentData.map((d) => parseFloat(d.l)).slice(-period),
          currentData.map((d) => parseFloat(d.c)).slice(-period)
        );
        const currentKeltnerUpper =
          currentSMA[currentSMA.length - 1] + 2 * currentATR;
        const currentKeltnerLower =
          currentSMA[currentSMA.length - 1] - 2 * currentATR;
        if (
          !(
            currentBB.upper < currentKeltnerUpper &&
            currentBB.lower > currentKeltnerLower
          )
        )
          break;
        duration++;
      }
    }
    return {
      isSqueezing,
      intensity: isSqueezing ? (keltnerUpper - bb.upper) / bb.upper : 0,
      duration,
    };
  }
  analyzePriceLocation(currentPrice, bb) {
    if (currentPrice > bb.upper) return "above_bands";
    if (currentPrice < bb.lower) return "below_bands";
    if (currentPrice > bb.middle) return "above_middle";
    return "below_middle";
  }
  calculateSqueezeDuration(data, period) {
    let duration = 0;
    for (let i = data.length - 1; i >= Math.max(0, data.length - period); i--) {
      const squeeze = this.calculateTechnicalTTMSqueeze(data.slice(0, i + 1));
      if (!squeeze.isSqueezing) break;
      duration++;
    }
    return duration;
  }
  calculateTechnicalATR(highs, lows, closes, period) {
    if (highs.length < 2) return 0;
    const trueRanges = new Array(highs.length);
    trueRanges[0] = highs[0] - lows[0];
    for (let i = 1; i < highs.length; i++) {
      trueRanges[i] = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
    }
    let atr = trueRanges[0];
    for (let i = 1; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
    }
    return atr;
  }
  calculateFibonacciLevels(high, low) {
    const diff = high - low;
    return {
      level0: low, // 0%
      level236: low + diff * 0.236,
      level382: low + diff * 0.382,
      level500: low + diff * 0.5,
      level618: low + diff * 0.618,
      level786: low + diff * 0.786,
      level1000: high, // 100%
    };
  }
  identifyChartPatterns(data) {
    const recentData = data.slice(-50);
    const patterns = [];
    const { swingHighs, swingLows } = this.findSwingPoints(recentData);
    patterns.push(...this.findHeadAndShoulders(swingHighs, swingLows));
    patterns.push(...this.findDoublePatterns(swingHighs, swingLows));
    patterns.push(
      ...this.findTrianglePatterns(recentData, swingHighs, swingLows)
    );
    patterns.push(
      ...this.findContinuationPatterns(recentData, swingHighs, swingLows)
    );
    patterns.push(...this.findRoundingPatterns(recentData));
    return patterns.sort((a, b) => {
      if (b.completion - a.completion !== 0) return b.completion - a.completion;
      return b.endIdx - a.endIdx;
    });
  }
  detectTrend(data) {
    const prices = data.map((d) => parseFloat(d.c));
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const sma = this.calculateSMA(prices, 5);
    if (lastPrice > firstPrice && sma[sma.length - 1] > sma[0]) {
      return "up";
    } else if (lastPrice < firstPrice && sma[sma.length - 1] < sma[0]) {
      return "down";
    }
    return null;
  }
  findHeadAndShoulders(swingHighs, swingLows) {
    const patterns = [];
    if (swingHighs.length < 5) return patterns;
    for (let i = 0; i < swingHighs.length - 4; i++) {
      const leftShoulder = swingHighs[i];
      const head = swingHighs[i + 2];
      const rightShoulder = swingHighs[i + 4];
      const neckline = Math.min(swingLows[i + 1].price, swingLows[i + 3].price);
      if (
        this.isHeadAndShoulders(leftShoulder, head, rightShoulder, neckline)
      ) {
        patterns.push({
          type: "head_and_shoulders",
          direction: "bearish",
          startIdx: leftShoulder.index,
          endIdx: rightShoulder.index,
          points: { leftShoulder, head, rightShoulder, neckline },
          completion: this.calculatePatternCompletion(
            rightShoulder.index,
            swingHighs.length
          ),
          target: neckline - (head.price - neckline),
        });
      }
    }
    for (let i = 0; i < swingLows.length - 4; i++) {
      const leftShoulder = swingLows[i];
      const head = swingLows[i + 2];
      const rightShoulder = swingLows[i + 4];
      const neckline = Math.max(
        swingHighs[i + 1].price,
        swingHighs[i + 3].price
      );
      if (
        this.isInverseHeadAndShoulders(
          leftShoulder,
          head,
          rightShoulder,
          neckline
        )
      ) {
        patterns.push({
          type: "inverse_head_and_shoulders",
          direction: "bullish",
          startIdx: leftShoulder.index,
          endIdx: rightShoulder.index,
          points: { leftShoulder, head, rightShoulder, neckline },
          completion: this.calculatePatternCompletion(
            rightShoulder.index,
            swingLows.length
          ),
          target: neckline + (neckline - head.price),
        });
      }
    }
    return patterns;
  }
  findDoublePatterns(swingHighs, swingLows) {
    const patterns = [];
    const tolerance = 0.003;
    for (let i = 0; i < swingHighs.length - 1; i++) {
      const first = swingHighs[i];
      const second = swingHighs[i + 1];
      const middle = swingLows[i].price;
      if (this.isDoubleTop(first, second, middle, tolerance)) {
        patterns.push({
          type: "double_top",
          direction: "bearish",
          startIdx: first.index,
          endIdx: second.index,
          points: { first, second, middle },
          completion: this.calculatePatternCompletion(
            second.index,
            swingHighs.length
          ),
          target: middle - (first.price - middle),
        });
      }
    }
    for (let i = 0; i < swingLows.length - 1; i++) {
      const first = swingLows[i];
      const second = swingLows[i + 1];
      const middle = swingHighs[i].price;

      if (this.isDoubleBottom(first, second, middle, tolerance)) {
        patterns.push({
          type: "double_bottom",
          direction: "bullish",
          startIdx: first.index,
          endIdx: second.index,
          points: { first, second, middle },
          completion: this.calculatePatternCompletion(
            second.index,
            swingLows.length
          ),
          target: middle + (middle - first.price),
        });
      }
    }

    return patterns;
  }
  findTrianglePatterns(data, swingHighs, swingLows) {
    const patterns = [];
    if (swingHighs.length < 3 || swingLows.length < 3) return patterns;
    const highTrendline = this.calculateTrendline(swingHighs.slice(-3));
    const lowTrendline = this.calculateTrendline(swingLows.slice(-3));
    const convergencePoint = this.findConvergencePoint(
      highTrendline,
      lowTrendline
    );
    if (!convergencePoint) return patterns;
    if (Math.abs(highTrendline.slope) < 0.0001 && lowTrendline.slope > 0) {
      patterns.push({
        type: "ascending_triangle",
        direction: "bullish",
        startIdx: Math.min(swingHighs[0].index, swingLows[0].index),
        endIdx: data.length - 1,
        points: { resistance: highTrendline, support: lowTrendline },
        completion: this.calculateTriangleCompletion(data, convergencePoint),
        target: highTrendline.intercept * 1.1, // 10% above resistance
      });
    } else if (
      highTrendline.slope < 0 &&
      Math.abs(lowTrendline.slope) < 0.0001
    ) {
      patterns.push({
        type: "descending_triangle",
        direction: "bearish",
        startIdx: Math.min(swingHighs[0].index, swingLows[0].index),
        endIdx: data.length - 1,
        points: { resistance: highTrendline, support: lowTrendline },
        completion: this.calculateTriangleCompletion(data, convergencePoint),
        target: lowTrendline.intercept * 0.9, // 10% below support
      });
    } else if (Math.abs(highTrendline.slope + lowTrendline.slope) < 0.0001) {
      patterns.push({
        type: "symmetrical_triangle",
        direction: this.determineTriangleDirection(data),
        startIdx: Math.min(swingHighs[0].index, swingLows[0].index),
        endIdx: data.length - 1,
        points: { resistance: highTrendline, support: lowTrendline },
        completion: this.calculateTriangleCompletion(data, convergencePoint),
        target: this.calculateTriangleTarget(data, highTrendline, lowTrendline),
      });
    }
    return patterns;
  }
  detectWedge(data, swingHighs, swingLows) {
    if (swingHighs.length < 3 || swingLows.length < 3) return null;
    const recentHighs = swingHighs.slice(-3);
    const recentLows = swingLows.slice(-3);
    const upperTrendline = this.calculateTrendline(recentHighs);
    const lowerTrendline = this.calculateTrendline(recentLows);
    const convergencePoint = this.findConvergencePoint(
      upperTrendline,
      lowerTrendline
    );
    if (!convergencePoint) return null;
    const wedgeType = this.determineWedgeType(upperTrendline, lowerTrendline);
    if (!wedgeType) return null;
    const { type, direction } = wedgeType;
    return {
      type: type,
      direction: direction,
      startIdx: Math.min(recentHighs[0].index, recentLows[0].index),
      endIdx: data.length - 1,
      points: {
        upperTrendline,
        lowerTrendline,
        convergencePoint,
      },
      completion: this.calculateWedgeCompletion(data, convergencePoint),
      target: this.calculateWedgeTarget(
        data,
        type,
        direction,
        upperTrendline,
        lowerTrendline
      ),
    };
  }
  determineWedgeType(upperTrendline, lowerTrendline) {
    const upperSlope = upperTrendline.slope;
    const lowerSlope = lowerTrendline.slope;
    if (upperSlope > 0 && lowerSlope > 0 && upperSlope < lowerSlope) {
      return {
        type: "rising_wedge",
        direction: "bearish",
      };
    }
    if (upperSlope < 0 && lowerSlope < 0 && upperSlope > lowerSlope) {
      return {
        type: "falling_wedge",
        direction: "bullish",
      };
    }
    return null;
  }
  calculateWedgeCompletion(data, convergencePoint) {
    const patternLength = convergencePoint.x - data[0].index;
    const currentProgress = data.length - data[0].index;
    return Math.min((currentProgress / patternLength) * 100, 100);
  }
  calculateWedgeTarget(data, type, direction, upperTrendline, lowerTrendline) {
    const currentPrice = data[data.length - 1].close;
    const patternHeight = Math.abs(
      upperTrendline.intercept - lowerTrendline.intercept
    );
    if (type === "rising_wedge") {
      return currentPrice - patternHeight;
    }
    if (type === "falling_wedge") {
      return currentPrice + patternHeight;
    }
    return currentPrice;
  }
  detectTrend(data, period = 20) {
    const priceChange =
      ((data[data.length - 1].close - data[0].close) / data[0].close) * 100;
    const threshold = 1;
    if (priceChange > threshold) return "uptrend";
    if (priceChange < -threshold) return "downtrend";
    return "neutral";
  }
  findContinuationPatterns(data, swingHighs, swingLows) {
    const patterns = [];
    if (data.length < 20) return patterns;
    const trend = this.detectTrend(data.slice(-20));
    if (trend !== "neutral") {
      const flagPattern = this.detectFlag(data, trend);
      if (flagPattern) patterns.push(flagPattern);
      const pennantPattern = this.detectPennant(data, trend);
      if (pennantPattern) patterns.push(pennantPattern);
    }
    const wedgePattern = this.detectWedge(data, swingHighs, swingLows);
    if (wedgePattern) patterns.push(wedgePattern);
    return patterns;
  }

  findRoundingPatterns(data) {
    const patterns = [];
    const windowSize = 20;
    if (data.length < windowSize) return patterns;
    const cupPattern = this.detectCupAndHandle(data);
    if (cupPattern) patterns.push(cupPattern);
    const roundingPattern = this.detectRoundingBottom(data);
    if (roundingPattern) patterns.push(roundingPattern);
    return patterns;
  }
  detectCupAndHandle(data) {
    if (data.length < 30) return null;
    const cupDepth = this.findCupFormation(data);
    if (!cupDepth) return null;
    const handleFormation = this.findHandleFormation(data, cupDepth);
    if (!handleFormation) return null;
    const { cupStart, cupBottom, cupEnd, handleStart, handleEnd } =
      handleFormation;
    const completion = this.calculateCupHandleCompletion(data, handleFormation);
    const target = this.calculateCupHandleTarget(data, handleFormation);
    return {
      type: "cup_and_handle",
      direction: "bullish",
      startIdx: cupStart,
      endIdx: handleEnd,
      points: {
        cupStart: { index: cupStart, price: data[cupStart].high },
        cupBottom: { index: cupBottom, price: data[cupBottom].low },
        cupEnd: { index: cupEnd, price: data[cupEnd].high },
        handleStart: { index: handleStart, price: data[handleStart].high },
        handleEnd: { index: handleEnd, price: data[handleEnd].low },
      },
      completion,
      target,
    };
  }
  findCupFormation(data) {
    const cupMaxLength = 25; 
    const tolerance = 0.03;

    for (let i = 0; i < data.length - cupMaxLength; i++) {
      const potentialStart = data[i].high;
      let lowestIdx = i;
      let lowestPrice = data[i].low;
      for (let j = i; j < Math.min(i + cupMaxLength, data.length); j++) {
        if (data[j].low < lowestPrice) {
          lowestPrice = data[j].low;
          lowestIdx = j;
        }
      }
      for (
        let j = lowestIdx + 1;
        j < Math.min(i + cupMaxLength, data.length);
        j++
      ) {
        const currentPrice = data[j].high;
        if (
          Math.abs(currentPrice - potentialStart) / potentialStart <
          tolerance
        ) {
          if (this.isUShape(data.slice(i, j + 1), lowestIdx - i)) {
            return {
              cupStart: i,
              cupBottom: lowestIdx,
              cupEnd: j,
            };
          }
        }
      }
    }
    return null;
  }
  findHandleFormation(data, cupDepth) {
    const { cupStart, cupBottom, cupEnd } = cupDepth;
    const handleMaxLength = Math.floor((cupEnd - cupStart) * 0.5); 
    const handleMaxRetracement = 0.5;
    let handleStart = cupEnd;
    let lowestHandlePrice = data[cupEnd].low;
    let handleBottom = cupEnd;
    for (
      let i = cupEnd + 1;
      i < Math.min(cupEnd + handleMaxLength, data.length);
      i++
    ) {
      if (data[i].low < lowestHandlePrice) {
        lowestHandlePrice = data[i].low;
        handleBottom = i;
      }
      const cupHeight = data[cupEnd].high - data[cupBottom].low;
      const handleDepth = data[cupEnd].high - lowestHandlePrice;

      if (handleDepth / cupHeight <= handleMaxRetracement) {
        return {
          cupStart,
          cupBottom,
          cupEnd,
          handleStart,
          handleEnd: i,
        };
      }
    }
    return null;
  }
  isUShape(data, bottomIdx) {
    const leftSlope = this.calculateAverageSlope(data.slice(0, bottomIdx + 1));
    const rightSlope = this.calculateAverageSlope(data.slice(bottomIdx));
    return (
      Math.abs(leftSlope) < 0.5 &&
      Math.abs(rightSlope) < 0.5 &&
      Math.abs(Math.abs(leftSlope) - Math.abs(rightSlope)) < 0.2
    );
  }
  calculateAverageSlope(data) {
    const prices = data.map((d) => d.close);
    let sumSlope = 0;
    for (let i = 1; i < prices.length; i++) {
      sumSlope += (prices[i] - prices[i - 1]) / prices[i - 1];
    }
    return sumSlope / (prices.length - 1);
  }
  calculateCupHandleCompletion(data, formation) {
    const { handleEnd } = formation;
    const totalPatternLength = handleEnd - formation.cupStart;
    const currentProgress = data.length - formation.cupStart;
    return Math.min((currentProgress / totalPatternLength) * 100, 100);
  }
  calculateCupHandleTarget(data, formation) {
    const { cupBottom, cupEnd } = formation;
    const patternHeight = data[cupEnd].high - data[cupBottom].low;
    const breakoutPrice = data[cupEnd].high;
    return breakoutPrice + patternHeight;
  }
  detectRoundingBottom(data) {
    if (data.length < 20) return null;
    const roundingFormation = this.findRoundingFormation(data);
    if (!roundingFormation) return null;
    const { startIdx, bottomIdx, endIdx, curveQuality } = roundingFormation;
    const completion = this.calculateRoundingCompletion(
      data,
      roundingFormation
    );
    const target = this.calculateRoundingTarget(data, roundingFormation);
    return {
      type: "rounding_bottom",
      direction: "bullish",
      startIdx,
      endIdx,
      points: {
        start: { index: startIdx, price: data[startIdx].high },
        bottom: { index: bottomIdx, price: data[bottomIdx].low },
        end: { index: endIdx, price: data[endIdx].high },
      },
      curveQuality,
      completion,
      target,
    };
  }
  findRoundingFormation(data) {
    const minLength = 10;
    const maxLength = 30;
    for (let windowSize = minLength; windowSize <= maxLength; windowSize++) {
      for (let i = 0; i < data.length - windowSize; i++) {
        const segment = data.slice(i, i + windowSize);
        const { bottomIdx, curveQuality } = this.analyzeRoundingCurve(segment);
        if (curveQuality > 0.7) {
          return {
            startIdx: i,
            bottomIdx: i + bottomIdx,
            endIdx: i + windowSize - 1,
            curveQuality,
          };
        }
      }
    }
    return null;
  }
  analyzeRoundingCurve(data) {
    const prices = data.map((d) => d.low);
    let bottomIdx = prices.indexOf(Math.min(...prices));
    const curveQuality = this.calculateCurveFit(prices, bottomIdx);
    return { bottomIdx, curveQuality };
  }
  calculateCurveFit(prices, bottomIdx) {
    let leftSide = prices.slice(0, bottomIdx + 1);
    let rightSide = prices.slice(bottomIdx);
    leftSide = this.normalizeArray(leftSide);
    rightSide = this.normalizeArray(rightSide.reverse());
    const minLength = Math.min(leftSide.length, rightSide.length);
    let similarity = 0;
    for (let i = 0; i < minLength; i++) {
      const diff = Math.abs(leftSide[i] - rightSide[i]);
      similarity += 1 - diff;
    }
    return similarity / minLength;
  }
  normalizeArray(arr) {
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const range = max - min;
    return arr.map((val) => (val - min) / range);
  }
  calculateRoundingCompletion(data, formation) {
    const patternLength = formation.endIdx - formation.startIdx;
    const currentProgress = data.length - formation.startIdx;
    return Math.min((currentProgress / patternLength) * 100, 100);
  }
  calculateRoundingTarget(data, formation) {
    const { startIdx, bottomIdx, endIdx } = formation;
    const patternHeight = data[startIdx].high - data[bottomIdx].low;
    const breakoutPrice = data[endIdx].high;
    return breakoutPrice + patternHeight;
  }
  calculateMACD(data) {
    const closes = data.map((candle) => parseFloat(candle.c));
    const fastEMA = this.calculateEMA(closes, this.MACD_FAST);
    const slowEMA = this.calculateEMA(closes, this.MACD_SLOW);
    const macdLine = fastEMA.map((fast, i) => fast - slowEMA[i]);
    const signalLine = this.calculateEMA(macdLine, this.MACD_SIGNAL);
    const histogram = macdLine.map((macd, i) => macd - signalLine[i]);
    const currentMACD = macdLine[macdLine.length - 1];
    const currentSignal = signalLine[signalLine.length - 1];
    const currentHistogram = histogram[histogram.length - 1];
    const previousHistogram = histogram[histogram.length - 2];
    return {
      value: currentMACD,
      signal: currentSignal,
      histogram: currentHistogram,
      trend: currentMACD > currentSignal ? "bullish" : "bearish",
      momentum:
        Math.abs(currentHistogram) > Math.abs(previousHistogram)
          ? "increasing"
          : "decreasing",
      crossover: this.detectMACDCrossover(macdLine, signalLine),
      strength: Math.abs(currentMACD) / Math.abs(currentSignal),
    };
  }
  calculateEMA(data, period) {
    if (data.length < period) {
      return [];
    }
    const k = 2 / (period + 1);
    const ema = new Array(data.length);
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i];
    }
    ema[period - 1] = sum / period;
    for (let i = period; i < data.length; i++) {
      ema[i] = data[i] * k + ema[i - 1] * (1 - k);
    }

    return ema;
  }
  detectMACDCrossover(macdLine, signalLine) {
    const current =
      macdLine[macdLine.length - 1] > signalLine[signalLine.length - 1];
    const previous =
      macdLine[macdLine.length - 2] > signalLine[signalLine.length - 2];
    if (current !== previous) {
      return current ? "bullish" : "bearish";
    }
    return null;
  }
  determineShortTermDirection(indicators) {
    const signals = [];
    let bullishSignals = 0;
    let bearishSignals = 0;
    if (indicators.rsi.signal === "oversold") {
      bullishSignals += 2;
      signals.push("RSI oversold");
    } else if (indicators.rsi.signal === "overbought") {
      bearishSignals += 2;
      signals.push("RSI overbought");
    }
    if (indicators.maTrend.trend === "bullish") {
      bullishSignals += 1;
      signals.push("MA trend bullish");
    } else {
      bearishSignals += 1;
      signals.push("MA trend bearish");
    }
    if (indicators.maTrend.crossover === "bullish") {
      bullishSignals += 2;
      signals.push("Bullish MA crossover");
    } else if (indicators.maTrend.crossover === "bearish") {
      bearishSignals += 2;
      signals.push("Bearish MA crossover");
    }
    if (indicators.currentPrice > indicators.sma20) {
      bullishSignals += 1;
      signals.push("Price above SMA20");
    } else {
      bearishSignals += 1;
      signals.push("Price below SMA20");
    }
    if (indicators.macd.trend === "bullish") {
      bullishSignals += 1;
      signals.push("MACD trending bullish");
    } else {
      bearishSignals += 1;
      signals.push("MACD trending bearish");
    }
    if (indicators.macd.crossover === "bullish") {
      bullishSignals += 2;
      signals.push("Bullish MACD crossover");
    } else if (indicators.macd.crossover === "bearish") {
      bearishSignals += 2;
      signals.push("Bearish MACD crossover");
    }
    if (indicators.macd.momentum === "increasing") {
      bullishSignals += 1;
      signals.push("MACD momentum increasing");
    }
    const totalSignals = bullishSignals + bearishSignals;
    const direction = bullishSignals > bearishSignals ? "bullish" : "bearish";
    const confidence = Math.abs(bullishSignals - bearishSignals) / totalSignals;
    return {
      direction,
      confidence,
      signals,
    };
  }
  calculateRSI(data) {
    const prices = data.map((candle) => parseFloat(candle.c));
    let gains = [];
    let losses = [];
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    const avgGain =
      gains.slice(-this.RSI_PERIOD).reduce((a, b) => a + b, 0) /
      this.RSI_PERIOD;
    const avgLoss =
      losses.slice(-this.RSI_PERIOD).reduce((a, b) => a + b, 0) /
      this.RSI_PERIOD;
    const rs = avgGain / (avgLoss === 0 ? 1 : avgLoss);
    const rsi = 100 - 100 / (1 + rs);
    return {
      value: rsi,
      signal:
        rsi > this.RSI_OVERBOUGHT
          ? "overbought"
          : rsi < this.RSI_OVERSOLD
          ? "oversold"
          : "neutral",
    };
  }
  analyzeMATrend(data) {
    const closes = data.map((candle) => parseFloat(candle.c));
    const fastMA = this.calculateSMA(closes, this.FAST_MA);
    const slowMA = this.calculateSMA(closes, this.SLOW_MA);
    const currentFastMA = fastMA[fastMA.length - 1];
    const currentSlowMA = slowMA[slowMA.length - 1];
    const previousFastMA = fastMA[fastMA.length - 2];
    const previousSlowMA = slowMA[slowMA.length - 2];
    const currentCrossState = currentFastMA > currentSlowMA;
    const previousCrossState = previousFastMA > previousSlowMA;
    return {
      trend: currentFastMA > currentSlowMA ? "bullish" : "bearish",
      crossover:
        currentCrossState !== previousCrossState
          ? currentCrossState
            ? "bullish"
            : "bearish"
          : null,
      fastMA: currentFastMA,
      slowMA: currentSlowMA,
    };
  }
  calculateBollingerBands(data, period = 20, stdDev = 2) {
    const sma = this.calculateSMA(data, period);
    const middle = sma[sma.length - 1];
    const slice = data.slice(-period);
    const squaredDiffs = slice.map((price) => Math.pow(price - middle, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b) / period;
    const std = Math.sqrt(variance);
    return {
      upper: middle + stdDev * std,
      middle: middle,
      lower: middle - stdDev * std,
      width: (middle + stdDev * std - (middle - stdDev * std)) / middle,
    };
  }
  identifyConsolidationZones(data) {
    const period = 14;
    const recentData = data.slice(-period);
    const highs = recentData.map((candle) => parseFloat(candle.h));
    const lows = recentData.map((candle) => parseFloat(candle.l));
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const range = maxHigh - minLow;
    const averageRange = range / maxHigh;

    return {
      isConsolidating: averageRange < 0.02,
      consolidationTop: maxHigh,
      consolidationBottom: minLow,
      consolidationStrength: 1 - averageRange,
    };
  }
  analyzeBreakoutSignals(data, indicators) {
    const { bollingerBands, consolidationZones, sma20, sma50 } = indicators;
    const currentPrice = parseFloat(data[data.length - 1].c);
    const bbandsBreakout = {
      above: currentPrice > bollingerBands.upper,
      below: currentPrice < bollingerBands.lower,
      squeeze: bollingerBands.width < 0.015,
    };
    const srBreakout =
      consolidationZones.isConsolidating &&
      (currentPrice > consolidationZones.consolidationTop * 1.001 ||
        currentPrice < consolidationZones.consolidationBottom * 0.999);
    const maCrossover = {
      goldencross:
        sma20[sma20.length - 1] > sma50[sma50.length - 1] &&
        sma20[sma20.length - 2] <= sma50[sma50.length - 2],
      deathcross:
        sma20[sma20.length - 1] < sma50[sma50.length - 1] &&
        sma20[sma20.length - 2] >= sma50[sma50.length - 2],
    };
    let direction = "neutral";
    let probability = 0;
    if (bbandsBreakout.above) {
      direction = "bearish"; 
      probability += 0.3;
    } else if (bbandsBreakout.below) {
      direction = "bullish"; 
      probability += 0.3;
    }
    if (srBreakout) {
      direction =
        currentPrice > consolidationZones.consolidationTop
          ? "bullish"
          : "bearish";
      probability += 0.3;
    }
    if (maCrossover.goldencross) {
      direction = "bullish";
      probability += 0.4;
    } else if (maCrossover.deathcross) {
      direction = "bearish";
      probability += 0.4;
    }
    if (bbandsBreakout.squeeze) {
      probability += 0.2;
    }

    return {
      direction,
      probability: Math.min(probability, 1),
      signals: {
        bollingerBands: bbandsBreakout,
        consolidation: {
          isConsolidating: consolidationZones.isConsolidating,
          breakout: srBreakout,
          strength: consolidationZones.consolidationStrength,
        },
        movingAverages: maCrossover,
      },
    };
  }
  analyzeTrendContinuation(data) {
    const recentData = data.slice(-this.SCALP_LOOKBACK);
    const closes = recentData.map((candle) => parseFloat(candle.c));
    const sma5 = this.calculateSMA(closes, 5);
    const sma10 = this.calculateSMA(closes, 10);
    const latestCandle = recentData[recentData.length - 1];
    const previousCandle = recentData[recentData.length - 2];
    return {
      direction:
        sma5[sma5.length - 1] > sma10[sma10.length - 1] ? "bullish" : "bearish",
      strength:
        Math.abs(sma5[sma5.length - 1] - sma10[sma10.length - 1]) /
        sma10[sma10.length - 1],
      pullback: this.detectPullback(recentData),
      momentum: parseFloat(latestCandle.c) > parseFloat(previousCandle.c),
      continuationSignal: this.detectContinuationSignal(recentData),
    };
  }
  analyzeReversalSetups(data) {
    const recentData = data.slice(-this.SCALP_LOOKBACK);
    const latestCandle = recentData[recentData.length - 1];
    const previousCandle = recentData[recentData.length - 2];
    const priceChange =
      (parseFloat(latestCandle.c) - parseFloat(previousCandle.c)) /
      parseFloat(previousCandle.c);
    const volumeIncrease =
      parseFloat(latestCandle.v) / parseFloat(previousCandle.v);
    return {
      potentialReversal: Math.abs(priceChange) > this.REVERSAL_THRESHOLD,
      direction: priceChange > 0 ? "bullish" : "bearish",
      strength: Math.abs(priceChange),
      volumeConfirmation: volumeIncrease > this.SENTIMENT_VOLUME_THRESHOLD,
      keyLevel: this.isAtKeyLevel(recentData),
    };
  }
  analyzeMarketSentiment(data) {
    const recentData = data.slice(-this.SCALP_LOOKBACK);
    const volumes = recentData.map((candle) => parseFloat(candle.v));
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const latestVolume = volumes[volumes.length - 1];
    return {
      volumeProfile: latestVolume / avgVolume,
      momentum: this.calculateShortTermMomentum(recentData),
      sentiment: this.determineMarketSentiment(recentData),
      strength: this.calculateSentimentStrength(recentData),
    };
  }
  detectPullback(data) {
    const latestCandle = data[data.length - 1];
    const previousCandle = data[data.length - 2];
    const beforePrevious = data[data.length - 3];
    return {
      isPullback:
        parseFloat(latestCandle.c) < parseFloat(previousCandle.c) &&
        parseFloat(previousCandle.c) < parseFloat(beforePrevious.c),
      strength:
        Math.abs(parseFloat(latestCandle.c) - parseFloat(previousCandle.c)) /
        parseFloat(previousCandle.c),
    };
  }
  detectContinuationSignal(data) {
    const latestCandle = data[data.length - 1];
    const body = Math.abs(
      parseFloat(latestCandle.c) - parseFloat(latestCandle.o)
    );
    const totalRange = parseFloat(latestCandle.h) - parseFloat(latestCandle.l);
    return {
      signal: body / totalRange > this.STRONG_BAR_THRESHOLD,
      direction:
        parseFloat(latestCandle.c) > parseFloat(latestCandle.o)
          ? "bullish"
          : "bearish",
    };
  }
  isAtKeyLevel(data) {
    const latestPrice = parseFloat(data[data.length - 1].c);
    const keyLevels = this.identifyKeyLevels(data);
    return {
      isAtLevel:
        keyLevels.support.some(
          (level) =>
            Math.abs(latestPrice - level) / level < this.KEY_LEVEL_SENSITIVITY
        ) ||
        keyLevels.resistance.some(
          (level) =>
            Math.abs(latestPrice - level) / level < this.KEY_LEVEL_SENSITIVITY
        ),
      type: keyLevels.support.some(
        (level) =>
          Math.abs(latestPrice - level) / level < this.KEY_LEVEL_SENSITIVITY
      )
        ? "support"
        : "resistance",
    };
  }
  calculateShortTermMomentum(data) {
    const closes = data.map((candle) => parseFloat(candle.c));
    const changes = closes
      .slice(1)
      .map((price, i) => (price - closes[i]) / closes[i]);
    return {
      value: changes.reduce((sum, change) => sum + change, 0),
      direction: changes[changes.length - 1] > 0 ? "bullish" : "bearish",
    };
  }
  determineMarketSentiment(data) {
    const recentCandles = data.slice(-5);
    let bullishCandles = 0;
    let bearishCandles = 0;
    recentCandles.forEach((candle) => {
      if (parseFloat(candle.c) > parseFloat(candle.o)) bullishCandles++;
      else bearishCandles++;
    });
    return bullishCandles > bearishCandles ? "bullish" : "bearish";
  }
  calculateSentimentStrength(data) {
    const volumes = data.map((candle) => parseFloat(candle.v));
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const latestVolume = volumes[volumes.length - 1];
    return {
      volumeStrength: latestVolume / avgVolume,
      conviction: latestVolume > avgVolume * this.SENTIMENT_VOLUME_THRESHOLD,
    };
  }
  analyzeDetailedMomentum(data) {
    const recentBars = data.slice(-this.MOMENTUM_LOOKBACK);
    const result = {
      consecutiveStrong: this.analyzeConsecutiveStrong(recentBars),
      volumeMomentum: this.analyzeVolumeMomentum(recentBars),
      momentumStrength: this.calculateMomentumStrength(recentBars),
      momentumWaning: false,
      recentMomentumShift: null,
    };
    result.momentumWaning = this.checkWaningMomentum(recentBars);
    result.recentMomentumShift = this.detectMomentumShift(recentBars);
    return result;
  }
  calculateMomentumStrength(bars) {
    const bodyStrengths = bars.map((bar) => {
      const bodySize = Math.abs(bar.c - bar.o);
      const totalRange = bar.h - bar.l;
      return bodySize / totalRange;
    });
    const volumeStrengths = bars.map((bar) => {
      const avgVolume =
        bars.reduce((acc, b) => acc + parseFloat(b.v), 0) / bars.length;
      return parseFloat(bar.v) / avgVolume;
    });
    let consistentDirection = 0;
    const direction = bars[0].c > bars[0].o ? "bullish" : "bearish";
    for (const bar of bars) {
      if (
        (direction === "bullish" && bar.c > bar.o) ||
        (direction === "bearish" && bar.c < bar.o)
      ) {
        consistentDirection++;
      }
    }
    const directionScore = consistentDirection / bars.length;
    const avgBodyStrength =
      bodyStrengths.reduce((a, b) => a + b, 0) / bodyStrengths.length;
    const avgVolumeStrength =
      volumeStrengths.reduce((a, b) => a + b, 0) / volumeStrengths.length;
    return {
      overall: avgBodyStrength * avgVolumeStrength * directionScore,
      bodyStrength: avgBodyStrength,
      volumeStrength: avgVolumeStrength,
      directionStrength: directionScore,
    };
  }
  analyzeConsecutiveStrong(bars) {
    let consecutiveBullish = 0;
    let consecutiveBearish = 0;
    let currentStreak = {
      direction: null,
      count: 0,
      averageStrength: 0,
      bars: [],
    };
    for (const bar of bars) {
      const isStrongBar = this.isStrongBar(bar);
      const isBullish = bar.c > bar.o;

      if (isStrongBar) {
        if (isBullish) {
          consecutiveBullish++;
          consecutiveBearish = 0;

          if (currentStreak.direction !== "bullish") {
            currentStreak = {
              direction: "bullish",
              count: 1,
              averageStrength: this.calculateBarStrength(bar),
              bars: [bar],
            };
          } else {
            currentStreak.count++;
            currentStreak.bars.push(bar);
            currentStreak.averageStrength =
              currentStreak.bars.reduce(
                (acc, b) => acc + this.calculateBarStrength(b),
                0
              ) / currentStreak.count;
          }
        } else {
          consecutiveBearish++;
          consecutiveBullish = 0;

          if (currentStreak.direction !== "bearish") {
            currentStreak = {
              direction: "bearish",
              count: 1,
              averageStrength: this.calculateBarStrength(bar),
              bars: [bar],
            };
          } else {
            currentStreak.count++;
            currentStreak.bars.push(bar);
            currentStreak.averageStrength =
              currentStreak.bars.reduce(
                (acc, b) => acc + this.calculateBarStrength(b),
                0
              ) / currentStreak.count;
          }
        }
      } else {
        consecutiveBullish = 0;
        consecutiveBearish = 0;
      }
    }
    return {
      bullishCount: consecutiveBullish,
      bearishCount: consecutiveBearish,
      currentStreak,
    };
  }
  isStrongBar(bar) {
    const totalRange = bar.h - bar.l;
    const bodySize = Math.abs(bar.c - bar.o);
    return bodySize / totalRange >= this.STRONG_BAR_THRESHOLD;
  }
  calculateBarStrength(bar) {
    const totalRange = bar.h - bar.l;
    const bodySize = Math.abs(bar.c - bar.o);
    const bodyRatio = bodySize / totalRange;
    const volumeFactor = bar.v ? bar.v : 1;
    return bodyRatio * volumeFactor;
  }
  analyzeVolumeMomentum(bars) {
    const volumes = bars.map((bar) => parseFloat(bar.v));
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    return {
      increasingVolume: volumes[volumes.length - 1] > avgVolume,
      volumeTrend: this.calculateVolumeTrend(volumes),
      volumeStrength: volumes[volumes.length - 1] / avgVolume,
    };
  }
  findRecentRejections(data, keyLevels) {
    const rejections = [];
    const recentBars = data.slice(-this.MOMENTUM_LOOKBACK);
    for (const bar of recentBars) {
      const upperWick = bar.h - Math.max(bar.o, bar.c);
      const lowerWick = Math.min(bar.o, bar.c) - bar.l;
      const bodySize = Math.abs(bar.c - bar.o);
      const nearbyLevels = keyLevels.filter(
        (level) =>
          Math.abs(level.price - bar.h) / level.price <
            this.KEY_LEVEL_SENSITIVITY ||
          Math.abs(level.price - bar.l) / level.price <
            this.KEY_LEVEL_SENSITIVITY
      );

      if (nearbyLevels.length > 0) {
        for (const level of nearbyLevels) {
          if (
            upperWick > bodySize * 0.5 &&
            Math.abs(bar.h - level.price) / level.price <
              this.KEY_LEVEL_SENSITIVITY
          ) {
            rejections.push({
              type: "upper",
              price: bar.h,
              keyLevel: level.price,
              levelType: level.type,
              strength: upperWick / bodySize,
              bar,
            });
          }
          if (
            lowerWick > bodySize * 0.5 &&
            Math.abs(bar.l - level.price) / level.price <
              this.KEY_LEVEL_SENSITIVITY
          ) {
            rejections.push({
              type: "lower",
              price: bar.l,
              keyLevel: level.price,
              levelType: level.type,
              strength: lowerWick / bodySize,
              bar,
            });
          }
        }
      }
    }
    return rejections;
  }
  analyzeSignificantRejections(rejections) {
    return rejections.filter((rejection) => {
      return (
        rejection.strength > 2 &&
        Math.abs(rejection.price - rejection.keyLevel) / rejection.keyLevel <
          this.KEY_LEVEL_SENSITIVITY
      );
    });
  }
  findRejectionClusters(rejections) {
    const clusters = [];
    const clusterThreshold = 0.002;
    for (let i = 0; i < rejections.length; i++) {
      let cluster = [rejections[i]];
      for (let j = i + 1; j < rejections.length; j++) {
        if (
          Math.abs(rejections[i].price - rejections[j].price) /
            rejections[i].price <
          clusterThreshold
        ) {
          cluster.push(rejections[j]);
        }
      }
      if (cluster.length > 1) {
        clusters.push({
          price: cluster.reduce((acc, r) => acc + r.price, 0) / cluster.length,
          rejections: cluster,
          strength: cluster.length,
          type: cluster[0].type,
        });
      }
    }

    return clusters;
  }
  checkWaningMomentum(bars) {
    const recentBodies = bars.map((bar) => Math.abs(bar.c - bar.o));
    const recentVolumes = bars.map((bar) => parseFloat(bar.v));
    const bodiesShrinking = recentBodies
      .slice(-3)
      .every((body, i, arr) => i === 0 || body < arr[i - 1]);
    const volumesDeclining = recentVolumes
      .slice(-3)
      .every((vol, i, arr) => i === 0 || vol < arr[i - 1]);

    return bodiesShrinking || volumesDeclining;
  }
  detectMomentumShift(bars) {
    const recentBars = bars.slice(-3);
    if (recentBars.length < 3) return null;
    const [bar1, bar2, bar3] = recentBars;
    const bar1Bullish = bar1.c > bar1.o;
    const bar2Bullish = bar2.c > bar2.o;
    const bar3Bullish = bar3.c > bar3.o;
    if (bar1Bullish && bar2Bullish && !bar3Bullish && this.isStrongBar(bar3)) {
      return {
        type: "bullish_to_bearish",
        strength: this.calculateBarStrength(bar3),
        bar: bar3,
      };
    }
    if (!bar1Bullish && !bar2Bullish && bar3Bullish && this.isStrongBar(bar3)) {
      return {
        type: "bearish_to_bullish",
        strength: this.calculateBarStrength(bar3),
        bar: bar3,
      };
    }
    return null;
  }
  identifyCandlePatterns(data) {
    const patterns = {
      current: [], 
      recent: [], 
    };
    const recentCandles = data.slice(-3);
    this.checkPinBar(recentCandles, patterns);
    this.checkDoji(recentCandles, patterns);
    this.checkHammer(recentCandles, patterns);
    this.checkEngulfing(recentCandles, patterns);
    this.checkMorningStar(recentCandles, patterns);
    this.checkInsideBar(recentCandles, patterns);
    return patterns;
  }
  checkPinBar(candles, patterns) {
    const current = candles[candles.length - 1];
    const shadow = Math.max(
      current.h - Math.max(current.o, current.c),
      Math.min(current.o, current.c) - current.l
    );
    const body = Math.abs(current.o - current.c);
    if (shadow > body * 2) {
      const pattern = {
        type: "pin_bar",
        direction: current.c > current.o ? "bullish" : "bearish",
        strength: shadow / body,
        price: current.c,
      };
      patterns.current.push(pattern);
    }
  }
  checkDoji(candles, patterns) {
    const current = candles[candles.length - 1];
    const body = Math.abs(current.o - current.c);
    const totalSize = current.h - current.l;
    if (body / totalSize < 0.1) {
      const significance = this.assessDojiSignificance(current);
      patterns.current.push({
        type: "doji",
        significance,
        price: current.c,
      });
    }
  }
  assessDojiSignificance(candle) {
    const body = Math.abs(candle.o - candle.c);
    const upperShadow = candle.h - Math.max(candle.o, candle.c);
    const lowerShadow = Math.min(candle.o, candle.c) - candle.l;
    const totalSize = candle.h - candle.l;
    let significance = 0;
    const bodyRatio = body / totalSize;
    if (bodyRatio < 0.05) significance += 0.4;
    else if (bodyRatio < 0.1) significance += 0.2;
    const shadowDiff = Math.abs(upperShadow - lowerShadow);
    const shadowRatio = shadowDiff / totalSize;
    if (shadowRatio < 0.1)
      significance += 0.3; 
    else if (shadowRatio < 0.2) significance += 0.2;
    const averageSize = (candle.h + candle.l) / 2;
    const sizeRatio = totalSize / averageSize;
    if (sizeRatio > 0.01) significance += 0.3; 
    return {
      value: Math.min(1, significance), 
      details: {
        bodySize: bodyRatio,
        shadowEquality: shadowRatio,
        overallSize: sizeRatio,
      },
    };
  }
  checkHammer(candles, patterns) {
    const current = candles[candles.length - 1];
    const body = Math.abs(current.o - current.c);
    const upperShadow = current.h - Math.max(current.o, current.c);
    const lowerShadow = Math.min(current.o, current.c) - current.l;
    if (lowerShadow > body * 2 && upperShadow < body) {
      patterns.current.push({
        type: "hammer",
        direction: "bullish",
        strength: lowerShadow / body,
        price: current.c,
      });
    } else if (upperShadow > body * 2 && lowerShadow < body) {
      patterns.current.push({
        type: "inverted_hammer",
        direction: "bearish",
        strength: upperShadow / body,
        price: current.c,
      });
    }
  }
  checkEngulfing(candles, patterns) {
    if (candles.length < 2) return;
    const previous = candles[candles.length - 2];
    const current = candles[candles.length - 1];
    const previousBody = Math.abs(previous.o - previous.c);
    const currentBody = Math.abs(current.o - current.c);

    if (currentBody > previousBody * 1.5) {
      if (
        current.c > current.o &&
        current.o < previous.c &&
        current.c > previous.o
      ) {
        patterns.recent.push({
          type: "bullish_engulfing",
          significance: currentBody / previousBody,
          price: current.c,
        });
      } else if (
        current.c < current.o &&
        current.o > previous.c &&
        current.c < previous.o
      ) {
        patterns.recent.push({
          type: "bearish_engulfing",
          significance: currentBody / previousBody,
          price: current.c,
        });
      }
    }
  }
  checkMorningStar(candles, patterns) {
    if (candles.length < 3) return;
    const [first, second, third] = candles;
    if (
      first.c > first.o && 
      Math.abs(second.c - second.o) < Math.abs(first.c - first.o) * 0.3 && 
      third.c < third.o && 
      third.c < second.l
    ) {
      patterns.recent.push({
        type: "evening_star",
        significance: Math.abs(third.c - third.o) / Math.abs(first.c - first.o),
        price: third.c,
      });
    }
    if (
      first.c < first.o && 
      Math.abs(second.c - second.o) < Math.abs(first.c - first.o) * 0.3 &&
      third.c > third.o && 
      third.c > second.h
    ) {
      patterns.recent.push({
        type: "morning_star",
        significance: Math.abs(third.c - third.o) / Math.abs(first.c - first.o),
        price: third.c,
      });
    }
  }
  checkInsideBar(candles, patterns) {
    if (candles.length < 2) return;
    const mother = candles[candles.length - 2];
    const inside = candles[candles.length - 1];

    if (inside.h <= mother.h && inside.l >= mother.l) {
      patterns.recent.push({
        type: "inside_bar",
        direction: inside.c > inside.o ? "bullish" : "bearish",
        mother_bar_size: mother.h - mother.l,
        price: inside.c,
      });
    }
  }
  analyzePriceAction(data) {
    const recentData = data.slice(-this.PRICE_ACTION_LOOKBACK);
    return {
      volumeAnalysis: this.analyzeVolume(recentData),
      momentum: this.analyzeMomentum(recentData),
      // falseBreakouts: this.detectFalseBreakouts(recentData),
      // priceRejections: this.findPriceRejections(recentData),
    };
  }
  analyzeVolume(data) {
    const volumes = data.map((candle) => parseFloat(candle.v));
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVolume = volumes[volumes.length - 1];
    return {
      volumeBreak: recentVolume > avgVolume * 1.5,
      volumeTrend: this.calculateVolumeTrend(volumes),
      significantBars: this.findHighVolumeSignificantBars(data),
    };
  }
  analyzeMomentum(data) {
    const closes = data.map((candle) => parseFloat(candle.c));
    const opens = data.map((candle) => parseFloat(candle.o));
    return {
      momentum: this.calculateMomentumScore(closes),
      strengthIndex: this.calculateStrengthIndex(opens, closes),
      exhaustion: this.detectExhaustion(data),
    };
  }
  detectFalseBreakouts(data) {
    const falseBreakouts = [];
    for (let i = 2; i < data.length; i++) {
      const previous = data[i - 1];
      const current = data[i];
      if (current.h > previous.h && current.c < previous.h) {
        falseBreakouts.push({
          type: "false_breakout_high",
          price: current.h,
          rejection: previous.h - current.c,
        });
      }
      if (current.l < previous.l && current.c > previous.l) {
        falseBreakouts.push({
          type: "false_breakout_low",
          price: current.l,
          rejection: current.c - previous.l,
        });
      }
    }
    return falseBreakouts;
  }
  findPriceRejections(data) {
    const rejections = [];
    for (let i = 1; i < data.length; i++) {
      const current = data[i];
      const upperWick = current.h - Math.max(current.o, current.c);
      const lowerWick = Math.min(current.o, current.c) - current.l;
      const body = Math.abs(current.o - current.c);
      if (upperWick > body * 2) {
        rejections.push({
          type: "upper_rejection",
          price: current.h,
          strength: upperWick / body,
        });
      }
      if (lowerWick > body * 2) {
        rejections.push({
          type: "lower_rejection",
          price: current.l,
          strength: lowerWick / body,
        });
      }
    }

    return rejections;
  }
  calculateVolumeTrend(volumes) {
    const recentVolumes = volumes.slice(-5);
    const previousVolumes = volumes.slice(-10, -5);
    const recentAvg =
      recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const previousAvg =
      previousVolumes.reduce((a, b) => a + b, 0) / previousVolumes.length;
    return {
      trend: recentAvg > previousAvg ? "increasing" : "decreasing",
      change: ((recentAvg - previousAvg) / previousAvg) * 100,
    };
  }
  findHighVolumeSignificantBars(data) {
    const volumes = data.map((candle) => parseFloat(candle.v));
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const significantBars = [];

    data.forEach((candle, i) => {
      if (parseFloat(candle.v) > avgVolume * 1.5) {
        significantBars.push({
          index: i,
          volume: parseFloat(candle.v),
          price: parseFloat(candle.c),
          direction: candle.c > candle.o ? "bullish" : "bearish",
        });
      }
    });

    return significantBars;
  }
  calculateMomentumScore(closes) {
    const changes = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    const recentChanges = changes.slice(-5);
    return recentChanges.reduce((a, b) => a + b, 0);
  }
  calculateStrengthIndex(opens, closes) {
    let bullishBars = 0;
    let bearishBars = 0;
    for (let i = 0; i < opens.length; i++) {
      if (closes[i] > opens[i]) bullishBars++;
      if (closes[i] < opens[i]) bearishBars++;
    }
    return {
      bullishStrength: bullishBars / opens.length,
      bearishStrength: bearishBars / opens.length,
    };
  }
  detectExhaustion(data) {
    const recentCandles = data.slice(-5);
    const bodySizes = recentCandles.map((candle) =>
      Math.abs(candle.c - candle.o)
    );
    const averageBody = bodySizes.reduce((a, b) => a + b, 0) / bodySizes.length;
    const lastBody = bodySizes[bodySizes.length - 1];
    return {
      isExhausted: lastBody < averageBody * 0.5,
      exhaustionLevel: lastBody / averageBody,
    };
  }
  findSwingPoints(data) {
    const highs = [];
    const lows = [];
    for (
      let i = this.SWING_LOOKBACK;
      i < data.length - this.SWING_LOOKBACK;
      i++
    ) {
      const currentHigh = parseFloat(data[i].h);
      const currentLow = parseFloat(data[i].l);
      if (this.isSwingHigh(data, i)) {
        highs.push({
          price: currentHigh,
          index: i,
          timestamp: data[i].t,
        });
      }
      if (this.isSwingLow(data, i)) {
        lows.push({
          price: currentLow,
          index: i,
          timestamp: data[i].t,
        });
      }
    }
    return {
      swingHighs: highs,
      swingLows: lows,
    };
  }
  isSwingHigh(data, index) {
    const currentHigh = parseFloat(data[index].h);
    for (let i = 1; i <= this.SWING_LOOKBACK; i++) {
      if (parseFloat(data[index - i].h) > currentHigh) return false;
    }
    for (let i = 1; i <= this.SWING_LOOKBACK; i++) {
      if (parseFloat(data[index + i].h) > currentHigh) return false;
    }
    return true;
  }
  isSwingLow(data, index) {
    const currentLow = parseFloat(data[index].l);
    for (let i = 1; i <= this.SWING_LOOKBACK; i++) {
      if (parseFloat(data[index - i].l) < currentLow) return false;
    }
    for (let i = 1; i <= this.SWING_LOOKBACK; i++) {
      if (parseFloat(data[index + i].l) < currentLow) return false;
    }
    return true;
  }
  analyzeMarketStructure(data, swingPoints) {
    const { swingHighs, swingLows } = swingPoints;
    const structure = {
      currentPhase: "undefined",
      potentialBreakouts: [],
      keyLevels: [],
      recentStructureBreak: null,
    };
    if (swingHighs.length < 2 || swingLows.length < 2) {
      return structure;
    }
    const latestHigh = swingHighs[swingHighs.length - 1];
    const previousHigh = swingHighs[swingHighs.length - 2];
    const latestLow = swingLows[swingLows.length - 1];
    const previousLow = swingLows[swingLows.length - 2];
    if (latestHigh && previousHigh && latestLow && previousLow) {
      if (
        latestHigh.price > previousHigh.price &&
        latestLow.price > previousLow.price
      ) {
        structure.currentPhase = "uptrend";
      } else if (
        latestHigh.price < previousHigh.price &&
        latestLow.price < previousLow.price
      ) {
        structure.currentPhase = "downtrend";
      } else {
        structure.currentPhase = "consolidation";
      }
    }
    const currentPrice = parseFloat(data[data.length - 1].c);
    if (structure.currentPhase === "uptrend") {
      if (
        currentPrice <
        latestLow.price * (1 - this.STRUCTURE_BREAK_THRESHOLD)
      ) {
        structure.recentStructureBreak = {
          type: "bearish",
          level: latestLow.price,
          timestamp: data[data.length - 1].t,
        };
      }
    } else if (structure.currentPhase === "downtrend") {
      if (
        currentPrice >
        latestHigh.price * (1 + this.STRUCTURE_BREAK_THRESHOLD)
      ) {
        structure.recentStructureBreak = {
          type: "bullish",
          level: latestHigh.price,
          timestamp: data[data.length - 1].t,
        };
      }
    }
    const recentSwingHighs = swingHighs.slice(-3);
    const recentSwingLows = swingLows.slice(-3);
    for (const high of recentSwingHighs) {
      if (Math.abs(currentPrice - high.price) / high.price < 0.005) {
        structure.potentialBreakouts.push({
          type: "resistance",
          price: high.price,
          distance: Math.abs(currentPrice - high.price),
        });
      }
    }
    for (const low of recentSwingLows) {
      if (Math.abs(currentPrice - low.price) / low.price < 0.005) {
        structure.potentialBreakouts.push({
          type: "support",
          price: low.price,
          distance: Math.abs(currentPrice - low.price),
        });
      }
    }
    return structure;
  }
  identifyKeyLevels(data) {
    const highs = data.map((candle) => parseFloat(candle.h));
    const lows = data.map((candle) => parseFloat(candle.l));
    return {
      support: this.findKeyLevels(lows, "support"),
      resistance: this.findKeyLevels(highs, "resistance"),
    };
  }
  calculateSMA(data, period) {
    const sma = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    return sma;
  }
  isTrending(closes, sma20, sma50) {
    if (sma20.length < 10 || sma50.length < 10) {
      return false;
    }
    const sma20Slope =
      (sma20[sma20.length - 1] - sma20[sma20.length - 10]) / 10;
    const sma50Slope =
      (sma50[sma50.length - 1] - sma50[sma50.length - 10]) / 10;
    return Math.abs(sma20Slope) > 0.0001 && Math.abs(sma50Slope) > 0.0001;
  }
  findKeyLevels(prices, type) {
    if (prices.length < 40) {
      return [];
    }
    const levels = [];
    const threshold = 0.001;
    for (let i = 20; i < prices.length - 20; i++) {
      const currentPrice = prices[i];
      const previousPrices = prices.slice(i - 20, i);
      const nextPrices = prices.slice(i + 1, i + 21);
      if (
        type === "support" &&
        this.isSupport(currentPrice, previousPrices, nextPrices, threshold)
      ) {
        levels.push(currentPrice);
      } else if (
        type === "resistance" &&
        this.isResistance(currentPrice, previousPrices, nextPrices, threshold)
      ) {
        levels.push(currentPrice);
      }
    }
    return this.consolidateLevels(levels);
  }
  isSupport(price, previousPrices, nextPrices, threshold) {
    return (
      previousPrices.every((p) => p >= price * (1 - threshold)) &&
      nextPrices.every((p) => p >= price * (1 - threshold))
    );
  }
  isResistance(price, previousPrices, nextPrices, threshold) {
    return (
      previousPrices.every((p) => p <= price * (1 + threshold)) &&
      nextPrices.every((p) => p <= price * (1 + threshold))
    );
  }
  consolidateLevels(levels) {
    const groupedLevels = [];
    const threshold = 0.002;
    for (const level of levels) {
      let grouped = false;
      for (const group of groupedLevels) {
        if (Math.abs(group.price - level) / group.price < threshold) {
          group.count++;
          grouped = true;
          break;
        }
      }
      if (!grouped) {
        groupedLevels.push({ price: level, count: 1 });
      }
    }
    return groupedLevels
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((g) => g.price);
  }
}

module.exports = AnalysisService;
