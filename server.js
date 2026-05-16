require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PORT = process.env.PORT || 3000;

app.get("/", async (req, res) => {

    try {

        const tokenResponse = await axios.post(
            "https://id.twitch.tv/oauth2/token",
            null,
            {
                params: {
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    grant_type: "client_credentials"
                }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        console.log("TOKEN:", accessToken);

        const twitchResponse = await axios.get(
            "https://api.twitch.tv/helix/games/top",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${accessToken}`
                }
            }
        );

        res.json(twitchResponse.data);

    } catch (err) {

        console.error(err.response?.data || err.message);

        res.status(500).json({
            error: "Algo salió mal"
        });
    }
});


app.get("/login", (req, res) => {
    const client_id = process.env.CLIENT_ID;
    const redirect_uri = "https://twitchappbackend-1.onrender.com//callback";
    const scope = "user:read:email";

    const authUrl =
        `https://id.twitch.tv/oauth2/authorize` +
        `?client_id=${client_id}` +
        `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scope)}`;

    res.redirect(authUrl);
});

app.get("/callback", async (req, res) => {
    const code = req.query.code;

    try {
        const tokenResponse = await axios.post(
            "https://id.twitch.tv/oauth2/token",
            new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                code: code,
                grant_type: "authorization_code",
                redirect_uri: "https://twitchappbackend-1.onrender.com//callback"
            })
        );

        const accessToken = tokenResponse.data.access_token;

        res.json({
            message: "Usuario autenticado correctamente",
            access_token: accessToken
        });

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Auth failed" });
    }
});





app.listen(PORT, () => {
    console.log("Servidor iniciado en puerto "+PORT);
});