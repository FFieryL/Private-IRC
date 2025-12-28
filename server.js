const express = require("express");
const { WebSocketServer } = require("ws");
const url = require("url");

const app = express();
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
    // 1. Get the Real IP from Render's Proxy header
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const realIp = rawIp.split(',')[0].trim();

    // 2. Get the Username from the URL (?user=Name)
    const parameters = url.parse(req.url, true).query;
    const username = parameters.user || "Unknown";

    // Attach these to the socket so we can use them later
    ws.realIp = realIp;
    ws.username = username;

    console.log(`[Connect] User: ${username} | IP: ${realIp}`);

    // 3. DEDUPLICATION: Kick any existing connection with the SAME IP
    wss.clients.forEach((client) => {
        if (client !== ws && client.realIp === realIp) {
            console.log(`[Kick] Removing ghost session for IP: ${realIp}`);
            // Use close(1000) so the client knows it's a normal replacement
            client.close(1000, "New connection from this IP");
        }
    });

    ws.on("message", (data) => {
        try {
            const parsed = JSON.parse(data.toString());
            
            // Broadcast the message
            const broadcastData = JSON.stringify({
                user: parsed.user, // The name with colors from Minecraft
                text: parsed.text,
                time: Date.now()
            });

            wss.clients.forEach((client) => {
                if (client.readyState === 1) {
                    client.send(broadcastData);
                }
            });
        } catch (e) {
            console.error("Parse Error:", e);
        }
    });

    ws.on("close", () => console.log(`[Disconnect] ${ws.username} left.`));
});
