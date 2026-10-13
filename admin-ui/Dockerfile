# admin-ui/Dockerfile
FROM node:26-alpine AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:26-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY --from=web-build /web/dist ./public
ENV ADMIN_UI_PORT=9027
EXPOSE 9027
CMD ["node", "src/index.js"]
