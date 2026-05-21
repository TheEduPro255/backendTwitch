require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

const app = express();

/*
|--------------------------------------------------------------------------
| MIDDLEWARE
|--------------------------------------------------------------------------
*/
app.use(express.json());

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

const REDIRECT_URI = "https://backendtwitch.onrender.com/callback";

/*
|--------------------------------------------------------------------------
| MONGODB CONNECT
|--------------------------------------------------------------------------
*/
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB conectado"))
    .catch(err => console.error("❌ MongoDB error:", err));

/*
|--------------------------------------------------------------------------
| EVENT MODEL
|--------------------------------------------------------------------------
*/
const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, default: "" },
    date: { type: String, required: true },
    time: { type: String, required: true },

    streamerId: { type: String, required: true },
    streamerName: { type: String, required: true },
    streamerAvatar: { type: String, required: true },

    userId: { type: String, required: true },

    createdAt: { type: Date, default: Date.now }
});

const Event = mongoose.model("Event", eventSchema);

/*
|--------------------------------------------------------------------------
| LOGIN TWITCH
|--------------------------------------------------------------------------
*/
app.get("/login", (req, res) => {

    const scope = "user:read:email user:read:follows";

    const authUrl =
        `https://id.twitch.tv/oauth2/authorize` +
        `?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scope)}` +
        `&force_verify=true`;

    res.redirect(authUrl);
});

/*
|--------------------------------------------------------------------------
| CALLBACK TWITCH
|--------------------------------------------------------------------------
*/
app.get("/callback", async (req, res) => {

    const code = req.query.code;

    if (!code) {
        return res.status(400).json({ error: "No code" });
    }

    try {

        // 1. TOKEN
        const tokenResponse = await axios.post(
            "https://id.twitch.tv/oauth2/token",
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code,
                grant_type: "authorization_code",
                redirect_uri: REDIRECT_URI
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        // 2. USER TWITCH
        const userResponse = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${accessToken}`
                }
            }
        );

        const user = userResponse.data.data[0];

        const deepLink =
            `pruebasapp://auth` +
            `?token=${encodeURIComponent(accessToken)}` +
            `&userId=${user.id}` +
            `&username=${user.display_name}` +
            `&avatar=${encodeURIComponent(user.profile_image_url)}`;

        res.send(`
            <html>
            <body style="background:#0B0B12;color:white;
            display:flex;justify-content:center;align-items:center;
            height:100vh;font-family:sans-serif;flex-direction:column">

                <h2>Login correcto</h2>
                <p>Redirigiendo...</p>

                <script>
                    window.location.href = "${deepLink}";
                </script>

            </body>
            </html>
        `);

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Auth failed" });
    }
});

/*
|--------------------------------------------------------------------------
| CREATE EVENT (ANDROID)
|--------------------------------------------------------------------------
*/
app.post("/events", async (req, res) => {

    try {

        console.log("BODY RECIBIDO:", req.body);

        const token = req.headers.authorization?.replace("Bearer ", "");

        if (!token) {
            return res.status(401).json({ error: "No token" });
        }

        const { title, description, date, time } = req.body;

        if (!title || !date || !time) {
            return res.status(400).json({ error: "Missing fields" });
        }

        // 🔥 OBTENER USUARIO TWITCH (NO CONFIAR EN ANDROID)
        const userResponse = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        const user = userResponse.data.data[0];

        const newEvent = await Event.create({
            title,
            description: description || "",
            date,
            time,

            streamerId: user.id,
            streamerName: user.display_name,
            streamerAvatar: user.profile_image_url,

            userId: user.id
        });

        res.json(newEvent);

    } catch (err) {
        console.error("🔥 ERROR:", err.response?.data || err.message);
        res.status(500).json({ error: "Error creando evento" });
    }
});

/*
|--------------------------------------------------------------------------
| GET EVENTS
|--------------------------------------------------------------------------
*/
app.get("/events", async (req, res) => {

    try {

        const { userId } = req.query;

        const filter = userId ? { userId } : {};

        const events = await Event.find(filter)
            .sort({ createdAt: -1 });

        res.json(events);

    } catch (err) {
        res.status(500).json({ error: "Error events" });
    }
});

app.get("/events/latest", async (req, res) => {
    try {
        const { userId } = req.query;

        const filter = userId ? { userId } : {};

        const event = await Event.findOne(filter)
            .sort({ createdAt: -1 }); // 🔥 el último creado

        res.json(event);

    } catch (err) {
        res.status(500).json({ error: "Error latest event" });
    }
});

/*
|--------------------------------------------------------------------------
| FOLLOWED FULL
|--------------------------------------------------------------------------
*/
app.get("/followed-full", async (req, res) => {

    const token = req.headers.authorization;
    const userId = req.query.userId;

    if (!token || !userId) {
        return res.status(400).json({
            error: "Missing data"
        });
    }

    try {

        // 1. Obtener follows
        const followsRes = await axios.get(
            "https://api.twitch.tv/helix/channels/followed",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": token
                },
                params: {
                    user_id: userId,
                    first: 20
                }
            }
        );

        const follows = followsRes.data.data;

        const ids = follows.map(f => f.broadcaster_id);

        if (ids.length === 0) {
            return res.json([]);
        }

        // 2. Obtener info usuarios
        const usersRes = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": token
                },
                params: {
                    id: ids
                }
            }
        );

        const users = usersRes.data.data;

        // 3. Formatear
        // 🔥 Obtener streams en directo
const streamsRes = await axios.get(
    "https://api.twitch.tv/helix/streams",
    {
        headers: {
            "Client-Id": CLIENT_ID,
            "Authorization": token
        },
        params: {
            user_id: ids
        }
    }
);

const liveIds = streamsRes.data.data.map(s => s.user_id);

// RESULTADO FINAL
const result = users.map(u => ({
    id: u.id,
    name: u.display_name,
    avatar: u.profile_image_url,
    isLive: liveIds.includes(u.id)
}));
        res.json(result);

    } catch (err) {

        console.error(err.response?.data || err.message);

        res.status(500).json({
            error: "Error full follows"
        });
    }
});


/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/
app.listen(PORT, () => {
    console.log("Servidor en puerto " + PORT);
});