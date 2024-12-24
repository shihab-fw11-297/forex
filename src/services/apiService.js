// src/services/apiService.js
const axios = require("axios");

// melibe9383@cctoolz.com -- 1eOcyOdUpKZXa0o0uLwVlESa
// kimasin761@chosenx.com -- 2cq2lQ49yOam6iJNYLpth9Q
// wojigex255@cctoolz.com -- kPInDDGvXm1ItuBioWX7pB
// cijopav982@cctoolz.com -- JGqUQ9Vrif4Tvjb2vcgAqu4L1
// toyali7286@cctoolz.com -- hS5nvs9txJYdUktGs1h60fIh1

class ApiService {
  constructor() {
    this.baseUrl = "https://fcsapi.com/api-v3/forex/history";
    this.accessKey = process.env.FCS_API_KEY || "hS5nvs9txJYdUktGs1h60fIh1";
  }

  async getForexData(pair, resolution) {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          symbol: pair,
          access_key: this.accessKey,
          period: resolution,
        },
      });

      const transformData = (data) => {
        return Object.values(data).map((entry) => ({
          t: entry.t,
          o: parseFloat(entry.o),
          h: parseFloat(entry.h),
          l: parseFloat(entry.l),
          c: parseFloat(entry.c),
        }));
      };

      const transformedData = transformData(response?.data?.response);
      return transformedData;
    } catch (error) {
      throw new Error(`Failed to fetch forex data: ${error.message}`);
    }
  }
}

module.exports = ApiService;