const express = require("express");
const { WebSocketServer } = require("ws");
const url = require("url");

const app = express();
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const wss = new WebSocketServer({ server });
const WebSocket = require("ws");

const SERVER_START_TIME = Date.now();
const JOIN_SUPPRESS_MS = 15000;

wss.on("connection", (ws, req) => {
    // 1. Extract the username from the URL
    const parameters = url.parse(req.url, true).query;
    const username = parameters.user || "Unknown";
    
    // Store the username on the 'ws' object
    ws.username = username;

    console.log(`New connection attempt from user: ${username}`);

    // 2. DEDUPLICATION: Kick existing connections with the same name
    wss.clients.forEach((client) => {
        if (client !== ws && client.username === username) {
            console.log(`Kicking ghost connection for user: ${username}`);
            client.close(1000, "Logged in from another location");
        }
    });

    // 3. BROADCAST JOIN MESSAGE: "User is online"
    const shouldBroadcastJoin = Date.now() - SERVER_START_TIME > JOIN_SUPPRESS_MS;

    if (shouldBroadcastJoin) {
        setImmediate(() => {
            const joinMessage = JSON.stringify({
                text: `&a${username} is online`,
                time: Date.now()
            });
    
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(joinMessage);
                }
            });
        });
    }

    // 4. HANDLE INCOMING MESSAGES
    ws.on("message", (data) => {
        try {
            const parsed = JSON.parse(data.toString());

            if (parsed.type === "request_list") {
                const onlineUsers = [];
                wss.clients.forEach(client => {
                    if (client.readyState === 1) {
                        onlineUsers.push(client.username);
                    }
                });
                
                ws.send(JSON.stringify({
                    type: "user_list",
                    users: onlineUsers
                }));
                return; 
            }
            
            const broadcastData = JSON.stringify({
                user: parsed.user || ws.username, 
                text: parsed.text,
                time: Date.now()
        });

            wss.clients.forEach((client) => {
                if (client.readyState === 1) {
                    client.send(broadcastData);
                }
            });
        } catch (e) {
            console.error("Error parsing message", e);
        }
    });

    // 5. BROADCAST LEAVE MESSAGE
    ws.on("close", () => {
        console.log(`User ${ws.username} disconnected`);
        if (Date.now() - SERVER_START_TIME < JOIN_SUPPRESS_MS) return;
        
        const leaveMessage = JSON.stringify({
            text: `&c${ws.username} has left`,
            time: Date.now()
        });

        wss.clients.forEach((client) => {
            if (client.readyState === 1 && client.username !== ws.username) {
                client.send(leaveMessage);
            }
        });
    });
});
