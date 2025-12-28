const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

let messages = [];
const MAX_MESSAGES = 25;

app.setMaxListeners(50);

// Send message
app.post("/send", (req, res) => {
    const { user, text, channel = "global" } = req.body;

    if (!user || !text) return res.status(400).json({ error: "Invalid message" });

    const msg = {
        user,
        text,
        channel,
        time: Date.now()
    };

    messages.push(msg);
    if (messages.length > MAX_MESSAGES) messages.shift();

    app.emit("newMessage", msg);

    return res.json({ ok: true });
});


app.get("/poll", (req, res) => {
    const since = Number(req.query.since || Date.now()); 
    const newMessages = messages.filter(m => m.time > since);

    if (newMessages.length > 0) return res.json(newMessages);

    let responded = false;

    const timeout = setTimeout(() => {
        if (!responded) {
            responded = true;
            app.removeListener("newMessage", listener);
            res.json([]);
        }
    }, 30000);

    const listener = (msg) => {
        if (msg.time > since && !responded) {
            responded = true;
            clearTimeout(timeout);
            app.removeListener("newMessage", listener);
            res.json([msg]);
        }
    };

    app.on("newMessage", listener);
});

app.listen(PORT, () => console.log(`IRC relay running on port ${PORT}`));
