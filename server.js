const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(bodyParser.json());

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Función para encontrar el navegador manualmente
function findBrowser() {
    const paths = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome'
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            console.log("✅ Navegador encontrado en:", p);
            return p;
        }
    }
    console.log("❌ No se encontró ningún navegador en las rutas estándar.");
    return null;
}

app.post('/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });

    console.log(`--- Iniciando análisis para: ${url} ---`);
    const browserPath = findBrowser();
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: browserPath, // Forzamos la ruta encontrada
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
        await new Promise(r => setTimeout(r, 3000));

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
            return {
                url: document.location.href,
                title: document.title.split('-')[0].trim(),
                location: document.querySelector('[data-testid="address"], .hp_address_subtitle')?.innerText.trim() || "Ver mapa",
                totalPrice: priceEl ? cleanP(priceEl.innerText) : 0,
                hasPool: document.body.innerText.toLowerCase().includes('piscina') ? 'Sí' : 'No'
            };
        });

        await browser.close();
        console.log("✅ Análisis completado con éxito");
        res.json(data);

    } catch (e) {
        console.error("❌ ERROR EN EL SCRAPER:", e.message);
        if (browser) await browser.close();
        res.status(500).json({ error: 'Error: ' + e.message });
    }
});

app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor listo en puerto ${PORT}`);
});