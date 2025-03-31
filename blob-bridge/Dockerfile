FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY vercel-blob-bridge.js ./

RUN mkdir -p /app/logs

EXPOSE 3001

CMD ["node", "vercel-blob-bridge.js"]