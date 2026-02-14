# Usamos la imagen oficial que YA TRAE Chrome instalado
FROM ghcr.io/puppeteer/puppeteer:21.5.2

# Saltamos la descarga de Puppeteer (ya está en el sistema)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Volvemos a root para instalar dependencias sin problemas de permisos
USER root

WORKDIR /app

# Copiamos el archivo de configuración
COPY package*.json ./

# CAMBIO AQUÍ: Usamos 'npm install' en lugar de 'npm ci'
# Esto creará el archivo lock si no existe, evitando el error.
RUN npm install

# Copiamos el resto del código
COPY . .

# Regresamos al usuario de seguridad de Puppeteer
USER pptruser

# Arrancamos
CMD ["node", "server.js"]