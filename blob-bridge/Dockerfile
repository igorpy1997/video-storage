FROM node:18-alpine

WORKDIR /app

# Копіюємо файл package.json
COPY package*.json ./

# Використовуємо npm install замість npm ci
RUN npm install --omit=dev

# Копіюємо код
COPY vercel-blob-bridge.js ./

# Створюємо папку для логів
RUN mkdir -p /app/logs

# Експонуємо порт
EXPOSE 3001

# Запускаємо сервер
CMD ["node", "vercel-blob-bridge.js"]