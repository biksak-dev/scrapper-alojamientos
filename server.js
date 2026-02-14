const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// Configuración anti-bloqueo
puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Servir archivos estáticos (Frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint del Scraper
app.post('/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });

    console.log(`Procesando URL: ${url}`);
    
    let browser;
    try {
        // Lanzar navegador optimizado para Railway/Docker
        browser = await puppeteer.launch({
            headless: "new",
            // ESTA LÍNEA ES LA CLAVE:
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process', 
                '--no-zygote'
            ]
        });

        const page = await browser.newPage();
        
        // Bloquear recursos pesados para ahorrar memoria
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Navegar a la URL (Timeout 60s)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Extraer datos
        const data = await page.evaluate(() => {
            // Funciones de ayuda internas
            const parsePrice = (text) => {
                if (!text) return 0;
                const clean = text.replace(/[^0-9,.]/g, '');
                if (!clean) return 0;
                let num = parseFloat(clean.replace(/\./g, '').replace(/,/g, '.'));
                // Corrección para miles si el formato es distinto
                if (num < 100 && clean.length > 4) num = parseFloat(clean.replace(/,/g, ''));
                return num;
            };

            const isStrikethrough = (element) => {
                const style = window.getComputedStyle(element);
                return style.textDecorationLine.includes('line-through') || element.tagName === 'DEL';
            };

            const title = document.title;
            const bodyText = document.body.innerText.toLowerCase();

            // Tipo de alojamiento
            let type = 'Alojamiento';
            if (title.toLowerCase().includes('hotel')) type = 'Hotel';
            else if (title.toLowerCase().includes('hostal') || title.toLowerCase().includes('hostel')) type = 'Hostal';
            else if (title.toLowerCase().includes('apartamento') || title.toLowerCase().includes('depto')) type = 'Apartamento';
            else if (title.toLowerCase().includes('casa') || title.toLowerCase().includes('villa')) type = 'Casa';

            // Ubicación
            let location = 'Ver en mapa';
            const locEl = document.querySelector('.hp_address_subtitle, [data-node_tt_id="location_score_tooltip"], h1, ._152qbzi');
            if (locEl) location = locEl.innerText.trim();

            // Piscina
            const hasPool = bodyText.includes('piscina') || bodyText.includes('pool') || bodyText.includes('alberca');

            // Precio inteligente
            let finalPrice = 0;
            
            // Intento 1: Booking directo
            const bookingPriceEl = document.querySelector('[data-testid="price-and-discounted-price"]');
            
            if (bookingPriceEl) {
                finalPrice = parsePrice(bookingPriceEl.innerText);
            } else {
                // Intento 2: Búsqueda genérica
                const allPriceElements = Array.from(document.querySelectorAll('span, div, p'));
                const candidates = allPriceElements.filter(el => {
                    const text = el.innerText;
                    return (text.includes('$') || text.includes('€') || text.includes('COP')) && 
                           /\d/.test(text) && 
                           text.length < 30 && 
                           !isStrikethrough(el);
                });

                // Buscar la palabra "Total" cerca
                let totalCandidate = candidates.find(el => {
                    const parentText = el.parentElement ? el.parentElement.innerText.toLowerCase() : '';
                    return parentText.includes('total');
                });

                if (totalCandidate) {
                    finalPrice = parsePrice(totalCandidate.innerText);
                } else if (candidates.length > 0) {
                    // Si no hay total explícito, tomar el valor más alto no tachado
                    const prices = candidates.map(el => parsePrice(el.innerText));
                    finalPrice = Math.max(...prices);
                }
            }

            return {
                url: document.location.href,
                title,
                type,
                location,
                totalPrice: finalPrice || 0,
                hasPool: hasPool ? 'Sí' : 'No'
            };
        });

        await browser.close();
        res.json(data);

    } catch (error) {
        if(browser) await browser.close();
        console.error("Error scraping:", error);
        res.status(500).json({ error: 'Error al procesar la URL.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});