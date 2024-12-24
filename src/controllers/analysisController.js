// src/controllers/analysisController.js
class AnalysisController {
  constructor(apiService, analysisService) {
    this.apiService = apiService;
    this.analysisService = analysisService;
    this.analyzeMarket = this.analyzeMarket.bind(this);
  }

  async analyzeMarket(req, res) {
    try {
      const { pair, resolution } = req.query;

      if (!pair || !resolution) {
        return res.status(400).json({
          error: "Missing required parameters: pair and resolution",
        });
      }

      const forexData = await this.apiService.getForexData(pair, resolution);

      // Check if we have valid data
      if (!forexData || !Array.isArray(forexData)) {
        throw new Error("Invalid data received from API");
      }

      const trendAnalysis = this.analysisService.analyzeTrend(forexData);
      const keyLevels = this.analysisService.identifyKeyLevels(forexData);

      res.json({
        pair,
        resolution,
        analysis: {
          trend: trendAnalysis,
          keyLevels,
          lastUpdate: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
}

module.exports = AnalysisController;