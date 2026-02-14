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

    console.log(`--- Iniciando Scraper para: ${url} ---`);
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: "new",
            // IMPORTANTE: No definimos executablePath manual.
            // La imagen de Docker ya configuró la variable de entorno automáticamente.
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Vital para evitar crashes de memoria
                '--single-process', 
                '--no-zygote'
            ]
        });

        const page = await browser.newPage();
        
        // Fingimos ser un usuario normal
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

        // Timeout generoso
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Espera de seguridad
        await new Promise(r => setTimeout(r, 2000));

        const data = await page.evaluate(() => {
            const priceEl = document.querySelector('[data-testid="price-and-discounted-price"], ._tyxjp1, span._1y74zjx');
            const titleEl = document.querySelector('h1');
            
            return {
                url: document.location.href,
                title: titleEl ? titleEl.innerText : document.title,
                totalPrice: priceEl ? priceEl.innerText : "Precio no encontrado"
            };
        });

        console.log("✅ Datos extraídos:", data);
        await browser.close();
        res.json(data);

    } catch (e) {
        console.error("❌ Error:", e.message);
        if (browser) await browser.close();
        res.status(500).json({ error: 'Error: ' + e.message });
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor listo en puerto ${PORT}`));