let messages = [];
const MAX_MESSAGES = 25;

const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;


// Send message
app.post("/send", (req, res) => {
    const { user, text, channel = "global" } = req.body;

    const msg = {
        user,
        text,
        channel,
        time: Date.now()
    };

    messages.push(msg);

    // Trim old messages if we exceed MAX_MESSAGES
    if (messages.length > MAX_MESSAGES) messages.shift();

    // Emit new message for long-poll listeners
    app.emit("newMessage", msg);

    res.sendStatus(200);
});

// Poll messages
app.get("/poll", (req, res) => {
    const since = Number(req.query.since || 0);
    const newMessages = messages.filter(m => m.time > since);

    if (newMessages.length > 0) {
        return res.json(newMessages);
    }

    // No new messages: hold request for up to 30s
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


app.listen(PORT, () => {console.log(`IRC relay running on port ${PORT}`)});
