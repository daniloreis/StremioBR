FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

ENV PORT=7000
ENV NODE_ENV=production

EXPOSE 7000

CMD ["node", "index.js"]
