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
                '--no-zygote',
                '--disable-gpu' // Ahorra memoria en Railway
            ]
        });

        const page = await browser.newPage();
        
        // Simular un navegador real para evitar bloqueos
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

        // Bloquear recursos pesados
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Aumentamos el tiempo de espera y usamos 'domcontentloaded' que es más rápido
        await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 90000 
        });

        // Esperar un par de segundos por si hay contenido dinámico
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
            else if (bodyText.includes('hostal') || bodyText.includes('hostel')) type = 'Hostal';
            else if (bodyText.includes('apartamento') || bodyText.includes('apartment')) type = 'Apartamento';
            else if (bodyText.includes('casa') || bodyText.includes('house')) type = 'Casa';

            let location = 'Ver mapa';
            const locEl = document.querySelector('.hp_address_subtitle, [data-node_tt_id="location_score_tooltip"], h1, ._152qbzi, [data-testid="address"]');
            if (locEl) location = locEl.innerText.trim();

            const hasPool = bodyText.includes('piscina') || bodyText.includes('pool') || bodyText.includes('alberca');

            let finalPrice = 0;
            // Buscamos el precio final (no tachado)
            const bookingEl = document.querySelector('[data-testid="price-and-discounted-price"], .prco-valign-middle-helper, ._tyxjp1');
            
            if (bookingEl) {
                finalPrice = cleanPrice(bookingEl.innerText);
            } else {
                const elements = Array.from(document.querySelectorAll('span, div, p'));
                const candidates = elements.filter(el => {
                    const txt = el.innerText;
                    return (txt.includes('$') || txt.includes('€') || txt.includes('COP')) && /\d/.test(txt) && !isStrikethrough(el);
                });
                
                // Intentar encontrar el valor más grande que suele ser el total
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
        console.error("DETALLE DEL ERROR:", error.message);
        if(browser) await browser.close();
        res.status(500).json({ error: 'Error al procesar la página: ' + error.message });
    }
});