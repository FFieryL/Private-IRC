let messages = [];
const MAX_MESSAGES = 25; // only keep the last 25 messages

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
        res.json(newMessages);
        return;
    }

    // No new messages: hold request for up to 30s
    const timeout = setTimeout(() => {
        res.json([]);
    }, 30000);

    const listener = (msg) => {
        if (msg.time > since) {
            clearTimeout(timeout);
            res.json([msg]);
        }
    };

    app.once("newMessage", listener);
});
