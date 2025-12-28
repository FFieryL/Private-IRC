const express = require("express");
const app = express();
app.use(express.json());

let messages = [];
const MAX_MESSAGES = 30;

// Keep track of pending long-poll requests
let pendingPolls = [];

app.post("/send", (req, res) => {
    const { user, text, channel = "global" } = req.body;
    const message = { user, text, channel, time: Date.now() };

    messages.push(message);
    if (messages.length > MAX_MESSAGES) messages.shift();

    // Respond to all pending long-poll requests immediately
    pendingPolls.forEach(pollRes => {
        pollRes.json([message]);
    });
    pendingPolls = [];

    res.sendStatus(200);
});

app.get("/poll", (req, res) => {
    const since = Number(req.query.since || 0);

    // Check if there are new messages already
    const newMessages = messages.filter(m => m.time > since);
    if (newMessages.length > 0) {
        return res.json(newMessages);
    }

    // If no new messages, hold the request for up to 30 seconds
    const timeout = setTimeout(() => {
        // Remove this response from pending if timed out
        pendingPolls = pendingPolls.filter(r => r !== res);
        res.json([]); // return empty array if timeout
    }, 30000); // 30s timeout

    // Add this response to the pending list
    pendingPolls.push(res);

    // Clean up if the connection closes
    req.on("close", () => {
        clearTimeout(timeout);
        pendingPolls = pendingPolls.filter(r => r !== res);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("CT IRC relay running"));
