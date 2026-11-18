# The SilverShop corre en Node; los APK viven en /data
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-fund --no-audit

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "server.js"]
