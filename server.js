require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

const app = express();
app.use(express.json());

// ---------------- CONFIG ----------------
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

const REDIRECT_URI = "https://backendtwitch.onrender.com/callback";

// ---------------- MONGO ----------------
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB conectado"))
    .catch(err => console.error("❌ MongoDB error:", err));

// ---------------- MODELS ----------------
const eventSchema = new mongoose.Schema({
    title: String,
    description: String,
    date: String,
    time: String,
    streamerId: String,
    streamerName: String,
    streamerAvatar: String,
    userId: String,
    createdAt: { type: Date, default: Date.now }
});

const Event = mongoose.model("Event", eventSchema);

const favoriteSchema = new mongoose.Schema({
    userId: String,
    streamerId: String,
    streamerName: String,
    streamerAvatar: String,
    createdAt: { type: Date, default: Date.now }
});

const Favorite = mongoose.model("Favorite", favoriteSchema);

// ---------------- LOGIN ----------------
app.get("/login", (req, res) => {

    const scope = "user:read:email user:read:follows channel:read:subscriptions";

    const url =
        `https://id.twitch.tv/oauth2/authorize` +
        `?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scope)}` +
        `&force_verify=true`;

    res.redirect(url);
});

// ---------------- CALLBACK ----------------
app.get("/callback", async (req, res) => {

    const code = req.query.code;
    if (!code) return res.status(400).json({ error: "No code" });

    try {

        const tokenRes = await axios.post(
            "https://id.twitch.tv/oauth2/token",
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code,
                grant_type: "authorization_code",
                redirect_uri: REDIRECT_URI
            }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        const accessToken = tokenRes.data.access_token;

        const userRes = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${accessToken}`
                }
            }
        );

        const user = userRes.data.data[0];

        const deepLink =
            `pruebasapp://auth` +
            `?token=${encodeURIComponent(accessToken)}` +
            `&userId=${user.id}` +
            `&username=${user.display_name}` +
            `&avatar=${encodeURIComponent(user.profile_image_url)}`;

        res.send(`
            <html><body style="background:#0B0B12;color:white;display:flex;justify-content:center;align-items:center;height:100vh;">
            <h2>Login correcto</h2>
            <script>window.location.href="${deepLink}"</script>
            </body></html>
        `);

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Auth failed" });
    }
});

// ---------------- PROFILE ----------------
app.get("/profile", async (req, res) => {

    try {

        const rawAuth = req.headers.authorization;

        if (!rawAuth) {
            return res.status(401).json({ error: "No auth header" });
        }

        const token = rawAuth.replace("Bearer ", "").trim();

        const userRes = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        const user = userRes.data.data?.[0];

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        return res.json({
            id: user.id,
            username: user.display_name,
            avatar: user.profile_image_url,
            bio: user.description || "",
            createdAt: user.created_at
        });

    } catch (err) {

        console.error(err.response?.data || err.message);

        return res.status(500).json({
            error: "Error profile"
        });
    }
});

// ---------------- EVENTS CREATE ----------------
app.post("/events", async (req, res) => {

    try {

        const token = req.headers.authorization?.replace("Bearer ", "");
        if (!token) return res.status(401).json({ error: "No token" });

        const { title, description, date, time } = req.body;

        const userRes = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        const user = userRes.data.data[0];

        const event = await Event.create({
            title,
            description: description || "",
            date,
            time,
            streamerId: user.id,
            streamerName: user.display_name,
            streamerAvatar: user.profile_image_url,
            userId: user.id
        });

        res.json(event);

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Error creando evento" });
    }
});

// ---------------- FOLLOWED FULL ----------------
app.get("/followed-full", async (req, res) => {

    try {

        const token = req.headers.authorization;
        const userId = req.query.userId;

        if (!token || !userId)
            return res.status(400).json({ error: "Missing data" });

        const followsRes = await axios.get(
            "https://api.twitch.tv/helix/channels/followed",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": token
                },
                params: {
                    user_id: userId,
                    first: 50
                }
            }
        );

        const ids = (followsRes.data.data || []).map(f => f.broadcaster_id);

        const usersRes = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": token
                },
                params: { id: ids }
            }
        );

        const streamsRes = await axios.get(
            "https://api.twitch.tv/helix/streams",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": token
                },
                params: { user_id: ids }
            }
        );

        const liveIds = (streamsRes.data.data || []).map(s => s.user_id);

        const result = usersRes.data.data.map(u => ({
            id: u.id,
            name: u.display_name,
            avatar: u.profile_image_url,
            isLive: liveIds.includes(u.id)
        }));

        res.json(result);

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Error full follows" });
    }
});

// ---------------- EVENTO DESTACADO ----------------
app.get("/events/latest", async (req, res) => {

    try {

        const userId = req.query.userId;
        const auth = req.headers.authorization;

        if (!userId || !auth) {
            return res.status(400).json({ error: "Missing data" });
        }

        const token = auth.replace("Bearer ", "").trim();

        const followsRes = await axios.get(
            "https://api.twitch.tv/helix/channels/followed",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${token}`
                },
                params: {
                    user_id: userId,
                    first: 100
                }
            }
        );

        const followIds = (followsRes.data.data || [])
            .map(f => f.broadcaster_id);

        if (!followIds.length) return res.json(null);

        const events = await Event.find({
            streamerId: { $in: followIds },
            userId: { $ne: userId }
        });

        if (!events.length) return res.json(null);

        const now = new Date();

        const futureEvents = events
            .map(e => ({
                ...e.toObject(),
                eventDate: new Date(`${e.date}T${e.time}`)
            }))
            .filter(e => e.eventDate > now);

        if (!futureEvents.length) return res.json(null);

        futureEvents.sort((a, b) => a.eventDate - b.eventDate);

        return res.json(futureEvents[0]);

    } catch (err) {
        console.error("LATEST ERROR:", err.response?.data || err.message);
        return res.status(500).json({ error: "Error latest event" });
    }
});

app.get("/events/my", async (req, res) => {

    try {
        const token = req.headers.authorization?.replace("Bearer ", "");
        if (!token) return res.status(401).json({ error: "No token" });

        const userRes = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        const user = userRes.data.data[0];

        const events = await Event.find({
            streamerId: user.id
        });

        res.json(events);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error getting my events" });
    }
});

app.get("/events/following", async (req, res) => {

    try {

        const token = req.headers.authorization?.replace("Bearer ", "");
        const userId = req.query.userId;

        if (!token || !userId) {
            return res.status(400).json({ error: "Missing data" });
        }

        // 1. obtener seguidos
        const followsRes = await axios.get(
            "https://api.twitch.tv/helix/channels/followed",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${token}`
                },
                params: {
                    user_id: userId,
                    first: 100
                }
            }
        );

        const followIds = (followsRes.data.data || [])
            .map(f => f.broadcaster_id);

        if (!followIds.length) return res.json([]);

        // 2. eventos de esos streamers
        const events = await Event.find({
            streamerId: { $in: followIds }
        });

        const now = new Date();

        const filtered = events
            .map(e => ({
                ...e.toObject(),
                eventDate: new Date(`${e.date}T${e.time}`)
            }))
            .filter(e => e.eventDate > now)
            .sort((a, b) => a.eventDate - b.eventDate);

        res.json(filtered);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error events following" });
    }
});



// ---------------- SEARCH STREAMERS ----------------
app.get("/search-streamers", async (req, res) => {

    try {

        const query = req.query.q;
        const token = req.headers.authorization?.replace("Bearer ", "");

        if (!query || !token) {
            return res.status(400).json({ error: "Missing data" });
        }

        const response = await axios.get(
            "https://api.twitch.tv/helix/search/channels",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${token}`
                },
                params: {
                    query,
                    first: 20
                }
            }
        );

        const data = response.data.data || [];

        const result = data.map(s => ({
            id: s.id, // 🔥 ESTE ES EL CAMBIO
            name: s.display_name,
            avatar: s.thumbnail_url,
            isLive: s.is_live
        }));

        res.json(result);

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Search error" });
    }
});

app.post("/follow", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace("Bearer ", "");
        if (!token) return res.status(401).json({ error: "No token" });

        const { streamerId, streamerName, streamerAvatar } = req.body;

        const userRes = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        const user = userRes.data.data[0];

        await Favorite.create({
            userId: user.id,
            streamerId,
            streamerName,
            streamerAvatar
        });

        res.json({ ok: true });

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Follow error" });
    }
});

app.get("/favorites", async (req, res) => {
    try {
        const userId = req.query.userId;

        if (!userId) {
            return res.status(400).json({ error: "Missing userId" });
        }

        const favorites = await Favorite.find({ userId });

        res.json(favorites);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error getting favorites" });
    }
});

app.delete("/favorites", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace("Bearer ", "");
        const streamerId = req.query.streamerId;

        if (!token || !streamerId) {
            return res.status(400).json({ error: "Missing data" });
        }

        const userRes = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        const userId = userRes.data.data[0].id;

        await Favorite.deleteOne({
            userId,
            streamerId
        });

        res.json({ ok: true });

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Delete error" });
    }
});

app.get("/subs", async (req, res) => {
    try {

        const token = req.headers.authorization?.replace("Bearer ", "");
        const broadcasterId = req.query.broadcasterId;

        if (!token || !broadcasterId) {
            return res.status(400).json({ error: "Missing data" });
        }

        const response = await axios.get(
            "https://api.twitch.tv/helix/subscriptions",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${token}`
                },
                params: {
                    broadcaster_id: broadcasterId,
                    first: 100
                }
            }
        );

        const totalSubs = response.data.total || response.data.data.length;

        res.json({
            total: totalSubs,
            subs: response.data.data
        });

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Error getting subs" });
    }
});

app.get("/events/next", async (req, res) => {
    try {

        const token = req.headers.authorization?.replace("Bearer ", "");
        if (!token) return res.status(401).json({ error: "No token" });

        const userRes = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        const userId = userRes.data.data[0].id;

        const events = await Event.find({
            streamerId: userId
        });

        const now = new Date();

        const next = events
            .map(e => ({
                ...e.toObject(),
                eventDate: new Date(`${e.date}T${e.time}`)
            }))
            .filter(e => e.eventDate > now)
            .sort((a, b) => a.eventDate - b.eventDate);

        if (!next.length) return res.json(null);

        res.json(next[0]);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error next event" });
    }
});

// ---------------- FOLLOWERS ----------------
app.get("/followers", async (req, res) => {

    try {

        const token = req.headers.authorization?.replace("Bearer ", "");
        const broadcasterId = req.query.broadcasterId;

        if (!token || !broadcasterId) {
            return res.status(400).json({ error: "Missing data" });
        }

        const response = await axios.get(
            "https://api.twitch.tv/helix/channels/followers",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${token}`
                },
                params: {
                    broadcaster_id: broadcasterId
                }
            }
        );

        res.json({
            total: response.data.total || 0
        });

    } catch (err) {

        console.error(err.response?.data || err.message);

        res.status(500).json({
            error: "Error getting followers"
        });
    }
});


// ---------------- START ----------------
app.listen(PORT, () => {
    console.log("Servidor en puerto " + PORT);
});