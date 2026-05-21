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

        const accessToken =
            tokenResponse.data.access_token;

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

    const code = req.query.code;

    if (!code) {

        return res.status(400).json({
            error: "No code received"
        });
    }

    try {

        /*
        |--------------------------------------------------------------------------
        | INTERCAMBIO CODE → TOKEN
        |--------------------------------------------------------------------------
        */

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

        console.log("TOKEN:");
        console.log(accessToken);

        /*
        |--------------------------------------------------------------------------
        | DATOS DEL USUARIO
        |--------------------------------------------------------------------------
        */

        const userResponse = await axios.get(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-Id": CLIENT_ID,
                    "Authorization": `Bearer ${accessToken}`
                }
            }
        );

        const user =
            userResponse.data.data[0];

        console.log("USER:");
        console.log(user);

        const username =
            user.display_name;

        const avatar =
            user.profile_image_url;

        const email =
            user.email;

        /*
        |--------------------------------------------------------------------------
        | DEEP LINK → ANDROID
        |--------------------------------------------------------------------------
        */

        const deepLink =
            `pruebasapp://auth` +
            `?token=${encodeURIComponent(accessToken)}` +
            `&username=${encodeURIComponent(username)}` +
            `&avatar=${encodeURIComponent(avatar)}` +
            `&email=${encodeURIComponent(email)}`;

        console.log("DEEP LINK:");
        console.log(deepLink);

        /*
        |--------------------------------------------------------------------------
        | RESPUESTA HTML
        |--------------------------------------------------------------------------
        */

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
                    "${deepLink}";

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