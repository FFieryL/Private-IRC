const express = require("express");
const app = express();
app.use(express.json());

let messages = [];
const MAX_MESSAGES = 30;

app.post("/send", (req, res) => {
  const { user, text, channel = "global" } = req.body;

  messages.push({ user, text, channel, time: Date.now() });
  if (messages.length > MAX_MESSAGES) messages.shift();

  res.sendStatus(200);
});

app.get("/poll", (req, res) => {
  const since = Number(req.query.since || 0);
  res.json(messages.filter(m => m.time > since));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("CT IRC relay running"));
