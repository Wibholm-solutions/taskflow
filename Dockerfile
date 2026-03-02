FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npx playwright install chromium --with-deps

FROM node:20
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
RUN npx playwright install-deps chromium
COPY --from=builder /app/package.json .
COPY --from=builder /app/server/tests ./server/tests
COPY --from=builder /app/server/src ./server/src
COPY --from=builder /app/client/tests ./client/tests
COPY --from=builder /app/client/src ./client/src
COPY --from=builder /app/client/tsconfig.json ./client/tsconfig.json
COPY --from=builder /app/e2e ./e2e
COPY --from=builder /app/vitest.config.ts .
COPY --from=builder /app/tsconfig.json .
COPY --from=builder /root/.cache/ms-playwright /home/node/.cache/ms-playwright
RUN chown -R node:node /app /home/node/.cache/ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright
EXPOSE 3000
USER node
CMD ["node", "dist/server/index.js"]
