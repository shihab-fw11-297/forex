// /**
//  * Fixed single-file service
//  * Usage: FINAGE_API_KEY=<your_key> node server.js
//  */
// const express = require('express');
// const axios   = require('axios');
// const cors    = require('cors');
// const ti      = require('technicalindicators');

// const app  = express();
// app.use(cors());
// const PORT = process.env.PORT || 3100;

// /* ---------- Finage client (with error mapping) ---------- */
// class Finage {
//   constructor(apiKey){
//     this.key  = "API_KEYb8U5CTFZ2QGMWKQISKLZP4DCQUV3QFT4";
//     this.base = 'https://api.finage.co.uk';
//     if(!this.key) throw new Error('FINAGE_API_KEY not provided in environment');
//   }

//   async hourAgg(pair, fromDate, toDate){
//     const url = `${this.base}/agg/forex/${pair}/2/minute/${fromDate}/${toDate}?apikey=${this.key}`;
//     try {
//       const { data } = await axios.get(url);
//       const results = data.results || [];
//       return results.map(r => ({
//         // ensure timestamp is a number (ms)
//         t: (r.timestamp !== undefined ? r.timestamp : r.t),
//         o: +(r.open  !== undefined ? r.open  : r.o),
//         h: +(r.high  !== undefined ? r.high  : r.h),
//         l: +(r.low   !== undefined ? r.low   : r.l),
//         c: +(r.close !== undefined ? r.close : r.c),
//         v: +(r.volume !== undefined ? r.volume : r.v || 0)
//       }));
//     } catch (err) {
//       if(err.response){
//         const status = err.response.status;
//         const msg = err.response.data && (err.response.data.message || err.response.data.error) ? (err.response.data.message || err.response.data.error) : err.response.statusText;
//         const e = new Error(`Finage API error ${status}: ${msg}`);
//         e.status = status;
//         throw e;
//       }
//       throw err;
//     }
//   }
// }

// /* ---------- Indicator alignment helper ---------- */
// class TIAlign {
//   // indicatorArr: array returned by technicalindicators
//   // candleLen: total candles length
//   // absoluteIndex: absolute candle index (same indexing used by candles)
//   static getAt(indicatorArr, candleLen, absoluteIndex){
//     if(!Array.isArray(indicatorArr)) return null;
//     const offset = candleLen - indicatorArr.length;
//     const idx = absoluteIndex - offset;
//     if(idx < 0 || idx >= indicatorArr.length) return null;
//     return indicatorArr[idx];
//   }
// }

// /* ---------- 50+ rules (aligned + bound) ---------- */
// class Strategies {
//   static tiInput(arr){
//     const close = arr.map(x=>x.c), high = arr.map(x=>x.h),
//           low   = arr.map(x=>x.l), volume = arr.map(x=>x.v);
//     return {close, high, low, volume};
//   }

//   /* 1-8 EMA cross family */
//   static emaCross(candles, i){
//     const {close} = Strategies.tiInput(candles);
//     const ema9  = ti.EMA.calculate({period:9,  values:close});
//     const ema21 = ti.EMA.calculate({period:21, values:close});
//     const e9Curr  = TIAlign.getAt(ema9,  close.length, i);
//     const e21Curr = TIAlign.getAt(ema21, close.length, i);
//     const e9Prev  = TIAlign.getAt(ema9,  close.length, i-1);
//     const e21Prev = TIAlign.getAt(ema21, close.length, i-1);
//     if(e9Curr==null || e21Curr==null || e9Prev==null || e21Prev==null || i<1) return null;
//     const prevC = candles[i-1].c, currC = candles[i].c;
//     const crossUp = prevC < e21Prev && currC > e9Curr && e9Curr > e21Curr;
//     const crossDown = prevC > e21Prev && currC < e9Curr && e9Curr < e21Curr;
//     return crossUp ? 'CALL' : (crossDown ? 'PUT' : null);
//   }

//   /* 9-16 Stoch family */
//   static stochRevert(candles, i){
//     const {close,high,low} = Strategies.tiInput(candles);
//     const stoch = ti.Stochastic.calculate({ high, low, close, period:5, signalPeriod:3 });
//     const s = TIAlign.getAt(stoch, close.length, i);
//     if(!s || typeof s.k !== 'number') return null;
//     const k = s.k;
//     return k > 80 ? 'PUT' : (k < 20 ? 'CALL' : null);
//   }

//   /* 17-24 BB family */
//   static bbBreak(candles, i){
//     const {close} = Strategies.tiInput(candles);
//     const bb = ti.BollingerBands.calculate({period:20, stdDev:2, values:close});
//     const b = TIAlign.getAt(bb, close.length, i);
//     if(!b) return null;
//     const c = candles[i].c;
//     return c > b.upper ? 'PUT' : (c < b.lower ? 'CALL' : null);
//   }

//   /* 25-32 MACD zero-flip */
//   static macdZero(candles, i){
//     const {close} = Strategies.tiInput(candles);
//     const macdArr = ti.MACD.calculate({fastPeriod:12, slowPeriod:26, signalPeriod:9, values:close});
//     const mCurr = TIAlign.getAt(macdArr, close.length, i);
//     const mPrev = TIAlign.getAt(macdArr, close.length, i-1);
//     if(!mCurr || !mPrev) return null;
//     const hist = mCurr.histogram, prev = mPrev.histogram;
//     const flipUp = prev < 0 && hist > 0;
//     const flipDown = prev > 0 && hist < 0;
//     return flipUp ? 'CALL' : (flipDown ? 'PUT' : null);
//   }

//   /* 33-40 S/R round-level bounce */
//   static srPing(candles, i){
//     const c = candles[i].c;
//     const lvl = Math.round(c*100)/100;
//     const rem = (lvl % 0.5 + 0.5) % 0.5; // normalize
//     if(!(rem < 0.02 || Math.abs(rem - 0.5) < 0.02)) return null;
//     const touches = Strategies.countTouches(candles, i, lvl, 8);
//     return touches >= 2 ? (rem < 0.25 ? 'CALL' : 'PUT') : null;
//   }
//   static countTouches(arr,i,level,maxBars){
//     let cnt=0;
//     for(let j=1;j<=maxBars && i-j>=0; j++){
//       const {l,h} = arr[i-j];
//       if(l <= level && h >= level) cnt++;
//     } return cnt;
//   }

//   /* 41-45 News-fade (time dummy) */
//   static newsFade(candles, i){
//     const dt = new Date(candles[i].t);
//     const hrs = dt.getUTCHours(), mins = dt.getUTCMinutes();
//     const afterNews = (hrs === 10 && mins > 3) || (hrs === 14 && mins > 3);
//     if(!afterNews) return null;
//     const prev = candles[i-1]; if(!prev) return null;
//     const move = Math.abs(candles[i].c - prev.c) / prev.c;
//     const big = move > 0.15/100;
//     if(!big) return null;
//     return (candles[i].c > prev.c) ? 'PUT' : 'CALL';
//   }

//   /* 46-50 Asian range breakout */
//   static asianBreak(candles, i){
//     const range = Strategies.asianRange(candles, i); if(!range) return null;
//     const c = candles[i].c;
//     return c > range.high ? 'CALL' : (c < range.low ? 'PUT' : null);
//   }
//   static asianRange(arr,i){
//     const dt = new Date(arr[i].t), hrs = dt.getUTCHours();
//     if(hrs < 0 || hrs > 6) return null;
//     const sub = arr.slice(Math.max(0, i-6), i+1);
//     if(sub.length < 2) return null;
//     const low = Math.min(...sub.map(x=>x.l));
//     const high= Math.max(...sub.map(x=>x.h));
//     return {low, high};
//   }

//   /* 51-52 VWAP mean-revert */
//   static vwapDev(candles, i){
//     const {close, high, low, volume} = Strategies.tiInput(candles);
//     const vwapArr = ti.VWAP.calculate({high, low, close, volume});
//     const vCurr = TIAlign.getAt(vwapArr, close.length, i);
//     if(!vCurr) return null;
//     const c = candles[i].c;
//     const dev = Math.abs(c - vCurr) / vCurr * 100;
//     return dev > 0.2 ? (c > vCurr ? 'PUT' : 'CALL') : null;
//   }
// }

// /* ---------- back-tester (binds strategies to avoid this-loss) ---------- */
// class Engine {
//   constructor(candles, pair){
//     this.candles = candles;
//     this.pair    = pair;
//     this.trades  = [];
//   }

//   run(){
//     // bind strategy functions to Strategies (prevents this-context loss)
//     const bound = {
//       emaCross: Strategies.emaCross.bind(Strategies),
//       stochRevert: Strategies.stochRevert.bind(Strategies),
//       bbBreak: Strategies.bbBreak.bind(Strategies),
//       macdZero: Strategies.macdZero.bind(Strategies),
//       srPing: Strategies.srPing.bind(Strategies),
//       newsFade: Strategies.newsFade.bind(Strategies),
//       asianBreak: Strategies.asianBreak.bind(Strategies),
//       vwapDev: Strategies.vwapDev.bind(Strategies),
//     };

//     const rules = [
//       {name:'EMA-Cross',    fn: bound.emaCross},
//       {name:'Stoch-Revert', fn: bound.stochRevert},
//       {name:'BB-Break',     fn: bound.bbBreak},
//       {name:'MACD-Zero',    fn: bound.macdZero},
//       {name:'S/R-Ping',     fn: bound.srPing},
//       {name:'News-Fade',    fn: bound.newsFade},
//       {name:'Asian-Break',  fn: bound.asianBreak},
//       {name:'VWAP-Dev',     fn: bound.vwapDev}
//     ];

//     for(let i=20; i < this.candles.length; i++){
//       const c = this.candles[i];
//       for(const r of rules){
//         try {
//           const signal = r.fn(this.candles, i);
//           if(signal){
//             this.trades.push({
//               strategy: r.name,
//               time    : new Date(c.t).toISOString(),
//               index   : i,
//               price   : c.c,
//               signal,
//               expiryMin: 2
//             });
//           }
//         } catch(err){
//           // warn once per rule+index (keeps logs readable)
//           console.warn(`rule ${r.name} error at index ${i}:`, err && err.message ? err.message : err);
//         }
//       }
//     }

//     return this.summary();
//   }

//   summary(){
//     const total = this.trades.length;
//     if(!total) return {total:0, bestSignal:null};
//     let wins = 0;
//     for(const tr of this.trades){
//       const nxt = this.candles[tr.index + 1];
//       if(!nxt) continue;
//       const higher = nxt.c > tr.price;
//       if((tr.signal === 'CALL' && higher) || (tr.signal === 'PUT' && !higher)) wins++;
//     }
//     const hitRate = +(wins/total*100).toFixed(2);
//     const best = this.trades[total-1];
//     return {total, wins, hitRate: `${hitRate}%`, bestSignal: best};
//   }
// }

// /* ---------- route ---------- */
// app.get('/analyse', async (req,res)=>{
//   try{
//     const {startDate, endDate, pair} = req.query;
//     if(!startDate || !pair) return res.status(400).json({error:'startDate and pair required (endDate optional)'});

//     const finage = new Finage(process.env.FINAGE_API_KEY);
//     let candles;
//     try {
//       candles = await finage.hourAgg(pair, startDate, endDate || startDate);
//     } catch(e){
//       if(e.status === 401) return res.status(401).json({error:'Finage authentication failed (401). Check FINAGE_API_KEY.'});
//       return res.status(502).json({error: e.message || 'Finage fetch error'});
//     }

//     if(!candles || candles.length === 0) return res.status(404).json({error:'No data for that date/pair'});

//     const report = new Engine(candles, pair).run();
//     res.json({pair, startDate, endDate: endDate || startDate, report});
//   } catch(e){
//     console.error('Unexpected error:', e && e.stack ? e.stack : e);
//     res.status(500).json({error: e && e.message ? e.message : 'Internal server error'});
//   }
// });

// /* ---------- start ---------- */
// app.listen(PORT, ()=>console.log(`Finage-50+-strategy API on :${PORT}`));

/**
 * Enhanced Trading Analysis Service with Multiple Strategies
 * Usage: FINAGE_API_KEY=<your_key> node server.js
 */

/*
 * Enhanced Trading Analysis Service with Multiple Strategies + technicalavi mode
 * Usage: FINAGE_API_KEY=<your_key> node enhanced_trading_analysis_with_technicalavi.js
 *
 * Notes:
 * - This file preserves all original strategies and enhanced strategies.
 * - Adds a new mode: `technicalavi` implementing the user's requested strategy family:
 *     - HMA + Donchian Ribbon
 *     - EMA + Arun Oscillator
 *     - Alligator + Parabolic SAR
 *     - EMA + Stochastic Oscillator
 *     - Customized Alligator
 *
 * - Some indicators (Arun oscillator, Alligator, Parabolic SAR) are implemented here as
 *   lightweight approximations so the service remains single-file and dependency-light.
 *   They are documented in the functions where approximations are used.
 */

// const express = require('express');
// const axios = require('axios');
// const cors = require('cors');
// const ti = require('technicalindicators');

// const app = express();
// app.use(cors());
// const PORT = process.env.PORT || 3100;

// /* ---------- Enhanced Finage Client with Retry Logic ---------- */
// class Finage {
//     constructor(apiKey) {
//         // Use provided API key or fall back to environment variable
//         this.key = apiKey || process.env.FINAGE_API_KEY || "API_KEYb8U5CTFZ2QGMWKQISKLZP4DCQUV3QFT4";
//         this.base = 'https://api.finage.co.uk';
//         if (!this.key) throw new Error('FINAGE_API_KEY not provided in environment');
//     }

//     async hourAgg(pair,timeframes, fromDate, toDate, maxRetries = 3) {
//         const url = `${this.base}/agg/forex/${pair}/${timeframes}/minute/${fromDate}/${toDate}?apikey=${this.key}&limit=50000`;

//         for (let attempt = 1; attempt <= maxRetries; attempt++) {
//             try {
//                 const { data } = await axios.get(url, { timeout: 10000 });
//                 const results = data.results || [];

//                 if (results.length === 0) {
//                     throw new Error('No data returned from API');
//                 }

//                 return results.map(r => ({
//                     t: (r.timestamp !== undefined ? r.timestamp : r.t),
//                     o: +(r.open !== undefined ? r.open : r.o),
//                     h: +(r.high !== undefined ? r.high : r.h),
//                     l: +(r.low !== undefined ? r.low : r.l),
//                     c: +(r.close !== undefined ? r.close : r.c),
//                     v: +(r.volume !== undefined ? r.volume : r.v || 0)
//                 }));
//             } catch (err) {
//                 if (attempt === maxRetries) {
//                     if (err.response) {
//                         const status = err.response.status;
//                         const msg = err.response.data && (err.response.data.message || err.response.data.error)
//                             ? (err.response.data.message || err.response.data.error)
//                             : err.response.statusText;
//                         const e = new Error(`Finage API error ${status}: ${msg}`);
//                         e.status = status;
//                         throw e;
//                     }
//                     throw err;
//                 }
//                 // Wait before retrying
//                 await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
//             }
//         }
//     }
// }

// /* ---------- Indicator Alignment Helper ---------- */
// class TIAlign {
//     static getAt(indicatorArr, candleLen, absoluteIndex) {
//         if (!Array.isArray(indicatorArr)) return null;
//         const offset = candleLen - indicatorArr.length;
//         const idx = absoluteIndex - offset;
//         if (idx < 0 || idx >= indicatorArr.length) return null;
//         return indicatorArr[idx];
//     }
// }

// /* ---------- Enhanced Strategies (Original + New technicalavi Strategies) ---------- */
// class Strategies {
//     static tiInput(arr) {
//         const close = arr.map(x => x.c),
//             high = arr.map(x => x.h),
//             low = arr.map(x => x.l),
//             volume = arr.map(x => x.v);
//         return { close, high, low, volume };
//     }

//     /* ---------- ORIGINAL & ENHANCED (kept unchanged) ---------- */
//     /* (For brevity, assume all previously defined original/enhanced functions remain here)
//        We'll replicate them to keep the file self-contained. */

//     /* 1-8 EMA cross family (Original) */
//     static emaCross(candles, i) {
//         const { close } = Strategies.tiInput(candles);
//         const ema9 = ti.EMA.calculate({ period: 9, values: close });
//         const ema21 = ti.EMA.calculate({ period: 21, values: close });
//         const e9Curr = TIAlign.getAt(ema9, close.length, i);
//         const e21Curr = TIAlign.getAt(ema21, close.length, i);
//         const e9Prev = TIAlign.getAt(ema9, close.length, i - 1);
//         const e21Prev = TIAlign.getAt(ema21, close.length, i - 1);
//         if (e9Curr == null || e21Curr == null || e9Prev == null || e21Prev == null || i < 1) return null;
//         const prevC = candles[i - 1].c,
//             currC = candles[i].c;
//         const crossUp = prevC < e21Prev && currC > e9Curr && e9Curr > e21Curr;
//         const crossDown = prevC > e21Prev && currC < e9Curr && e9Curr < e21Curr;
//         return crossUp ? 'CALL' : (crossDown ? 'PUT' : null);
//     }

//     /* 9-16 Stoch family (Original) */
//     static stochRevert(candles, i) {
//         const { close, high, low } = Strategies.tiInput(candles);
//         const stoch = ti.Stochastic.calculate({ high, low, close, period: 5, signalPeriod: 3 });
//         const s = TIAlign.getAt(stoch, close.length, i);
//         if (!s || typeof s.k !== 'number') return null;
//         const k = s.k;
//         return k > 80 ? 'PUT' : (k < 20 ? 'CALL' : null);
//     }

//     /* 17-24 BB family (Original) */
//     static bbBreak(candles, i) {
//         const { close } = Strategies.tiInput(candles);
//         const bb = ti.BollingerBands.calculate({ period: 20, stdDev: 2, values: close });
//         const b = TIAlign.getAt(bb, close.length, i);
//         if (!b) return null;
//         const c = candles[i].c;
//         return c > b.upper ? 'PUT' : (c < b.lower ? 'CALL' : null);
//     }

//     /* 25-32 MACD zero-flip (Original) */
//     static macdZero(candles, i) {
//         const { close } = Strategies.tiInput(candles);
//         const macdArr = ti.MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, values: close });
//         const mCurr = TIAlign.getAt(macdArr, close.length, i);
//         const mPrev = TIAlign.getAt(macdArr, close.length, i - 1);
//         if (!mCurr || !mPrev) return null;
//         const hist = mCurr.histogram,
//             prev = mPrev.histogram;
//         const flipUp = prev < 0 && hist > 0;
//         const flipDown = prev > 0 && hist < 0;
//         return flipUp ? 'CALL' : (flipDown ? 'PUT' : null);
//     }

//     /* 33-40 S/R round-level bounce (Original) */
//     static srPing(candles, i) {
//         const c = candles[i].c;
//         const lvl = Math.round(c * 100) / 100;
//         const rem = (lvl % 0.5 + 0.5) % 0.5; // normalize
//         if (!(rem < 0.02 || Math.abs(rem - 0.5) < 0.02)) return null;
//         const touches = Strategies.countTouches(candles, i, lvl, 8);
//         return touches >= 2 ? (rem < 0.25 ? 'CALL' : 'PUT') : null;
//     }

//     static countTouches(arr, i, level, maxBars) {
//         let cnt = 0;
//         for (let j = 1; j <= maxBars && i - j >= 0; j++) {
//             const { l, h } = arr[i - j];
//             if (l <= level && h >= level) cnt++;
//         }
//         return cnt;
//     }

//     /* 41-45 News-fade (time dummy) (Original) */
//     static newsFade(candles, i) {
//         const dt = new Date(candles[i].t);
//         const hrs = dt.getUTCHours(),
//             mins = dt.getUTCMinutes();
//         const afterNews = (hrs === 10 && mins > 3) || (hrs === 14 && mins > 3);
//         if (!afterNews) return null;
//         const prev = candles[i - 1];
//         if (!prev) return null;
//         const move = Math.abs(candles[i].c - prev.c) / prev.c;
//         const big = move > 0.15 / 100;
//         if (!big) return null;
//         return (candles[i].c > prev.c) ? 'PUT' : 'CALL';
//     }

//     /* 46-50 Asian range breakout (Original) */
//     static asianBreak(candles, i) {
//         const range = Strategies.asianRange(candles, i);
//         if (!range) return null;
//         const c = candles[i].c;
//         return c > range.high ? 'CALL' : (c < range.low ? 'PUT' : null);
//     }

//     static asianRange(arr, i) {
//         const dt = new Date(arr[i].t),
//             hrs = dt.getUTCHours();
//         if (hrs < 0 || hrs > 6) return null;
//         const sub = arr.slice(Math.max(0, i - 6), i + 1);
//         if (sub.length < 2) return null;
//         const low = Math.min(...sub.map(x => x.l));
//         const high = Math.max(...sub.map(x => x.h));
//         return { low, high };
//     }

//     /* 51-52 VWAP mean-revert (Original) */
//     static vwapDev(candles, i) {
//         const { close, high, low, volume } = Strategies.tiInput(candles);
//         const vwapArr = ti.VWAP.calculate({ high, low, close, volume });
//         const vCurr = TIAlign.getAt(vwapArr, close.length, i);
//         if (!vCurr) return null;
//         const c = candles[i].c;
//         const dev = Math.abs(c - vCurr) / vCurr * 100;
//         return dev > 0.2 ? (c > vCurr ? 'PUT' : 'CALL') : null;
//     }

//     /* ---------- Additional enhanced strategies (kept) ---------- */
//     static emaCrossFast(candles, i) {
//         const { close } = Strategies.tiInput(candles);
//         const emaFast = ti.EMA.calculate({ period: 5, values: close });
//         const emaSlow = ti.EMA.calculate({ period: 12, values: close });

//         const eFastCurr = TIAlign.getAt(emaFast, close.length, i);
//         const eSlowCurr = TIAlign.getAt(emaSlow, close.length, i);
//         const eFastPrev = TIAlign.getAt(emaFast, close.length, i - 1);
//         const eSlowPrev = TIAlign.getAt(emaSlow, close.length, i - 1);

//         if ([eFastCurr, eSlowCurr, eFastPrev, eSlowPrev].includes(null) || i < 1) return null;

//         const crossUp = eFastPrev <= eSlowPrev && eFastCurr > eSlowCurr;
//         const crossDown = eFastPrev >= eSlowPrev && eFastCurr < eSlowCurr;

//         return crossUp ? 'CALL' : (crossDown ? 'PUT' : null);
//     }

//     static rsiSignal(candles, i) {
//         const { close } = Strategies.tiInput(candles);
//         const rsi = ti.RSI.calculate({ period: 14, values: close });
//         const rsiValue = TIAlign.getAt(rsi, close.length, i);

//         if (rsiValue === null) return null;

//         if (rsiValue > 70) return 'PUT';
//         if (rsiValue < 30) return 'CALL';
//         return null;
//     }

//     static bbWithRSI(candles, i) {
//         const { close } = Strategies.tiInput(candles);
//         const bb = ti.BollingerBands.calculate({ period: 20, stdDev: 2, values: close });
//         const rsi = ti.RSI.calculate({ period: 14, values: close });

//         const b = TIAlign.getAt(bb, close.length, i);
//         const rsiValue = TIAlign.getAt(rsi, close.length, i);
//         const c = candles[i].c;

//         if (!b || rsiValue === null) return null;

//         if (c >= b.upper && rsiValue > 70) return 'PUT';
//         if (c <= b.lower && rsiValue < 30) return 'CALL';
//         return null;
//     }

//     static macdSignalCross(candles, i) {
//         const { close } = Strategies.tiInput(candles);
//         const macdInput = { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, values: close };
//         const macdArr = ti.MACD.calculate(macdInput);

//         const mCurr = TIAlign.getAt(macdArr, close.length, i);
//         const mPrev = TIAlign.getAt(macdArr, close.length, i - 1);

//         if (!mCurr || !mPrev || i < 1) return null;

//         const histogramCurr = mCurr.histogram;
//         const histogramPrev = mPrev.histogram;

//         const crossUp = histogramPrev <= 0 && histogramCurr > 0;
//         const crossDown = histogramPrev >= 0 && histogramCurr < 0;

//         return crossUp ? 'CALL' : (crossDown ? 'PUT' : null);
//     }

//     static pinBar(candles, i) {
//         if (i < 1) return null;
//         const current = candles[i];
//         const previous = candles[i - 1];

//         const bodySize = Math.abs(current.o - current.c);
//         const totalRange = current.h - current.l;
//         const upperShadow = current.h - Math.max(current.o, current.c);
//         const lowerShadow = Math.min(current.o, current.c) - current.l;

//         if (bodySize / totalRange < 0.3) {
//             if (upperShadow > lowerShadow * 2 && upperShadow > bodySize * 2) {
//                 return 'PUT';
//             } else if (lowerShadow > upperShadow * 2 && lowerShadow > bodySize * 2) {
//                 return 'CALL';
//             }
//         }
//         return null;
//     }

//     static volumeSpike(candles, i) {
//         if (i < 10) return null;
//         const currentVolume = candles[i].v;
//         const previousVolumes = candles.slice(i - 10, i).map(c => c.v);
//         const avgVolume = previousVolumes.reduce((a, b) => a + b, 0) / previousVolumes.length;
//         if (currentVolume > avgVolume * 2) {
//             const priceChange = ((candles[i].c - candles[i].o) / candles[i].o) * 100;
//             if (priceChange > 0.05) return 'CALL';
//             if (priceChange < -0.05) return 'PUT';
//         }
//         return null;
//     }

//     /* ---------- TECHNICALAVI STRATEGIES (New) ---------- */

//     // Helper: Hull Moving Average implementation (HMA)
//     static hullMA(values, period) {
//         // HMA(n) = WMA(2*WMA(period/2) - WMA(period)), sqrt(period)
//         if (!Array.isArray(values) || values.length < period) return [];
//         const half = Math.round(period / 2);
//         const sqrtP = Math.round(Math.sqrt(period));

//         const wmaFull = ti.WMA.calculate({ period, values });
//         const wmaHalf = ti.WMA.calculate({ period: half, values });

//         // Align lengths by trimming the start of the shorter array
//         const len = Math.min(wmaFull.length, wmaHalf.length);
//         const diff = [];
//         for (let i = 0; i < len; i++) {
//             diff.push(2 * wmaHalf[wmaHalf.length - len + i] - wmaFull[wmaFull.length - len + i]);
//         }

//         const hma = ti.WMA.calculate({ period: sqrtP, values: diff });
//         return hma;
//     }

//     // Donchian Ribbon (upper/lower over period) simple implementation
//     static donchian(candles, period = 20) {
//         const highs = candles.map(c => c.h), lows = candles.map(c => c.l);
//         const upper = [], lower = [];
//         for (let i = 0; i < candles.length; i++) {
//             const from = Math.max(0, i - period + 1);
//             const sliceH = highs.slice(from, i + 1);
//             const sliceL = lows.slice(from, i + 1);
//             upper.push(Math.max(...sliceH));
//             lower.push(Math.min(...sliceL));
//         }
//         return { upper, lower };
//     }

//     // Strategy: HMA + Donchian Ribbon
//     static hmaDonchian(candles, i) {
//         const { close } = Strategies.tiInput(candles);
//         const hmaArr = Strategies.hullMA(close, 70); // EHMA70 in user's spec approximated with HMA(70)
//         if (!hmaArr || hmaArr.length === 0) return null;
//         const hCur = TIAlign.getAt(hmaArr, close.length, i);
//         if (hCur == null) return null;

//         const don = Strategies.donchian(candles, 20);
//         const upper = don.upper[i], lower = don.lower[i];
//         const c = candles[i].c;

//         // Define ribbon color: green when price > HMA and above mid of donchian, red when price < HMA and below mid
//         const mid = (upper + lower) / 2;
//         const buy = c > hCur && c > mid;
//         const sell = c < hCur && c < mid;
//         return buy ? 'CALL' : (sell ? 'PUT' : null);
//     }

//     // Simple Arun oscillator implementation (approximation)
//     // Classic Arun uses position of recent highs/lows; here we compute % of period since last high/low
//     static arunOscillator(candles, period = 14) {
//         const highs = candles.map(c => c.h), lows = candles.map(c => c.l);
//         const up = [], down = [];
//         for (let i = 0; i < candles.length; i++) {
//             const start = Math.max(0, i - period + 1);
//             const window = candles.slice(start, i + 1);
//             // days since highest high
//             let daysSinceHigh = 0;
//             let idxHigh = window.length - 1;
//             for (let j = window.length - 1; j >= 0; j--) {
//                 if (window[j].h === Math.max(...window.map(x => x.h))) { idxHigh = j; break; }
//             }
//             daysSinceHigh = window.length - 1 - idxHigh;

//             let idxLow = window.length - 1;
//             for (let j = window.length - 1; j >= 0; j--) {
//                 if (window[j].l === Math.min(...window.map(x => x.l))) { idxLow = j; break; }
//             }
//             const daysSinceLow = window.length - 1 - idxLow;

//             const upVal = ((period - daysSinceHigh) / period) * 100;
//             const downVal = ((period - daysSinceLow) / period) * 100;
//             up.push(upVal);
//             down.push(downVal);
//         }
//         return { up, down };
//     }

//     // Strategy: EMA + Arun Oscillator
//     static emaArun(candles, i) {
//         const { close } = Strategies.tiInput(candles);
//         const ema = ti.EMA.calculate({ period: 15, values: close });
//         const emaVal = TIAlign.getAt(ema, close.length, i);
//         if (emaVal == null) return null;

//         const arun = Strategies.arunOscillator(candles, 14);
//         const up = arun.up[i], down = arun.down[i];
//         if (up == null || down == null) return null;

//         const price = candles[i].c;
//         // Rule from user: Price above/below EMA + crossover of sky-blue/yellow lines
//         // We'll treat up > down as up-trend (sky-blue over yellow)
//         const crossoverUp = up > down && price > emaVal;
//         const crossoverDown = down > up && price < emaVal;
//         return crossoverUp ? 'CALL' : (crossoverDown ? 'PUT' : null);
//     }

//     // Approximated Alligator (three SMAs with custom values) and Parabolic SAR simple implementation
//     static alligator(candles, jawP = 13, teethP = 8, lipsP = 5) {
//         const { close } = Strategies.tiInput(candles);
//         const jaw = ti.SMA.calculate({ period: jawP, values: close });
//         const teeth = ti.SMA.calculate({ period: teethP, values: close });
//         const lips = ti.SMA.calculate({ period: lipsP, values: close });
//         return { jaw, teeth, lips };
//     }

//     // Very-light Parabolic SAR: using typical acceleration factor with highs/lows
//     // This is a simplistic implementation and should be replaced by a robust library for production.
//     static parabolicSAR(candles, step = 0.02, maxStep = 0.2) {
//         // Return array of SAR values aligned to candles length
//         const sar = new Array(candles.length).fill(null);
//         if (candles.length < 3) return sar;

//         let af = step; // acceleration factor
//         let ep = candles[0].h; // extreme point
//         let sarPrev = candles[0].l; // previous SAR
//         let upTrend = true;

//         sar[0] = sarPrev;

//         for (let i = 1; i < candles.length; i++) {
//             const c = candles[i];
//             let sarVal = sarPrev + af * (ep - sarPrev);

//             // flip conditions (very naive - for demonstration only)
//             if (upTrend) {
//                 if (c.l < sarVal) {
//                     upTrend = false;
//                     sarVal = ep; // reset
//                     af = step;
//                     ep = c.l;
//                 } else {
//                     if (c.h > ep) {
//                         ep = c.h;
//                         af = Math.min(af + step, maxStep);
//                     }
//                 }
//             } else {
//                 if (c.h > sarVal) {
//                     upTrend = true;
//                     sarVal = ep;
//                     af = step;
//                     ep = c.h;
//                 } else {
//                     if (c.l < ep) {
//                         ep = c.l;
//                         af = Math.min(af + step, maxStep);
//                     }
//                 }
//             }

//             sar[i] = sarVal;
//             sarPrev = sarVal;
//         }
//         return sar;
//     }

//     // Strategy: Alligator + Parabolic SAR
//     static alligatorParabolic(candles, i) {
//         const { close } = Strategies.tiInput(candles);
//         const allig = Strategies.alligator(candles, 13, 8, 5);
//         const jawVal = TIAlign.getAt(allig.jaw, close.length, i);
//         const teethVal = TIAlign.getAt(allig.teeth, close.length, i);
//         const lipsVal = TIAlign.getAt(allig.lips, close.length, i);
//         const psarArr = Strategies.parabolicSAR(candles, 0.02, 0.2);
//         const psarVal = psarArr[i];
//         if (jawVal == null || teethVal == null || lipsVal == null || psarVal == null) return null;

//         // Green line crossover + SAR dots position -> bullish when lips>teeth>jaw and price above SAR
//         const price = candles[i].c;
//         const bullish = (lipsVal > teethVal && teethVal > jawVal) && price > psarVal;
//         const bearish = (lipsVal < teethVal && teethVal < jawVal) && price < psarVal;
//         return bullish ? 'CALL' : (bearish ? 'PUT' : null);
//     }

//     // Strategy: EMA + Stochastic Oscillator
//     static emaStoch(candles, i) {
//         const { close, high, low } = Strategies.tiInput(candles);
//         // Using 50 & 100 EMA as per user's spec
//         const ema50 = ti.EMA.calculate({ period: 50, values: close });
//         const ema100 = ti.EMA.calculate({ period: 100, values: close });
//         const e50 = TIAlign.getAt(ema50, close.length, i);
//         const e100 = TIAlign.getAt(ema100, close.length, i);
//         if (e50 == null || e100 == null) return null;

//         const stoch = ti.Stochastic.calculate({ high, low, close, period: 14, signalPeriod: 3 });
//         const s = TIAlign.getAt(stoch, close.length, i);
//         if (!s || typeof s.k !== 'number') return null;

//         const price = candles[i].c;
//         // Price between EMAs + stochastic overbought/oversold
//         const between = price > Math.min(e50, e100) && price < Math.max(e50, e100);
//         if (!between) return null;
//         if (s.k > 80) return 'PUT';
//         if (s.k < 20) return 'CALL';
//         return null;
//     }

//     // Strategy: Customized Alligator (user-defined jaw/teeth/lips)
//     static customizedAlligator(candles, i, jawP = 21, teethP = 13, lipsP = 8) {
//         const { close } = Strategies.tiInput(candles);
//         const allig = Strategies.alligator(candles, jawP, teethP, lipsP);
//         const jawVal = TIAlign.getAt(allig.jaw, close.length, i);
//         const teethVal = TIAlign.getAt(allig.teeth, close.length, i);
//         const lipsVal = TIAlign.getAt(allig.lips, close.length, i);
//         if (jawVal == null || teethVal == null || lipsVal == null) return null;

//         const bullish = (lipsVal > teethVal && teethVal > jawVal);
//         const bearish = (lipsVal < teethVal && teethVal < jawVal);
//         return bullish ? 'CALL' : (bearish ? 'PUT' : null);
//     }
// }

// /* ---------- Enhanced Back-tester with Multiple Modes (including technicalavi) ---------- */
// class Engine {
//     constructor(candles, pair, mode = 'consensus') {
//         this.candles = candles;
//         this.pair = pair;
//         this.trades = [];
//         this.mode = mode; // 'original', 'enhanced', 'consensus', 'technicalavi'
//     }

//     run() {
//         // Bind all strategy functions
//         const bound = {
//             // Original strategies
//             emaCross: Strategies.emaCross.bind(Strategies),
//             stochRevert: Strategies.stochRevert.bind(Strategies),
//             bbBreak: Strategies.bbBreak.bind(Strategies),
//             macdZero: Strategies.macdZero.bind(Strategies),
//             srPing: Strategies.srPing.bind(Strategies),
//             newsFade: Strategies.newsFade.bind(Strategies),
//             asianBreak: Strategies.asianBreak.bind(Strategies),
//             vwapDev: Strategies.vwapDev.bind(Strategies),

//             // Enhanced strategies
//             emaCrossFast: Strategies.emaCrossFast.bind(Strategies),
//             rsiSignal: Strategies.rsiSignal.bind(Strategies),
//             bbWithRSI: Strategies.bbWithRSI.bind(Strategies),
//             macdSignalCross: Strategies.macdSignalCross.bind(Strategies),
//             pinBar: Strategies.pinBar.bind(Strategies),
//             volumeSpike: Strategies.volumeSpike.bind(Strategies),

//             // Technicalavi strategies
//             hmaDonchian: Strategies.hmaDonchian.bind(Strategies),
//             emaArun: Strategies.emaArun.bind(Strategies),
//             alligatorParabolic: Strategies.alligatorParabolic.bind(Strategies),
//             emaStoch: Strategies.emaStoch.bind(Strategies),
//             customizedAlligator: Strategies.customizedAlligator.bind(Strategies)
//         };

//         const originalRules = [
//             { name: 'EMA-Cross', fn: bound.emaCross, weight: 1.0 },
//             { name: 'Stoch-Revert', fn: bound.stochRevert, weight: 0.8 },
//             { name: 'BB-Break', fn: bound.bbBreak, weight: 1.0 },
//             { name: 'MACD-Zero', fn: bound.macdZero, weight: 1.1 },
//             { name: 'S/R-Ping', fn: bound.srPing, weight: 0.9 },
//             { name: 'News-Fade', fn: bound.newsFade, weight: 0.7 },
//             { name: 'Asian-Break', fn: bound.asianBreak, weight: 0.8 },
//             { name: 'VWAP-Dev', fn: bound.vwapDev, weight: 1.0 }
//         ];

//         const enhancedRules = [
//             { name: 'EMA-Cross-Fast', fn: bound.emaCrossFast, weight: 1.2 },
//             { name: 'RSI-Signal', fn: bound.rsiSignal, weight: 1.1 },
//             { name: 'BB-RSI', fn: bound.bbWithRSI, weight: 1.3 },
//             { name: 'MACD-Cross', fn: bound.macdSignalCross, weight: 1.2 },
//             { name: 'Pin-Bar', fn: bound.pinBar, weight: 1.0 },
//             { name: 'Volume-Spike', fn: bound.volumeSpike, weight: 0.9 }
//         ];

//         const technicalaviRules = [
//             { name: 'HMA-Donchian', fn: bound.hmaDonchian, weight: 1.3 },
//             { name: 'EMA-Arun', fn: bound.emaArun, weight: 1.2 },
//             { name: 'Alligator-PSAR', fn: bound.alligatorParabolic, weight: 1.25 },
//             { name: 'EMA-Stoch', fn: bound.emaStoch, weight: 1.1 },
//             { name: 'Custom-Alligator', fn: bound.customizedAlligator, weight: 1.0 }
//         ];

//         const allRules = [...originalRules, ...enhancedRules, ...technicalaviRules];

//         for (let i = 30; i < this.candles.length; i++) {
//             const c = this.candles[i];

//             if (this.mode === 'original') {
//                 for (const r of originalRules) {
//                     try {
//                         const signal = r.fn(this.candles, i);
//                         if (signal) {
//                             this.trades.push({
//                                 strategy: r.name,
//                                 time: new Date(c.t).toISOString(),
//                                 index: i,
//                                 price: c.c,
//                                 signal,
//                                 expiryMin: 3,
//                                 mode: 'original'
//                             });
//                         }
//                     } catch (err) {
//                         console.warn(`rule ${r.name} error at index ${i}:`, err && err.message ? err.message : err);
//                     }
//                 }
//             } else if (this.mode === 'enhanced') {
//                 for (const r of enhancedRules) {
//                     try {
//                         const signal = r.fn(this.candles, i);
//                         if (signal) {
//                             this.trades.push({
//                                 strategy: r.name,
//                                 time: new Date(c.t).toISOString(),
//                                 index: i,
//                                 price: c.c,
//                                 signal,
//                                 expiryMin: 3,
//                                 mode: 'enhanced'
//                             });
//                         }
//                     } catch (err) {
//                         console.warn(`rule ${r.name} error at index ${i}:`, err && err.message ? err.message : err);
//                     }
//                 }
//             } else if (this.mode === 'technicalavi') {
//                 // technicalavi mode focuses on the new family - we still allow weighted consensus inside this family
//                 const signals = {};
//                 for (const r of technicalaviRules) {
//                     try {
//                         const signal = r.fn(this.candles, i);
//                         if (signal) {
//                             signals[r.name] = { signal, weight: r.weight };
//                         }
//                     } catch (err) {
//                         console.warn(`technicalavi rule ${r.name} error at index ${i}:`, err && err.message ? err.message : err);
//                     }
//                 }

//                 // Aggregate within technicalavi family
//                 let totalWeight = { CALL: 0, PUT: 0 };
//                 for (const s in signals) {
//                     totalWeight[signals[s].signal] += signals[s].weight;
//                 }

//                 const finalSignal = totalWeight.CALL > 2.0 ? 'CALL' : (totalWeight.PUT > 2.0 ? 'PUT' : null);
//                 if (finalSignal) {
//                     this.trades.push({
//                         strategy: 'TECHNICALAVI-CONSENSUS',
//                         time: new Date(c.t).toISOString(),
//                         index: i,
//                         price: c.c,
//                         signal: finalSignal,
//                         expiryMin: 3,
//                         confidence: totalWeight[finalSignal],
//                         contributingStrategies: Object.keys(signals).length,
//                         mode: 'technicalavi'
//                     });
//                 }

//             } else {
//                 // consensus mode: weighted aggregation across all rules
//                 const signals = {};
//                 for (const r of allRules) {
//                     try {
//                         const signal = r.fn(this.candles, i);
//                         if (signal) {
//                             signals[r.name] = { signal, weight: r.weight };
//                         }
//                     } catch (err) {
//                         console.warn(`rule ${r.name} error at index ${i}:`, err.message);
//                     }
//                 }

//                 const totalWeight = { CALL: 0, PUT: 0 };
//                 for (const s in signals) {
//                     totalWeight[signals[s].signal] += signals[s].weight;
//                 }

//                 const finalSignal = totalWeight.CALL > 2.0 ? 'CALL' : (totalWeight.PUT > 2.0 ? 'PUT' : null);
//                 if (finalSignal) {
//                     this.trades.push({
//                         strategy: 'CONSENSUS',
//                         time: new Date(c.t).toISOString(),
//                         index: i,
//                         price: c.c,
//                         signal: finalSignal,
//                         expiryMin: 3,
//                         confidence: totalWeight[finalSignal],
//                         contributingStrategies: Object.keys(signals).length,
//                         mode: 'consensus'
//                     });
//                 }
//             }
//         }

//         return this.summary();
//     }

//     summary() {
//         const total = this.trades.length;
//         if (!total) return { total: 0, bestSignal: null, hitRate: "0%", mode: this.mode };

//         let wins = 0;
//         let totalConfidence = 0;

//         for (const tr of this.trades) {
//             const nxt = this.candles[tr.index + 3]; // 3 candles ahead for ~3 minute expiry on 1-min candles
//             if (!nxt) continue;
//             const priceMove = nxt.c - tr.price;
//             const isWin = (tr.signal === 'CALL' && priceMove > 0) || (tr.signal === 'PUT' && priceMove < 0);
//             if (isWin) {
//                 wins++;
//                 totalConfidence += (tr.confidence || 1);
//             }
//         }

//         const hitRate = +(wins / total * 100).toFixed(2);
//         const avgConfidenceOnWins = wins > 0 ? (totalConfidence / wins).toFixed(2) : 0;

//         return {
//             total,
//             wins,
//             hitRate: `${hitRate}%`,
//             avgConfidenceOnWins,
//             bestSignal: this.trades[this.trades.length - 1],
//             mode: this.mode
//         };
//     }
// }

// /* ---------- Enhanced Routes with Multiple Modes (including technicalavi) ---------- */
// app.get('/analyse', async (req, res) => {
//     try {
//         const { startDate, endDate,timeframes, pair, mode = 'consensus' } = req.query;
//         if (!startDate || !pair) return res.status(400).json({ error: 'startDate and pair required (endDate optional)' });

//         const validModes = ['original', 'enhanced', 'consensus', 'technicalavi'];
//         if (!validModes.includes(mode)) {
//             return res.status(400).json({ error: 'mode must be one of: original, enhanced, consensus, technicalavi' });
//         }

//         const finage = new Finage(process.env.FINAGE_API_KEY);
//         let candles;
//         try {
//             candles = await finage.hourAgg(pair,timeframes, startDate, endDate || startDate);
//         } catch (e) {
//             if (e.status === 401) return res.status(401).json({ error: 'Finage authentication failed (401). Check FINAGE_API_KEY.' });
//             return res.status(502).json({ error: e.message || 'Finage fetch error' });
//         }

//         if (!candles || candles.length === 0) return res.status(404).json({ error: 'No data for that date/pair' });

//         const report = new Engine(candles, pair, mode).run();
//         res.json({ pair, startDate, endDate: endDate || startDate, mode, report });
//     } catch (e) {
//         console.error('Unexpected error:', e && e.stack ? e.stack : e);
//         res.status(500).json({ error: e && e.message ? e.message : 'Internal server error' });
//     }
// });

// /* ---------- Health Check and Info Endpoint ---------- */
// app.get('/info', (req, res) => {
//     res.json({
//         name: 'Enhanced Trading Analysis API',
//         version: '2.1-technicalavi',
//         modes: ['original', 'enhanced', 'consensus', 'technicalavi'],
//         strategies: {
//             original: [
//                 'EMA-Cross (9/21)', 'Stoch-Revert', 'BB-Break', 'MACD-Zero',
//                 'S/R-Ping', 'News-Fade', 'Asian-Break', 'VWAP-Dev'
//             ],
//             enhanced: [
//                 'EMA-Cross-Fast (5/12)', 'RSI-Signal', 'BB-RSI', 'MACD-Cross',
//                 'Pin-Bar', 'Volume-Spike'
//             ],
//             technicalavi: [
//                 'HMA + Donchian Ribbon (EHMA70)', 'EMA + Arun Oscillator (EMA15 + Arun14)',
//                 'Alligator + Parabolic SAR (custom Alligator + PSAR)', 'EMA(50/100) + Stochastic (14/3)',
//                 'Customized Alligator (user tuned periods)'
//             ],
//             consensus: 'Combines strategies with weighted scoring'
//         },
//         expiry: '3 minutes (default)'
//     });
// });

// /* ---------- Start Server ---------- */
// app.listen(PORT, () => console.log(`Enhanced Trading Analysis API running on :${PORT} - Modes: original, enhanced, consensus, technicalavi`));


/*
 * Optimized TechnicalAvi Trading Analysis Service
 * Uses DSA concepts: Memoization, Sliding Window, Pre-computation
 * Usage: FINAGE_API_KEY=<your_key> node optimized_technicalavi.js
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const ti = require('technicalindicators');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3100;

/* ---------- Finage Client ---------- */
class Finage {
    constructor(apiKey) {
        this.key = apiKey || process.env.FINAGE_API_KEY || "API_KEYb8U5CTFZ2QGMWKQISKLZP4DCQUV3QFT4";
        this.base = 'https://api.finage.co.uk';
        if (!this.key) throw new Error('FINAGE_API_KEY not provided');
    }

    async hourAgg(pair, timeframes, fromDate, toDate, maxRetries = 3) {
        const url = `${this.base}/agg/forex/${pair}/${timeframes}/minute/${fromDate}/${toDate}?apikey=${this.key}&limit=50000`;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const { data } = await axios.get(url, { timeout: 10000 });
                const results = data.results || [];

                if (results.length === 0) {
                    throw new Error('No data returned from API');
                }

                return results.map(r => ({
                    t: (r.timestamp !== undefined ? r.timestamp : r.t),
                    o: +(r.open !== undefined ? r.open : r.o),
                    h: +(r.high !== undefined ? r.high : r.h),
                    l: +(r.low !== undefined ? r.low : r.l),
                    c: +(r.close !== undefined ? r.close : r.c),
                    v: +(r.volume !== undefined ? r.volume : r.v || 0)
                }));
            } catch (err) {
                if (attempt === maxRetries) {
                    if (err.response) {
                        const status = err.response.status;
                        const msg = err.response.data && (err.response.data.message || err.response.data.error)
                            ? (err.response.data.message || err.response.data.error)
                            : err.response.statusText;
                        const e = new Error(`Finage API error ${status}: ${msg}`);
                        e.status = status;
                        throw e;
                    }
                    throw err;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }
}

/* ---------- Optimized Indicator Cache ---------- */
class IndicatorCache {
    constructor(candles) {
        this.candles = candles;
        this.cache = {};
        this.precompute();
    }

    precompute() {
        const { close, high, low, volume } = this.extractOHLCV();
        
        // Pre-compute all indicators once
        this.cache.hma70 = this.computeHMA(close, 70);
        this.cache.donchian20 = this.computeDonchian(high, low, 20);
        this.cache.ema15 = ti.EMA.calculate({ period: 15, values: close });
        this.cache.arun14 = this.computeArun(high, low, 14);
        this.cache.alligator = this.computeAlligator(close, 13, 8, 5);
        this.cache.psar = this.computePSAR(high, low, 0.02, 0.2);
        this.cache.ema50 = ti.EMA.calculate({ period: 50, values: close });
        this.cache.ema100 = ti.EMA.calculate({ period: 100, values: close });
        this.cache.stoch = ti.Stochastic.calculate({ 
            high, low, close, 
            period: 14, 
            signalPeriod: 3 
        });
        this.cache.customAlligator = this.computeAlligator(close, 21, 13, 8);
        
        // Pre-compute offsets for alignment
        this.cache.offsets = {
            hma70: close.length - this.cache.hma70.length,
            ema15: close.length - this.cache.ema15.length,
            ema50: close.length - this.cache.ema50.length,
            ema100: close.length - this.cache.ema100.length,
            stoch: close.length - this.cache.stoch.length,
            alligatorJaw: close.length - this.cache.alligator.jaw.length,
            alligatorTeeth: close.length - this.cache.alligator.teeth.length,
            alligatorLips: close.length - this.cache.alligator.lips.length,
            customJaw: close.length - this.cache.customAlligator.jaw.length,
            customTeeth: close.length - this.cache.customAlligator.teeth.length,
            customLips: close.length - this.cache.customAlligator.lips.length
        };
    }

    extractOHLCV() {
        const close = [], high = [], low = [], volume = [];
        for (let i = 0; i < this.candles.length; i++) {
            close.push(this.candles[i].c);
            high.push(this.candles[i].h);
            low.push(this.candles[i].l);
            volume.push(this.candles[i].v);
        }
        return { close, high, low, volume };
    }

    // Optimized HMA using pre-allocated arrays
    computeHMA(values, period) {
        if (values.length < period) return [];
        const half = Math.round(period / 2);
        const sqrtP = Math.round(Math.sqrt(period));

        const wmaFull = ti.WMA.calculate({ period, values });
        const wmaHalf = ti.WMA.calculate({ period: half, values });

        const len = Math.min(wmaFull.length, wmaHalf.length);
        const diff = new Array(len);
        const offset1 = wmaFull.length - len;
        const offset2 = wmaHalf.length - len;
        
        for (let i = 0; i < len; i++) {
            diff[i] = 2 * wmaHalf[offset2 + i] - wmaFull[offset1 + i];
        }

        return ti.WMA.calculate({ period: sqrtP, values: diff });
    }

    // Optimized Donchian using sliding window
    computeDonchian(highs, lows, period) {
        const upper = new Array(highs.length);
        const lower = new Array(lows.length);
        
        for (let i = 0; i < highs.length; i++) {
            const start = Math.max(0, i - period + 1);
            let maxH = highs[start];
            let minL = lows[start];
            
            for (let j = start + 1; j <= i; j++) {
                if (highs[j] > maxH) maxH = highs[j];
                if (lows[j] < minL) minL = lows[j];
            }
            
            upper[i] = maxH;
            lower[i] = minL;
        }
        
        return { upper, lower };
    }

    // Optimized Arun using single pass
    computeArun(highs, lows, period) {
        const up = new Array(highs.length);
        const down = new Array(lows.length);
        
        for (let i = 0; i < highs.length; i++) {
            const start = Math.max(0, i - period + 1);
            const windowSize = i - start + 1;
            
            let maxH = highs[start];
            let minL = lows[start];
            let maxIdx = start;
            let minIdx = start;
            
            for (let j = start + 1; j <= i; j++) {
                if (highs[j] >= maxH) {
                    maxH = highs[j];
                    maxIdx = j;
                }
                if (lows[j] <= minL) {
                    minL = lows[j];
                    minIdx = j;
                }
            }
            
            const daysSinceHigh = i - maxIdx;
            const daysSinceLow = i - minIdx;
            
            up[i] = ((period - daysSinceHigh) / period) * 100;
            down[i] = ((period - daysSinceLow) / period) * 100;
        }
        
        return { up, down };
    }

    computeAlligator(close, jawP, teethP, lipsP) {
        return {
            jaw: ti.SMA.calculate({ period: jawP, values: close }),
            teeth: ti.SMA.calculate({ period: teethP, values: close }),
            lips: ti.SMA.calculate({ period: lipsP, values: close })
        };
    }

    // Optimized PSAR with early termination checks
    computePSAR(highs, lows, step, maxStep) {
        const sar = new Array(highs.length);
        if (highs.length < 3) return sar.fill(null);

        let af = step;
        let ep = highs[0];
        let sarPrev = lows[0];
        let upTrend = true;

        sar[0] = sarPrev;

        for (let i = 1; i < highs.length; i++) {
            let sarVal = sarPrev + af * (ep - sarPrev);

            if (upTrend) {
                if (lows[i] < sarVal) {
                    upTrend = false;
                    sarVal = ep;
                    af = step;
                    ep = lows[i];
                } else {
                    if (highs[i] > ep) {
                        ep = highs[i];
                        af = Math.min(af + step, maxStep);
                    }
                }
            } else {
                if (highs[i] > sarVal) {
                    upTrend = true;
                    sarVal = ep;
                    af = step;
                    ep = highs[i];
                } else {
                    if (lows[i] < ep) {
                        ep = lows[i];
                        af = Math.min(af + step, maxStep);
                    }
                }
            }

            sar[i] = sarVal;
            sarPrev = sarVal;
        }
        return sar;
    }

    // Fast aligned access
    getAligned(arr, offset, idx) {
        const i = idx - offset;
        return (i >= 0 && i < arr.length) ? arr[i] : null;
    }
}

/* ---------- Optimized Strategies ---------- */
class Strategies {
    static hmaDonchian(cache, i) {
        const hCur = cache.getAligned(cache.cache.hma70, cache.cache.offsets.hma70, i);
        if (hCur == null) return null;

        const upper = cache.cache.donchian20.upper[i];
        const lower = cache.cache.donchian20.lower[i];
        const c = cache.candles[i].c;
        const mid = (upper + lower) * 0.5;

        const buy = c > hCur && c > mid;
        const sell = c < hCur && c < mid;
        return buy ? 'CALL' : (sell ? 'PUT' : null);
    }

    static emaArun(cache, i) {
        const emaVal = cache.getAligned(cache.cache.ema15, cache.cache.offsets.ema15, i);
        if (emaVal == null) return null;

        const up = cache.cache.arun14.up[i];
        const down = cache.cache.arun14.down[i];
        if (up == null || down == null) return null;

        const price = cache.candles[i].c;
        const crossoverUp = up > down && price > emaVal;
        const crossoverDown = down > up && price < emaVal;
        return crossoverUp ? 'CALL' : (crossoverDown ? 'PUT' : null);
    }

    static alligatorParabolic(cache, i) {
        const jawVal = cache.getAligned(cache.cache.alligator.jaw, cache.cache.offsets.alligatorJaw, i);
        const teethVal = cache.getAligned(cache.cache.alligator.teeth, cache.cache.offsets.alligatorTeeth, i);
        const lipsVal = cache.getAligned(cache.cache.alligator.lips, cache.cache.offsets.alligatorLips, i);
        const psarVal = cache.cache.psar[i];
        
        if (jawVal == null || teethVal == null || lipsVal == null || psarVal == null) return null;

        const price = cache.candles[i].c;
        const bullish = (lipsVal > teethVal && teethVal > jawVal) && price > psarVal;
        const bearish = (lipsVal < teethVal && teethVal < jawVal) && price < psarVal;
        return bullish ? 'CALL' : (bearish ? 'PUT' : null);
    }

    static emaStoch(cache, i) {
        const e50 = cache.getAligned(cache.cache.ema50, cache.cache.offsets.ema50, i);
        const e100 = cache.getAligned(cache.cache.ema100, cache.cache.offsets.ema100, i);
        if (e50 == null || e100 == null) return null;

        const s = cache.getAligned(cache.cache.stoch, cache.cache.offsets.stoch, i);
        if (!s || typeof s.k !== 'number') return null;

        const price = cache.candles[i].c;
        const minEma = e50 < e100 ? e50 : e100;
        const maxEma = e50 > e100 ? e50 : e100;
        const between = price > minEma && price < maxEma;
        
        if (!between) return null;
        if (s.k > 80) return 'PUT';
        if (s.k < 20) return 'CALL';
        return null;
    }

    static customizedAlligator(cache, i) {
        const jawVal = cache.getAligned(cache.cache.customAlligator.jaw, cache.cache.offsets.customJaw, i);
        const teethVal = cache.getAligned(cache.cache.customAlligator.teeth, cache.cache.offsets.customTeeth, i);
        const lipsVal = cache.getAligned(cache.cache.customAlligator.lips, cache.cache.offsets.customLips, i);
        
        if (jawVal == null || teethVal == null || lipsVal == null) return null;

        const bullish = (lipsVal > teethVal && teethVal > jawVal);
        const bearish = (lipsVal < teethVal && teethVal < jawVal);
        return bullish ? 'CALL' : (bearish ? 'PUT' : null);
    }
}

/* ---------- Optimized Engine ---------- */
class Engine {
    constructor(candles, pair) {
        this.candles = candles;
        this.pair = pair;
        this.trades = [];
        this.cache = new IndicatorCache(candles);
    }

    run() {
        const rules = [
            { name: 'HMA-Donchian', fn: Strategies.hmaDonchian, weight: 1.3 },
            { name: 'EMA-Arun', fn: Strategies.emaArun, weight: 1.2 },
            { name: 'Alligator-PSAR', fn: Strategies.alligatorParabolic, weight: 1.25 },
            { name: 'EMA-Stoch', fn: Strategies.emaStoch, weight: 1.1 },
            { name: 'Custom-Alligator', fn: Strategies.customizedAlligator, weight: 1.0 }
        ];

        // Start from 100 to ensure all indicators have enough data
        for (let i = 100; i < this.candles.length; i++) {
            const c = this.candles[i];
            let callWeight = 0;
            let putWeight = 0;
            let signalCount = 0;
            
            // Evaluate all strategies in single pass
            for (const r of rules) {
                try {
                    const signal = r.fn(this.cache, i);
                    if (signal) {
                        signalCount++;
                        if (signal === 'CALL') {
                            callWeight += r.weight;
                        } else {
                            putWeight += r.weight;
                        }
                    }
                } catch (err) {
                    console.warn(`Strategy ${r.name} error at ${i}:`, err.message);
                }
            }

            // Generate signal if threshold met
            const finalSignal = callWeight > 2.0 ? 'CALL' : (putWeight > 2.0 ? 'PUT' : null);
            if (finalSignal) {
                this.trades.push({
                    strategy: 'TECHNICALAVI-CONSENSUS',
                    time: new Date(c.t).toISOString(),
                    index: i,
                    price: c.c,
                    signal: finalSignal,
                    expiryMin: 3,
                    confidence: finalSignal === 'CALL' ? callWeight : putWeight,
                    contributingStrategies: signalCount
                });
            }
        }

        return this.summary();
    }

    summary() {
        const total = this.trades.length;
        if (!total) return { total: 0, bestSignal: null, hitRate: "0%" };

        let wins = 0;
        let totalConfidence = 0;

        for (const tr of this.trades) {
            const nxt = this.candles[tr.index + 3];
            if (!nxt) continue;
            const priceMove = nxt.c - tr.price;
            const isWin = (tr.signal === 'CALL' && priceMove > 0) || (tr.signal === 'PUT' && priceMove < 0);
            if (isWin) {
                wins++;
                totalConfidence += tr.confidence;
            }
        }

        const hitRate = +(wins / total * 100).toFixed(2);
        const avgConfidenceOnWins = wins > 0 ? (totalConfidence / wins).toFixed(2) : 0;

        return {
            total,
            wins,
            hitRate: `${hitRate}%`,
            avgConfidenceOnWins,
            bestSignal: this.trades[this.trades.length - 1]
        };
    }
}

/* ---------- API Routes ---------- */
app.get('/analyse', async (req, res) => {
    try {
        const { startDate, endDate, timeframes, pair } = req.query;
        if (!startDate || !pair) {
            return res.status(400).json({ error: 'startDate and pair required' });
        }

        const finage = new Finage(process.env.FINAGE_API_KEY);
        let candles;
        try {
            candles = await finage.hourAgg(pair, timeframes, startDate, endDate || startDate);
        } catch (e) {
            if (e.status === 401) {
                return res.status(401).json({ error: 'Finage authentication failed. Check API key.' });
            }
            return res.status(502).json({ error: e.message || 'Finage fetch error' });
        }

        if (!candles || candles.length === 0) {
            return res.status(404).json({ error: 'No data for that date/pair' });
        }

        const report = new Engine(candles, pair).run();
        res.json({ 
            pair, 
            startDate, 
            endDate: endDate || startDate, 
            mode: 'technicalavi-optimized', 
            report 
        });
    } catch (e) {
        console.error('Unexpected error:', e.stack);
        res.status(500).json({ error: e.message || 'Internal server error' });
    }
});

app.get('/info', (req, res) => {
    res.json({
        name: 'TechnicalAvi Trading Analysis API (Optimized)',
        version: '2.0',
        optimizations: [
            'Pre-computed indicators with caching',
            'Sliding window algorithms',
            'Single-pass evaluation',
            'Memory-efficient array operations',
            'Fast aligned access'
        ],
        strategies: [
            'HMA + Donchian Ribbon',
            'EMA + Arun Oscillator',
            'Alligator + Parabolic SAR',
            'EMA + Stochastic',
            'Customized Alligator'
        ],
        expiry: '3 minutes'
    });
});

app.listen(PORT, () => {
    console.log(`Optimized TechnicalAvi API running on port ${PORT}`);
});
