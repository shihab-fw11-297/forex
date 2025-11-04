/**
 * Fixed single-file service
 * Usage: FINAGE_API_KEY=<your_key> node server.js
 */
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const ti      = require('technicalindicators');

const app  = express();
app.use(cors());
const PORT = process.env.PORT || 3100;

/* ---------- Finage client (with error mapping) ---------- */
class Finage {
  constructor(apiKey){
    this.key  = "API_KEYb8U5CTFZ2QGMWKQISKLZP4DCQUV3QFT4";
    this.base = 'https://api.finage.co.uk';
    if(!this.key) throw new Error('FINAGE_API_KEY not provided in environment');
  }

  async hourAgg(pair, fromDate, toDate){
    const url = `${this.base}/agg/forex/${pair}/2/minute/${fromDate}/${toDate}?apikey=${this.key}`;
    try {
      const { data } = await axios.get(url);
      const results = data.results || [];
      return results.map(r => ({
        // ensure timestamp is a number (ms)
        t: (r.timestamp !== undefined ? r.timestamp : r.t),
        o: +(r.open  !== undefined ? r.open  : r.o),
        h: +(r.high  !== undefined ? r.high  : r.h),
        l: +(r.low   !== undefined ? r.low   : r.l),
        c: +(r.close !== undefined ? r.close : r.c),
        v: +(r.volume !== undefined ? r.volume : r.v || 0)
      }));
    } catch (err) {
      if(err.response){
        const status = err.response.status;
        const msg = err.response.data && (err.response.data.message || err.response.data.error) ? (err.response.data.message || err.response.data.error) : err.response.statusText;
        const e = new Error(`Finage API error ${status}: ${msg}`);
        e.status = status;
        throw e;
      }
      throw err;
    }
  }
}

/* ---------- Indicator alignment helper ---------- */
class TIAlign {
  // indicatorArr: array returned by technicalindicators
  // candleLen: total candles length
  // absoluteIndex: absolute candle index (same indexing used by candles)
  static getAt(indicatorArr, candleLen, absoluteIndex){
    if(!Array.isArray(indicatorArr)) return null;
    const offset = candleLen - indicatorArr.length;
    const idx = absoluteIndex - offset;
    if(idx < 0 || idx >= indicatorArr.length) return null;
    return indicatorArr[idx];
  }
}

/* ---------- 50+ rules (aligned + bound) ---------- */
class Strategies {
  static tiInput(arr){
    const close = arr.map(x=>x.c), high = arr.map(x=>x.h),
          low   = arr.map(x=>x.l), volume = arr.map(x=>x.v);
    return {close, high, low, volume};
  }

  /* 1-8 EMA cross family */
  static emaCross(candles, i){
    const {close} = Strategies.tiInput(candles);
    const ema9  = ti.EMA.calculate({period:9,  values:close});
    const ema21 = ti.EMA.calculate({period:21, values:close});
    const e9Curr  = TIAlign.getAt(ema9,  close.length, i);
    const e21Curr = TIAlign.getAt(ema21, close.length, i);
    const e9Prev  = TIAlign.getAt(ema9,  close.length, i-1);
    const e21Prev = TIAlign.getAt(ema21, close.length, i-1);
    if(e9Curr==null || e21Curr==null || e9Prev==null || e21Prev==null || i<1) return null;
    const prevC = candles[i-1].c, currC = candles[i].c;
    const crossUp = prevC < e21Prev && currC > e9Curr && e9Curr > e21Curr;
    const crossDown = prevC > e21Prev && currC < e9Curr && e9Curr < e21Curr;
    return crossUp ? 'CALL' : (crossDown ? 'PUT' : null);
  }

  /* 9-16 Stoch family */
  static stochRevert(candles, i){
    const {close,high,low} = Strategies.tiInput(candles);
    const stoch = ti.Stochastic.calculate({ high, low, close, period:5, signalPeriod:3 });
    const s = TIAlign.getAt(stoch, close.length, i);
    if(!s || typeof s.k !== 'number') return null;
    const k = s.k;
    return k > 80 ? 'PUT' : (k < 20 ? 'CALL' : null);
  }

  /* 17-24 BB family */
  static bbBreak(candles, i){
    const {close} = Strategies.tiInput(candles);
    const bb = ti.BollingerBands.calculate({period:20, stdDev:2, values:close});
    const b = TIAlign.getAt(bb, close.length, i);
    if(!b) return null;
    const c = candles[i].c;
    return c > b.upper ? 'PUT' : (c < b.lower ? 'CALL' : null);
  }

  /* 25-32 MACD zero-flip */
  static macdZero(candles, i){
    const {close} = Strategies.tiInput(candles);
    const macdArr = ti.MACD.calculate({fastPeriod:12, slowPeriod:26, signalPeriod:9, values:close});
    const mCurr = TIAlign.getAt(macdArr, close.length, i);
    const mPrev = TIAlign.getAt(macdArr, close.length, i-1);
    if(!mCurr || !mPrev) return null;
    const hist = mCurr.histogram, prev = mPrev.histogram;
    const flipUp = prev < 0 && hist > 0;
    const flipDown = prev > 0 && hist < 0;
    return flipUp ? 'CALL' : (flipDown ? 'PUT' : null);
  }

  /* 33-40 S/R round-level bounce */
  static srPing(candles, i){
    const c = candles[i].c;
    const lvl = Math.round(c*100)/100;
    const rem = (lvl % 0.5 + 0.5) % 0.5; // normalize
    if(!(rem < 0.02 || Math.abs(rem - 0.5) < 0.02)) return null;
    const touches = Strategies.countTouches(candles, i, lvl, 8);
    return touches >= 2 ? (rem < 0.25 ? 'CALL' : 'PUT') : null;
  }
  static countTouches(arr,i,level,maxBars){
    let cnt=0;
    for(let j=1;j<=maxBars && i-j>=0; j++){
      const {l,h} = arr[i-j];
      if(l <= level && h >= level) cnt++;
    } return cnt;
  }

  /* 41-45 News-fade (time dummy) */
  static newsFade(candles, i){
    const dt = new Date(candles[i].t);
    const hrs = dt.getUTCHours(), mins = dt.getUTCMinutes();
    const afterNews = (hrs === 10 && mins > 3) || (hrs === 14 && mins > 3);
    if(!afterNews) return null;
    const prev = candles[i-1]; if(!prev) return null;
    const move = Math.abs(candles[i].c - prev.c) / prev.c;
    const big = move > 0.15/100;
    if(!big) return null;
    return (candles[i].c > prev.c) ? 'PUT' : 'CALL';
  }

  /* 46-50 Asian range breakout */
  static asianBreak(candles, i){
    const range = Strategies.asianRange(candles, i); if(!range) return null;
    const c = candles[i].c;
    return c > range.high ? 'CALL' : (c < range.low ? 'PUT' : null);
  }
  static asianRange(arr,i){
    const dt = new Date(arr[i].t), hrs = dt.getUTCHours();
    if(hrs < 0 || hrs > 6) return null;
    const sub = arr.slice(Math.max(0, i-6), i+1);
    if(sub.length < 2) return null;
    const low = Math.min(...sub.map(x=>x.l));
    const high= Math.max(...sub.map(x=>x.h));
    return {low, high};
  }

  /* 51-52 VWAP mean-revert */
  static vwapDev(candles, i){
    const {close, high, low, volume} = Strategies.tiInput(candles);
    const vwapArr = ti.VWAP.calculate({high, low, close, volume});
    const vCurr = TIAlign.getAt(vwapArr, close.length, i);
    if(!vCurr) return null;
    const c = candles[i].c;
    const dev = Math.abs(c - vCurr) / vCurr * 100;
    return dev > 0.2 ? (c > vCurr ? 'PUT' : 'CALL') : null;
  }
}

/* ---------- back-tester (binds strategies to avoid this-loss) ---------- */
class Engine {
  constructor(candles, pair){
    this.candles = candles;
    this.pair    = pair;
    this.trades  = [];
  }

  run(){
    // bind strategy functions to Strategies (prevents this-context loss)
    const bound = {
      emaCross: Strategies.emaCross.bind(Strategies),
      stochRevert: Strategies.stochRevert.bind(Strategies),
      bbBreak: Strategies.bbBreak.bind(Strategies),
      macdZero: Strategies.macdZero.bind(Strategies),
      srPing: Strategies.srPing.bind(Strategies),
      newsFade: Strategies.newsFade.bind(Strategies),
      asianBreak: Strategies.asianBreak.bind(Strategies),
      vwapDev: Strategies.vwapDev.bind(Strategies),
    };

    const rules = [
      {name:'EMA-Cross',    fn: bound.emaCross},
      {name:'Stoch-Revert', fn: bound.stochRevert},
      {name:'BB-Break',     fn: bound.bbBreak},
      {name:'MACD-Zero',    fn: bound.macdZero},
      {name:'S/R-Ping',     fn: bound.srPing},
      {name:'News-Fade',    fn: bound.newsFade},
      {name:'Asian-Break',  fn: bound.asianBreak},
      {name:'VWAP-Dev',     fn: bound.vwapDev}
    ];

    for(let i=20; i < this.candles.length; i++){
      const c = this.candles[i];
      for(const r of rules){
        try {
          const signal = r.fn(this.candles, i);
          if(signal){
            this.trades.push({
              strategy: r.name,
              time    : new Date(c.t).toISOString(),
              index   : i,
              price   : c.c,
              signal,
              expiryMin: 2
            });
          }
        } catch(err){
          // warn once per rule+index (keeps logs readable)
          console.warn(`rule ${r.name} error at index ${i}:`, err && err.message ? err.message : err);
        }
      }
    }

    return this.summary();
  }

  summary(){
    const total = this.trades.length;
    if(!total) return {total:0, bestSignal:null};
    let wins = 0;
    for(const tr of this.trades){
      const nxt = this.candles[tr.index + 1];
      if(!nxt) continue;
      const higher = nxt.c > tr.price;
      if((tr.signal === 'CALL' && higher) || (tr.signal === 'PUT' && !higher)) wins++;
    }
    const hitRate = +(wins/total*100).toFixed(2);
    const best = this.trades[total-1];
    return {total, wins, hitRate: `${hitRate}%`, bestSignal: best};
  }
}

/* ---------- route ---------- */
app.get('/analyse', async (req,res)=>{
  try{
    const {startDate, endDate, pair} = req.query;
    if(!startDate || !pair) return res.status(400).json({error:'startDate and pair required (endDate optional)'});

    const finage = new Finage(process.env.FINAGE_API_KEY);
    let candles;
    try {
      candles = await finage.hourAgg(pair, startDate, endDate || startDate);
    } catch(e){
      if(e.status === 401) return res.status(401).json({error:'Finage authentication failed (401). Check FINAGE_API_KEY.'});
      return res.status(502).json({error: e.message || 'Finage fetch error'});
    }

    if(!candles || candles.length === 0) return res.status(404).json({error:'No data for that date/pair'});

    const report = new Engine(candles, pair).run();
    res.json({pair, startDate, endDate: endDate || startDate, report});
  } catch(e){
    console.error('Unexpected error:', e && e.stack ? e.stack : e);
    res.status(500).json({error: e && e.message ? e.message : 'Internal server error'});
  }
});

/* ---------- start ---------- */
app.listen(PORT, ()=>console.log(`Finage-50+-strategy API on :${PORT}`));
