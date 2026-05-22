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

    const scope = "user:read:email user:read:follows";

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

// ---------------- PROFILE (SIN FOLLOWERS) ----------------
app.get("/profile", async (req, res) => {

    console.log("\n🔥 ===== PROFILE REQUEST =====");

    try {

        // ---------------- HEADER RAW ----------------
        console.log("RAW HEADERS:", req.headers);

        const rawAuth = req.headers.authorization;
        console.log("RAW AUTH HEADER:", rawAuth);

        if (!rawAuth) {
            console.log("❌ NO AUTH HEADER");
            return res.status(401).json({ error: "No auth header" });
        }

        // ---------------- TOKEN CLEAN ----------------
        const token = rawAuth.replace("Bearer ", "").trim();

        console.log("TOKEN CLEAN:", token);
        console.log("TOKEN LENGTH:", token?.length);

        if (!token || token === "undefined" || token === "null") {
            console.log("❌ INVALID TOKEN AFTER CLEANING");
            return res.status(401).json({ error: "Invalid token" });
        }

        // ---------------- TWITCH CALL ----------------
        console.log("➡️ CALLING TWITCH /helix/users");

        const userRes = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        console.log("✅ TWITCH RESPONSE OK");
        console.log("TWITCH DATA:", JSON.stringify(userRes.data, null, 2));

        const user = userRes.data?.data?.[0];

        if (!user) {
            console.log("❌ NO USER RETURNED FROM TWITCH");
            return res.status(404).json({ error: "User not found" });
        }

        // ---------------- RESPONSE ----------------
        const response = {
            id: user.id,
            username: user.display_name,
            avatar: user.profile_image_url,
            bio: user.description || "",
            createdAt: user.created_at
        };

        console.log("📦 FINAL RESPONSE:", response);
        console.log("🔥 ==========================\n");

        return res.json(response);

    } catch (err) {

        console.log("\n❌ ===== PROFILE ERROR =====");

        console.log("MESSAGE:", err.message);

        if (err.response) {
            console.log("STATUS:", err.response.status);
            console.log("DATA:", err.response.data);
        }

        console.log("FULL ERROR:", err);

        console.log("🔥 ==========================\n");

        return res.status(500).json({
            error: "Error getting profile",
            details: err.response?.data || err.message
        });
    }
});


// ---------------- EVENTS ----------------
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

    const token = req.headers.authorization;
    const userId = req.query.userId;

    if (!token || !userId)
        return res.status(400).json({ error: "Missing data" });

    try {

        const followsRes = await axios.get(
            "https://api.twitch.tv/helix/channels/followed",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": token
                },
                params: { user_id: userId, first: 50 }
            }
        );

        const ids = followsRes.data.data.map(f => f.broadcaster_id);

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

        const liveIds = streamsRes.data.data.map(s => s.user_id);

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

// ---------------- START ----------------
app.listen(PORT, () => {
    console.log("Servidor en puerto " + PORT);
});