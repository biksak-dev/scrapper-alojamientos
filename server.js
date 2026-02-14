const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'public')));

app.post('/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });

    console.log(`--- Analizando URL: ${url} ---`);
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            // Esta es la ruta exacta donde nixpacks instala chromium
            executablePath: '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process', 
                '--no-zygote'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Tiempo de espera para que cargue el contenido dinámico de Airbnb/Booking
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        const data = await page.evaluate(() => {
            const title = document.title;
            // Selector genérico de precios para empezar
            const price = document.querySelector('[data-testid="price-and-discounted-price"], ._tyxjp1')?.innerText || "Precio no detectado";
            
            return {
                url: document.location.href,
                title: title.split('-')[0].trim(),
                totalPrice: price
            };
        });

        await browser.close();
        console.log("✅ Análisis exitoso");
        res.json(data);

    } catch (e) {
        console.error("❌ Error en scraper:", e.message);
        if (browser) await browser.close();
        res.status(500).json({ error: 'Error: ' + e.message });
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor en puerto ${PORT}`));