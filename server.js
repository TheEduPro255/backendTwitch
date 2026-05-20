require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const PORT = process.env.PORT || 3000;

const REDIRECT_URI =
    "https://backendtwitch.onrender.com/callback";



/*
|--------------------------------------------------------------------------
| TEST API
|--------------------------------------------------------------------------
*/

app.get("/", async (req, res) => {

    console.log("Entra en /");

    try {

        // TOKEN APP
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

        console.log("TOKEN APP:", accessToken);

        // EJEMPLO API TWITCH
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

        console.error(
            err.response?.data || err.message
        );

        res.status(500).json({
            error: "Algo salió mal"
        });
    }
});



/*
|--------------------------------------------------------------------------
| LOGIN TWITCH
|--------------------------------------------------------------------------
*/

app.get("/login", (req, res) => {

    const authUrl =
        "https://id.twitch.tv/oauth2/authorize" +
        "?client_id=" + CLIENT_ID +
        "&redirect_uri=" + encodeURIComponent(REDIRECT_URI) +
        "&response_type=code";

    console.log(authUrl);

    res.redirect(authUrl);
});


/*
|--------------------------------------------------------------------------
| CALLBACK TWITCH
|--------------------------------------------------------------------------
*/

app.get("/callback", async (req, res) => {

    console.log("Entra en /callback");
    console.log("QUERY COMPLETA:", req.query);

    const code = req.query.code;
    const error = req.query.error;

    if (error) {
        return res.send(`
            <h1>OAuth error</h1>
            <p>${error}</p>
            <pre>${JSON.stringify(req.query, null, 2)}</pre>
        `);
    }

    if (!code) {
        return res.send(`
            <h1>No code received</h1>
            <pre>${JSON.stringify(req.query, null, 2)}</pre>
        `);
    }

    res.send("OK");
});


/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {

    console.log(
        "Servidor iniciado en puerto " + PORT
    );
});