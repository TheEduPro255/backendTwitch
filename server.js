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

    console.log("Entra en /login");

    const scope = "user:read:email";

    const authUrl =
        `https://id.twitch.tv/oauth2/authorize` +
        `?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scope)}` +
        `&force_verify=true`;

    console.log("AUTH URL:");
    console.log(authUrl);

    // REDIRECT DIRECTO A TWITCH
    res.redirect(authUrl);
});



/*
|--------------------------------------------------------------------------
| CALLBACK TWITCH
|--------------------------------------------------------------------------
*/

app.get("/callback", async (req, res) => {

    console.log("Entra en /callback");

    const code = req.query.code;

    console.log("CODE:");
    console.log(code);

    if (!code) {

        return res.status(400).json({
            error: "No code received"
        });
    }

    try {

        // INTERCAMBIO CODE -> ACCESS TOKEN
        const tokenResponse = await axios.post(
            "https://id.twitch.tv/oauth2/token",
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: code,
                grant_type: "authorization_code",
                redirect_uri: REDIRECT_URI
            }),
            {
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                }
            }
        );

        const accessToken =
            tokenResponse.data.access_token;

        console.log("ACCESS TOKEN:");
        console.log(accessToken);

        // OPCIONAL -> DATOS USER
        const userResponse = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${accessToken}`
                }
            }
        );

        console.log("USER:");
        console.log(userResponse.data);

        // REDIRECT A APP ANDROID
        res.send(`
        <html>

        <head>
            <title>Login Twitch</title>
        </head>

        <body style="
            background:#0B0B12;
            color:white;
            font-family:sans-serif;
            display:flex;
            justify-content:center;
            align-items:center;
            height:100vh;
            flex-direction:column;
        ">

            <h1>✅ Login correcto</h1>

            <p>Redirigiendo a la app...</p>

            <script>
                window.location.href =
                    "pruebasapp://auth?token=${accessToken}";
            </script>

        </body>

        </html>
        `);

    } catch (err) {

        console.error(
            err.response?.data || err.message
        );

        res.status(500).json({
            error: "Auth failed"
        });
    }
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