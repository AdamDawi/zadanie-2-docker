# Etap 1: Budowanie aplikacji i instalacja zależności
FROM scratch AS builder

# Oznaczenie autora zgodne ze standardem OCI
LABEL org.opencontainers.image.authors="Adam Dawidziuk"

# Dodanie mini-rootfs Alpine do obrazu (w celu zainstalowania Node.js)
ADD alpine-minirootfs-3.21.3-aarch64.tar /

# Ustawienie katalogu roboczego
WORKDIR /usr/app

# Instalacja menedżera pakietów, Node.js i npm
RUN apk add --no-cache nodejs npm

# Kopiowanie tylko package.json, aby lepiej wykorzystać cache
COPY package.json ./

# Instalacja tylko produkcyjnych zależności
RUN npm install --production

# Kopiowanie pozostałej zawartość projektu
COPY index.js ./
COPY public ./public

# Etap 2: Obraz końcowy
FROM node:20-alpine

# Ustawienie katalogu roboczego
WORKDIR /usr/app

# Instalacja curl
RUN apk add --no-cache curl

# Kopiowanie aplikacji z etapu budowania
COPY --from=builder /usr/app /usr/app

# Wystawienie portu
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=1s \
  CMD curl -f http://localhost:3000/ || exit 1

# Uruchomienie aplikacji
CMD ["index.js"]