const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const AUTHOR_NAME = "Adam Dawidziuk";

const startTime = new Date().toLocaleString();
console.log(`Aplikacja uruchomiona: ${startTime}`);
console.log(`Autor: ${AUTHOR_NAME}`);
console.log(`Nasłuchuje na porcie: ${PORT}`);

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const cities = {
    "Polska": ["Warszawa", "Kraków", "Gdańsk"],
    "Niemcy": ["Berlin", "Monachium", "Hamburg"],
    "Czechy": ["Praga", "Brno", "Ostrawa"]
};

const coordinates = {
    "Warszawa": [52.2370, 21.0175],
    "Kraków": [50.0496, 19.9445],
    "Gdańsk": [54.3721, 18.6383],
    "Berlin": [52.5200, 13.4049],
    "Monachium": [48.1371, 11.5761],
    "Hamburg": [53.5510, 9.9936],
    "Praga": [50.0736, 14.4185],
    "Brno": [49.1950, 16.6068],
    "Ostrawa": [49.8209, 18.2625]
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/weather', async (req, res) => {
    const { country, city } = req.body;
    if (!city || !coordinates[city]) {
        return res.send("Nieprawidłowe dane miasta.");
    }

    const [lat, lon] = coordinates[city];
    try {
        const weatherResponse = await axios.get(`https://api.open-meteo.com/v1/forecast`, {
            params: {
                latitude: lat,
                longitude: lon,
                current_weather: true,
                daily: "sunrise,sunset",
                timezone: "auto"
            }
        });

        const weather = weatherResponse.data.current_weather;
        const daily = weatherResponse.data.daily;

        res.send(`
            <!doctype html>
            <html lang="pl">
            <head>
                <meta charset="UTF-8">
                <title>Pogoda w ${city}</title>
                <link rel="stylesheet" href="/style.css">
            </head>
            <body>
                <div class="weather-card">
                    <h1>Pogoda w ${city}</h1>
                    <p><strong>Temperatura:</strong> ${weather.temperature}°C</p>
                    <p><strong>Wiatr:</strong> ${weather.windspeed} km/h</p>
                    <p><strong>Wschód słońca:</strong> ${daily.sunrise[0]}</p>
                    <p><strong>Zachód słońca:</strong> ${daily.sunset[0]}</p>
                    <a href="/">Powrót</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error(error);
        res.send("Wystąpił błąd podczas pobierania pogody.");
    }
});


app.listen(PORT, '0.0.0.0');
