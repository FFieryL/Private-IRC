const express = require("express");
const app = express();
app.use(express.json());

let messages = [];
const MAX_MESSAGES = 30;
let clients = [];

app.post("/send", (req, res) => {
    const { user, text, channel = "global" } = req.body;
    const msg = { user, text, channel, time: Date.now() };
    messages.push(msg);
    if (messages.length > MAX_MESSAGES) messages.shift();

    // Send to all SSE clients
    clients.forEach(client => client.res.write(`data: ${JSON.stringify([msg])}\n\n`));

    res.sendStatus(200);
});

// SSE endpoint
app.get("/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    clients.push(newClient);

    // Remove client on disconnect
    req.on("close", () => {
        clients = clients.filter(c => c.id !== clientId);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("SSE IRC running on port", PORT));
