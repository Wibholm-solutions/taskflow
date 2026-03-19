FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json .
COPY --from=builder /app/package-lock.json .
RUN npm ci --omit=dev && npm cache clean --force
RUN mkdir -p /app/data && chown node:node /app/data
EXPOSE 3000
USER node
CMD ["node", "dist/server/index.js"]
