FROM node:22-slim

ENV NODE_ENV=production

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server ./server
COPY dist ./dist
COPY obsidian-assets ./obsidian-assets

ENV PORT=80 \
    VAULT_ROOT=/app/vaults \
    OBSIDIAN_ASSETS_PATH=/app/obsidian-assets \
    DATA_ROOT=/app/data

RUN mkdir -p /app/vaults /app/data

EXPOSE 80

CMD ["node", "server/index.js"]
