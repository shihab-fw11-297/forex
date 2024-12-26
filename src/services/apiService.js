// src/services/apiService.js
const axios = require("axios");

// melibe9383@cctoolz.com -- 1eOcyOdUpKZXa0o0uLwVlESa
// kimasin761@chosenx.com -- 2cq2lQ49yOam6iJNYLpth9Q
// wojigex255@cctoolz.com -- kPInDDGvXm1ItuBioWX7pB
// cijopav982@cctoolz.com -- JGqUQ9Vrif4Tvjb2vcgAqu4L1
// toyali7286@cctoolz.com -- hS5nvs9txJYdUktGs1h60fIh1
//https://api.finazon.io/latest/finazon/forex/time_series?ticker=EUR/USD&interval=1m&page=0&page_size=500&apikey=18535cbd97e2400d93f96802097d83c9af

function getFormattedDates() {
  const today = new Date();

  // Get tomorrow's date
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  // Get yesterday's date
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  // Helper function to format the date as YYYY-MM-DD
  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return {
    tomorrow: formatDate(tomorrow),
    yesterday: formatDate(yesterday)
  };
}

class ApiService {
  constructor() {
    // this.baseUrl = "https://api.finazon.io/latest/finazon/forex/time_series" || "https://fcsapi.com/api-v3/forex/history";
    // this.accessKey = process.env.FCS_API_KEY || "kPInDDGvXm1ItuBioWX7pB";
    // this.baseUrl = "https://api.finage.co.uk/agg/forex/USDJPY/1/minute/2024-12-25/2024-12-27?apikey=API_KEY0eCP3AS1W5VA426061GRKH7GQSZNLSNR"
  }

  async getForexData(pair, resolution) {
    try {
      const dates = getFormattedDates();
      const baseUrl = `https://api.finage.co.uk/agg/forex/${pair}/${resolution}/minute/${dates.yesterday}/${dates.tomorrow}?apikey=API_KEY0eCP3AS1W5VA426061GRKH7GQSZNLSNR`
      console.log(baseUrl);
      const response = await axios.get(baseUrl);
      // const response = await axios.get(this.baseUrl, {
      //   params: {
      //     // symbol: pair,
      //     ticker:pair,
      //     interval:resolution,
      //     page:0,
      //     page_size:500,
      //     apikey:"18535cbd97e2400d93f96802097d83c9af"
      //     // access_key: this.accessKey,
      //     // period: resolution,

      //   },
      // });

      // // console.log("response",response);
      // const transformData = (data) => {
      //   return Object.values(data).map((entry) => ({
      //     t: entry.t,
      //     o: parseFloat(entry.o),
      //     h: parseFloat(entry.h),
      //     l: parseFloat(entry.l),
      //     c: parseFloat(entry.c),
      //   }));
      // };

      // const transformedData = transformData(response?.data?.response);
      return response.data?.results;
    } catch (error) {
      throw new Error(`Failed to fetch forex data: ${error.message}`);
    }
  }
}

module.exports = ApiService;
