FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# BASE_PATH must be present at build time so vite bundles the client with the
# correct asset base (e.g. /todo). Runtime BASE_PATH is set separately for the server.
ARG BASE_PATH=/
ENV BASE_PATH=$BASE_PATH
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
