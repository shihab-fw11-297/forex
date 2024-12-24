const express = require("express");
const router = express.Router();
const ApiService = require("../services/apiService");
const AnalysisService = require("../services/analysisService");
const AnalysisController = require("../controllers/analysisController");

// Initialize services and controller
const apiService = new ApiService();
const analysisService = new AnalysisService();
const analysisController = new AnalysisController(apiService, analysisService);

// Routes
router.get("/analyze", (req, res) =>
  analysisController.analyzeMarket(req, res)
);

module.exports = router;