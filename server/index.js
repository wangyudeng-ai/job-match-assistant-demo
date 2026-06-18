require("dotenv").config();

const { createApp } = require("./app.js");

const PORT = 3000;

createApp().listen(PORT, () => {
  console.log(`Resume structure server listening on http://localhost:${PORT}`);
});
