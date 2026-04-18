const express = require("express");
const { WebSocketServer } = require("ws");
const WebSocket = require("ws");
const url = require("url");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, ActivityType, MessageFlags } = require("discord.js");
require("dns").setDefaultResultOrder("ipv4first");

const app = express();
const PORT = process.env.PORT || 3000;
let SERVER_START_TIME;

const server = app.listen(PORT, () => {
    SERVER_START_TIME = Date.now();
    console.log(`Server running on port ${PORT}`);
});

const wss = new WebSocketServer({ server });

const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const commands = [
    {
        name: "irconline",
        description: "Show online users"
    }
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);

discordClient.once("ready", async () => {
    console.log(`Discord bot ready: ${discordClient.user.tag}`);

    discordClient.user.setPresence({
        activities: [
            {
                name: "Watching PrivateASF | /irconline",
                type: ActivityType.Watching
            }
        ],
        status: "online"
    });

    try {
        await rest.put(
            Routes.applicationCommands(discordClient.user.id),
            { body: commands }
        );

        console.log("Slash commands registered!");
    } catch (err) {
        console.error(err);
    }
});

discordClient.on("debug", (info) => console.log("DEBUG:", info));

discordClient.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
    console.error("Failed to login to Discord:", err);
});

discordClient.on("messageCreate", (message) => {
    if (message.author.bot) return;
    if (message.channel.id !== DISCORD_CHANNEL_ID) return;

    const name = (message.member?.displayName || message.author.username).replace(/[^\w\s]/g, "");

    const data = JSON.stringify({
        user: `[Discord] ${name}`,
        text: message.content,
        time: Date.now()
    });

    for (const client of users.values()) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    }
});

discordClient.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "irconline") {
        const list = [...users.keys()].join(", ");

        await interaction.reply({
            content: `🟢 Online users (${users.size}): ${list}`,
            flags: MessageFlags.Ephemeral
        });
    }
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.error(err));

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    joinedAt: { type: Date, default: Date.now }
}, {
    versionKey: false
});

app.get("/users", async (req, res) => {
    const users = await User.find({}, { _id: 0, username: 1 })
        .sort({ username: 1 });

    const list = users.map(u => `<li>${u.username}</li>`).join("");

    res.send(`
        <h1>Registered Users</h1>
        <ul>${list}</ul>
    `);
});

const User = mongoose.model("User", userSchema);

const users = new Map();

const JOIN_SUPPRESS_MS = 60000;

wss.on("connection", async (ws, req) => {
    // 1. Extract username
    const parameters = url.parse(req.url, true).query;
    const username = parameters.user || "Unknown";
    ws.username = username;

    try {
        await User.updateOne(
            { username },
            { username },
            { upsert: true }
        );
    } catch (err) {
        console.error("Database save error:", err);
    }

    console.log(`New connection attempt from user: ${username}`);

    const existing = users.get(username);
    if (existing && existing.readyState === WebSocket.OPEN) {
        console.log(`Closing previous connection for user: ${username}`);
        existing.isDuplicate = true; // ✅ mark it
        existing.close(1000, "Duplicate login");
    }


    users.set(username, ws);


    const shouldBroadcastJoin = SERVER_START_TIME && ((Date.now() - SERVER_START_TIME) > JOIN_SUPPRESS_MS);

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
        // sendDiscordEmbed({
        //     title: "Player Joined",
        //     description: `${username} joined the game`,
        //     color: 0x00ff00
        // });
    }


    ws.on("message", (data) => {
        try {
            const parsed = JSON.parse(data.toString());


            if (parsed.type === "request_list") {
                ws.send(
                    JSON.stringify({
                        type: "user_list",
                        users: [...users.keys()]
                    })
                );
                return;
            }

            const broadcastData = JSON.stringify({
                user: parsed.user || ws.username,
                text: parsed.text,
                time: Date.now()
            });

            if ((parsed.user || ws.username).startsWith("[Discord]")) return;
            const cleanUser = (parsed.user || ws.username).replace(/&[a-z0-9]/g, "");
            const cleanText = parsed.text.replace(/&[a-z]/g, "");


            const channel = discordClient.channels.cache.get(DISCORD_CHANNEL_ID);
            const avatarUrl = `https://minotar.net/avatar/${cleanUser}`
            if (channel) {
                const embed = new EmbedBuilder()
                    .setAuthor({ 
                        name: cleanUser,
                        iconURL: avatarUrl
                    })
                    .setDescription(cleanText)
                    .setColor(0x0099ff)
                    .setTimestamp();
                const mentions = cleanText.match(/<@!?\d+>|<@&\d+>/g);
                const mentionText = mentions ? mentions.join(" ") : null;
                channel.send({
                    content: mentionText || undefined,
                    embeds: [embed]
                });
            }

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

        if (users.get(ws.username) === ws) {
            users.delete(ws.username);

            if (!SERVER_START_TIME || Date.now() - SERVER_START_TIME < JOIN_SUPPRESS_MS || ws.isDuplicate) return;

            const leaveMessage = JSON.stringify({
                text: `&c${ws.username} has left`,
                time: Date.now()
            });

            for (const client of users.values()) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(leaveMessage);
                }
            }

            // sendDiscordEmbed({
            //     title: "Player Left",
            //     description: `${ws.username} left the game`,
            //     color: 0xff0000
            // });
        }
    });
});

async function sendDiscordEmbed({ title, description, color }) {
    try {
        const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();

        channel.send({ embeds: [embed] });
    } catch (err) {
        console.error("Discord send error:", err);
    }
}