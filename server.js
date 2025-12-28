const express = require("express");
const { WebSocketServer } = require("ws"); // Import WebSocket
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {

    const clientIp = req.socket.remoteAddress;
    console.log(`New connection attempt from IP: ${clientIp}`);


    wss.clients.forEach((client) => {

        if (client !== ws && client._socket.remoteAddress === clientIp) {
            console.log(`Kicking ghost connection for IP: ${clientIp}`);
            client.terminate(); 
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
                if (client.readyState === 1) {
                    client.send(broadcastData);
                }
            });
        } catch (e) {
            console.error("Error parsing message", e);
        }
    });

    ws.on("close", () => console.log("Client disconnected"));
});
