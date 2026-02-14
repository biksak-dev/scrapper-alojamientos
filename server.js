const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { execSync } = require('child_process'); // Para buscar el navegador

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(bodyParser.json());

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Función para encontrar la ruta real de Chromium en Railway
function getChromiumPath() {
    try {
        // Intentamos encontrar dónde instaló Nixpacks el binario 'chromium'
        return execSync('which chromium').toString().trim();
    } catch (e) {
        // Si falla, intentamos con el nombre alternativo
        try {
            return execSync('which google-chrome-stable').toString().trim();
        } catch (e2) {
            return null; // Si no encuentra nada, Puppeteer usará su defecto
        }
    }
}

app.post('/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });

    const executablePath = getChromiumPath();
    console.log(`Usando navegador en: ${executablePath}`);
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: executablePath, // Aquí le pasamos la ruta real detectada
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

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 2000));

        const data = await page.evaluate(() => {
            const cleanP = (t) => {
                if (!t) return 0;
                const c = t.replace(/[^0-9,.]/g, '');
                if (!c) return 0;
                let v = parseFloat(c.replace(/\./g, '').replace(/,/g, '.'));
                if (v < 100 && c.length > 4) v = parseFloat(c.replace(/,/g, ''));
                return v;
            };

            const priceEl = document.querySelector('[data-testid="price-and-discounted-price"], .prco-valign-middle-helper, ._tyxjp1');
            let price = priceEl ? cleanP(priceEl.innerText) : 0;

            return {
                url: document.location.href,
                title: document.title.split('-')[0].trim(),
                location: document.querySelector('[data-testid="address"], .hp_address_subtitle')?.innerText.trim() || "Ver mapa",
                totalPrice: price,
                hasPool: document.body.innerText.toLowerCase().includes('piscina') ? 'Sí' : 'No'
            };
        });

        await browser.close();
        res.json(data);

    } catch (e) {
        if (browser) await browser.close();
        res.status(500).json({ error: 'Error: ' + e.message });
    }
});

app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});