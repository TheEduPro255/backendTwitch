require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

const app = express();

app.use(express.json());

// CONFIG
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

const REDIRECT_URI = "https://backendtwitch.onrender.com/callback";

/*
|--------------------------------------------------------------------------
| MONGODB
|--------------------------------------------------------------------------
*/
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB conectado"))
    .catch(err => console.error("❌ MongoDB error:", err));

/*
|--------------------------------------------------------------------------
| MODEL EVENT
|--------------------------------------------------------------------------
*/
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
    userId: String,        // quien sigue
    streamerId: String,
    streamerName: String,
    streamerAvatar: String,
    createdAt: { type: Date, default: Date.now }
});

const Favorite = mongoose.model("Favorite", favoriteSchema);


/*
|--------------------------------------------------------------------------
| LOGIN TWITCH
|--------------------------------------------------------------------------
*/
app.get("/login", (req, res) => {

    const scope = "user:read:email user:read:follows user:edit:follows";

    const url =
        `https://id.twitch.tv/oauth2/authorize` +
        `?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scope)}` +
        `&force_verify=true`;

    res.redirect(url);
});

/*
|--------------------------------------------------------------------------
| CALLBACK
|--------------------------------------------------------------------------
*/
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

/*
|--------------------------------------------------------------------------
| CREATE EVENT
|--------------------------------------------------------------------------
*/
app.post("/events", async (req, res) => {

    try {

        const token = req.headers.authorization?.replace("Bearer ", "");
        if (!token) return res.status(401).json({ error: "No token" });

        const { title, description, date, time } = req.body;
        if (!title || !date || !time)
            return res.status(400).json({ error: "Missing fields" });

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

/*
|--------------------------------------------------------------------------
| FOLLOWED FULL (STREAMERS)
|--------------------------------------------------------------------------
*/
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

/*
|--------------------------------------------------------------------------
| GET EVENTS DEL STREAMER LOGUEADO
|--------------------------------------------------------------------------
*/
app.get("/events", async (req, res) => {

    try {

        const userId = req.query.userId;

        if (!userId) {
            return res.status(400).json({
                error: "Missing userId"
            });
        }

        // Buscar eventos creados por el usuario
        const events = await Event.find({
            userId: userId
        }).sort({
            createdAt: -1
        });

        res.json(events);

    } catch (err) {

        console.error(err.message);

        res.status(500).json({
            error: "Error obteniendo eventos"
        });
    }
});

/*
|--------------------------------------------------------------------------
| TODOS LOS EVENTOS
|--------------------------------------------------------------------------
*/
app.get("/events/all", async (req, res) => {

    try {

        const events = await Event.find()
            .sort({ createdAt: -1 });

        res.json(events);

    } catch (err) {

        console.error(err.message);

        res.status(500).json({
            error: "Error obteniendo eventos"
        });
    }
});

/*
|--------------------------------------------------------------------------
| 🔥 EVENTO DESTACADO (CORREGIDO)
|--------------------------------------------------------------------------
*/
app.get("/events/latest", async (req, res) => {

    try {

        const userId = req.query.userId;
        const auth = req.headers.authorization;

        if (!userId || !auth) {
            return res.status(400).json({ error: "Missing data" });
        }

        // ------------------------------------------------
        // STREAMERS SEGUIDOS
        // ------------------------------------------------
        const followsRes = await axios.get(
            "https://api.twitch.tv/helix/channels/followed",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": auth
                },
                params: {
                    user_id: userId,
                    first: 100
                }
            }
        );

        const followIds = (followsRes.data.data || [])
            .map(f => String(f.broadcaster_id));

     

        if (!followIds.length) {
            return res.json(null);
        }

        // ------------------------------------------------
        // EVENTOS
        // ------------------------------------------------
        const events = await Event.find({
            streamerId: { $in: followIds },
            userId: { $ne: userId }
        });

        

        if (!events.length) {
            return res.json(null);
        }

        // ------------------------------------------------
        // EVENTOS FUTUROS
        // ------------------------------------------------
        const now = new Date();

        const futureEvents = events
            .map(event => {

                const eventDate = new Date(
                    `${event.date}T${event.time}:00`
                );

                return {
                    ...event.toObject(),
                    eventDate
                };
            })
            .filter(event => event.eventDate > now);

        

        if (!futureEvents.length) {
            return res.json(null);
        }

        // ------------------------------------------------
        // MÁS CERCANO
        // ------------------------------------------------
        futureEvents.sort(
            (a, b) => a.eventDate - b.eventDate
        );

        res.json(futureEvents[0]);

    } catch (err) {

        console.error(err.response?.data || err.message);

        res.status(500).json({
            error: "Error latest event"
        });
    }
});

/*
|--------------------------------------------------------------------------
| SEARCH STREAMERS
|--------------------------------------------------------------------------
*/
app.get("/search-streamers", async (req, res) => {

    try {

        const token = req.headers.authorization;
        const query = req.query.q;

        if (!token || !query) {
            return res.status(400).json({
                error: "Missing data"
            });
        }

        const usersRes = await axios.get(
            "https://api.twitch.tv/helix/search/channels",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": token
                },
                params: {
                    query: query,
                    first: 20
                }
            }
        );

        const result = usersRes.data.data.map(s => ({
            id: s.id,
            name: s.display_name,
            avatar: s.thumbnail_url.replace("{width}", "300").replace("{height}", "300"),
            isLive: s.is_live
        }));

        res.json(result);

    } catch (err) {

        console.error(err.response?.data || err.message);

        res.status(500).json({
            error: "Search error"
        });
    }
});

app.post("/follow", async (req, res) => {

    try {

        const token = req.headers.authorization?.replace("Bearer ", "");
        const { streamerId, streamerName, streamerAvatar } = req.body;

        if (!token || !streamerId) {
            return res.status(400).json({ error: "Missing data" });
        }

        // ------------------------------------------------
        // USER ID
        // ------------------------------------------------
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

        // ------------------------------------------------
        // SOLO MONGO (FAVORITOS)
        // ------------------------------------------------
        const favorite = await Favorite.findOneAndUpdate(
            { userId, streamerId },
            {
                userId,
                streamerId,
                streamerName,
                streamerAvatar
            },
            { upsert: true, new: true }
        );

        res.json({
            success: true,
            favorite
        });

    } catch (err) {

        console.log("🔥 FAVORITE ERROR:");
        console.log(err.response?.data || err.message);

        res.status(500).json({
            error: "Favorite failed"
        });
    }
});
/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/
app.listen(PORT, () => {
    console.log("Servidor en puerto " + PORT);
});