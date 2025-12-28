const express = require("express");
const { WebSocketServer } = require("ws");
const url = require("url"); // Required to parse the ?user= query string

const app = express();
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
    // 1. Extract the username from the URL (e.g., /?user=PlayerName)
    const parameters = url.parse(req.url, true).query;
    const username = parameters.user || "Unknown";
    
    // Store the username on the 'ws' object so we can check it later
    ws.username = username;

    console.log(`New connection attempt from user: ${username}`);

    // 2. DEDUPLICATION: Check for existing connections with the SAME username
    wss.clients.forEach((client) => {
        // Look for a client that isn't the current one AND has the same username
        if (client !== ws && client.username === username) {
            console.log(`Kicking ghost connection for user: ${username}`);
            
            // 1000 is a "Normal Closure" code. 
            // It's gentler than terminate() and helps prevent client-side crash loops.
            client.close(1000, "Logged in from another location");
        }
    });

    ws.on("message", (data) => {
        try {
            const parsed = JSON.parse(data.toString());
            const broadcastData = JSON.stringify({
                user: parsed.user,
                text: parsed.text,
                time: Date.now()
            });

            wss.clients.forEach((client) => {
                if (client.readyState === 1) { // 1 = OPEN
                    client.send(broadcastData);
                }
            });
        } catch (e) {
            console.error("Error parsing message", e);
        }
    });

    // Use the stored username in the disconnect log
    ws.on("close", () => console.log(`User ${ws.username} disconnected`));
});
