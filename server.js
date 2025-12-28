const express = require("express");
const { WebSocketServer } = require("ws"); // Import WebSocket
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Initialize WebSocket Server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
    console.log("New client connected");

    ws.on("message", (data) => {
        try {
            const parsed = JSON.parse(data);
            
            // Broadcast the message to EVERYONE connected
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

    ws.on("close", () => console.log("Client disconnected"));
});
