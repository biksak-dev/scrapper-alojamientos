const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// Activar plugin de sigilo para evitar bloqueos
puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(bodyParser.json());

// CONFIGURACIÓN DE RUTAS ESTÁTICAS
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// ENDPOINT DEL SCRAPER
app.post('/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });

    console.log(`Analizando URL: ${url}`);
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            // Esto le dice: "Usa la ruta que te de el sistema, o busca la de Puppeteer"
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null, 
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process', 
                '--no-zygote',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        
        // Simular un navegador real
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 90000 
        });

        // Espera de cortesía para contenido dinámico
        await new Promise(r => setTimeout(r, 2000));

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
            if (bodyText.includes('hotel')) type = 'Hotel';
            else if (bodyText.includes('hostal')) type = 'Hostal';
            else if (bodyText.includes('apartamento')) type = 'Apartamento';

            let location = 'Ver mapa';
            const locEl = document.querySelector('.hp_address_subtitle, [data-node_tt_id="location_score_tooltip"], h1, ._152qbzi, [data-testid="address"]');
            if (locEl) location = locEl.innerText.trim();

            const hasPool = bodyText.includes('piscina') || bodyText.includes('pool');

            let finalPrice = 0;
            const bookingEl = document.querySelector('[data-testid="price-and-discounted-price"], .prco-valign-middle-helper, ._tyxjp1');
            
            if (bookingEl) {
                finalPrice = cleanPrice(bookingEl.innerText);
            } else {
                const elements = Array.from(document.querySelectorAll('span, div, p'));
                const candidates = elements.filter(el => {
                    const txt = el.innerText;
                    return (txt.includes('$') || txt.includes('€') || txt.includes('COP')) && /\d/.test(txt) && !isStrikethrough(el);
                });
                if (candidates.length > 0) {
                    const vals = candidates.map(c => cleanPrice(c.innerText));
                    finalPrice = Math.max(...vals);
                }
            }

            return { 
                url: document.location.href, 
                title: title.split('-')[0].trim(), 
                type, 
                location, 
                totalPrice: finalPrice, 
                hasPool: hasPool ? 'Sí' : 'No' 
            };
        });

        await browser.close();
        res.json(data);

    } catch (error) {
        if(browser) await browser.close();
        res.status(500).json({ error: 'Error en el scraper: ' + error.message });
    }
});

// FALLBACK PARA SERVIR EL HTML
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// PUERTO PARA RAILWAY
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});