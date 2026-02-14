const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// Activar plugin de sigilo
puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- CONFIGURACIÓN DE RUTAS ---
// Usamos path.join con __dirname para asegurar que Railway encuentre la carpeta 'public'
const publicPath = path.join(__dirname, 'public');

// 1. Servir archivos estáticos (CSS, JS, imágenes dentro de public)
app.use(express.static(publicPath));

// 2. Ruta para el Scraper
app.post('/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });

    console.log(`Analizando URL: ${url}`);
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process', 
                '--no-zygote'
            ]
        });

        const page = await browser.newPage();
        
        // Optimización de carga
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const data = await page.evaluate(() => {
            const cleanPrice = (txt) => {
                if (!txt) return 0;
                const clean = txt.replace(/[^0-9,.]/g, '');
                if (!clean) return 0;
                let val = parseFloat(clean.replace(/\./g, '').replace(/,/g, '.'));
                if (val < 100 && clean.length > 4) val = parseFloat(clean.replace(/,/g, ''));
                return val;
            };

            const isStrikethrough = (el) => {
                const style = window.getComputedStyle(el);
                return style.textDecorationLine.includes('line-through') || el.tagName === 'DEL';
            };

            const title = document.title;
            const bodyText = document.body.innerText.toLowerCase();
            
            let type = 'Alojamiento';
            if (title.toLowerCase().includes('hotel')) type = 'Hotel';
            else if (title.toLowerCase().includes('hostal')) type = 'Hostal';
            else if (title.toLowerCase().includes('apartamento')) type = 'Apartamento';

            let location = 'Ver mapa';
            const locEl = document.querySelector('.hp_address_subtitle, [data-node_tt_id="location_score_tooltip"], h1, ._152qbzi');
            if (locEl) location = locEl.innerText.trim();

            const hasPool = bodyText.includes('piscina') || bodyText.includes('pool');

            let finalPrice = 0;
            const bookingEl = document.querySelector('[data-testid="price-and-discounted-price"]');
            if (bookingEl) {
                finalPrice = cleanPrice(bookingEl.innerText);
            } else {
                const elements = Array.from(document.querySelectorAll('span, div, p'));
                const candidates = elements.filter(el => {
                    const txt = el.innerText;
                    return (txt.includes('$') || txt.includes('€') || txt.includes('COP')) && /\d/.test(txt) && !isStrikethrough(el);
                });
                const totalEl = candidates.find(el => el.parentElement?.innerText.toLowerCase().includes('total'));
                if (totalEl) finalPrice = cleanPrice(totalEl.innerText);
                else if (candidates.length > 0) {
                    const vals = candidates.map(c => cleanPrice(c.innerText));
                    finalPrice = Math.max(...vals);
                }
            }

            return { url: document.location.href, title, type, location, totalPrice: finalPrice, hasPool: hasPool ? 'Sí' : 'No' };
        });

        await browser.close();
        res.json(data);

    } catch (error) {
        if(browser) await browser.close();
        console.error(error);
        res.status(500).json({ error: 'Error en el scraper' });
    }
});

// 3. CAPTURA TODAS LAS DEMÁS RUTAS (Fallback)
// Esto asegura que si entras a la raíz /, el servidor entregue el index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor activo en puerto ${PORT}`);
    console.log(`Buscando archivos en: ${publicPath}`);
});