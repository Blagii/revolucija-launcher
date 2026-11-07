FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY src ./src

# Podaci (announcements.json) — mount-ujte volumen: -v $(pwd)/data:/app/data
ENV BOT_DATA_FILE=/app/data/announcements.json
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 8734

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8734/healthz || exit 1

CMD ["node", "src/index.js"]
