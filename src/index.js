const express = require("express");
const app = express();
const PORT = 3000;
const mainRouter = require("./routes/index");

app.use(express.json());

app.use("/api", mainRouter);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
