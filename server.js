const express = require("express");
const { WebSocketServer } = require("ws");
const WebSocket = require("ws");
const url = require("url");

const app = express();
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () =>
    console.log(`Server running on port ${PORT}`)
);

const wss = new WebSocketServer({ server });

/**
 * Track exactly ONE socket per username
 * username -> WebSocket
 */
const users = new Map();

const SERVER_START_TIME = Date.now();
const JOIN_SUPPRESS_MS = 15000;

wss.on("connection", (ws, req) => {
    // 1. Extract username
    const parameters = url.parse(req.url, true).query;
    const username = parameters.user || "Unknown";
    ws.username = username;

    console.log(`New connection attempt from user: ${username}`);

    // 2. Deduplicate using Map (SAFE)
    const existing = users.get(username);
    if (existing && existing.readyState === WebSocket.OPEN) {
        console.log(`Closing previous connection for user: ${username}`);
        existing.close(1000, "Duplicate login");
    }

    // Register new connection
    users.set(username, ws);

    // 3. Broadcast JOIN message (after startup suppression)
    const shouldBroadcastJoin =
        Date.now() - SERVER_START_TIME > JOIN_SUPPRESS_MS;

    if (shouldBroadcastJoin) {
        const joinMessage = JSON.stringify({
            text: `&a${username} is online`,
            time: Date.now()
        });

        for (const client of users.values()) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(joinMessage);
            }
        }
    }

    // 4. Handle incoming messages
    ws.on("message", (data) => {
        try {
            const parsed = JSON.parse(data.toString());

            // User list request
            if (parsed.type === "request_list") {
                ws.send(
                    JSON.stringify({
                        type: "user_list",
                        users: [...users.keys()]
                    })
                );
                return;
            }

            // Chat message broadcast
            const broadcastData = JSON.stringify({
                user: parsed.user || ws.username,
                text: parsed.text,
                time: Date.now()
            });

            for (const client of users.values()) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(broadcastData);
                }
            }
        } catch (err) {
            console.error("Error parsing message:", err);
        }
    });

    // 5. Handle disconnect
    ws.on("close", () => {
        console.log(`User ${ws.username} disconnected`);

        // Only delete if THIS socket is still the active one
        if (users.get(ws.username) === ws) {
            users.delete(ws.username);

            if (Date.now() - SERVER_START_TIME < JOIN_SUPPRESS_MS) return;

            const leaveMessage = JSON.stringify({
                text: `&c${ws.username} has left`,
                time: Date.now()
            });

            for (const client of users.values()) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(leaveMessage);
                }
            }
        }
    });
});
