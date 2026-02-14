# Usamos la imagen oficial que YA TRAE Chrome instalado
# Esto evita descargas y timeouts durante el build
FROM ghcr.io/puppeteer/puppeteer:21.5.2

# Saltamos la descarga de Puppeteer porque ya tenemos el navegador del sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Volvemos al usuario root para poder copiar archivos sin problemas de permisos
USER root

WORKDIR /app

# Copiamos tus archivos de configuración
COPY package*.json ./

# Instalamos tus dependencias (Express, etc.)
RUN npm ci

# Copiamos el resto de tu código
COPY . .

# Volvemos al usuario seguro (pptruser) que exige esta imagen
USER pptruser

# Arrancamos
CMD ["node", "server.js"]