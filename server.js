require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();



const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PORT = process.env.PORT || 3000;
const redirect_uri = "https://twitchappbackend-1.onrender.com/callback";

// const scope = "user:read:email";


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

        console.error(err.response?.data  || err.message);

        res.status(500).json({
            error: "Algo salió mal"
        });
    }
});


app.get("/login", (req, res) => {
    const client_id = process.env.CLIENT_ID;
    const scope = "user:read:email";
        console.log("Entra en /login");


    const authUrl =
        `https://id.twitch.tv/oauth2/authorize` +
        `?client_id=${client_id}` +
        `&redirect_uri=${redirect_uri}` +
        `&response_type=code `+
        `&scope=${scope}`+
        `&force_verify=true`;
res.send(
        <html>
        <head>
            <title>Login Twitch</title>
        </head>
        <body>
            <h1>Login con Twitch</h1>
            <a href="${authUrl}">
                <button>Iniciar sesión</button>
            </a>
        </body>
        </html>
    );
});


app.get("/callback", async (req, res) => {
        console.log("Entra en /callback");

    const code = req.query.code;

    try {
        const tokenResponse = await axios.post(
            "https://id.twitch.tv/oauth2/token",
            new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                code: code,
                grant_type: "authorization_code",
                redirect_uri: "https://twitchappbackend-1.onrender.com/callback"
            })
        );

        const accessToken = tokenResponse.data.access_token;


res.send(
<html>
<head>
    <title>Login completado</title>
</head>
<body>
    <h1>✅ Login Twitch correcto</h1>
    <p>Pulsa para volver a la app</p>

    <a href="pruebasapp://auth?token=${accessToken}">
        <button>Volver a la app</button>
    </a>

    <script>
        // intento automático
        window.location.href = "pruebasapp://auth?token=${accessToken}";
    </script>
</body>
</html>
);

 

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Auth failed" });
    }
});





app.listen(PORT, () => {
    console.log("Servidor iniciado en puerto "+PORT);
});