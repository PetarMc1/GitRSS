# Build frontend assets
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

ENV VITE_API_URL=/api
ENV VITE_ADMIN_STORAGE_KEY=gitrss-admin-session

RUN npm install -g pnpm@10

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/src ./src
COPY frontend/index.html frontend/vite.config.ts frontend/tsconfig.json ./
RUN pnpm build

FROM node:20-alpine AS backend-builder

WORKDIR /build/backend

RUN npm install -g pnpm@10

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY backend/src ./src
COPY backend/tsconfig.json ./
RUN pnpm build

FROM node:20-alpine AS backend-runtime-deps

WORKDIR /app/backend

RUN npm install -g pnpm@10

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache nginx

COPY --from=backend-runtime-deps /app/backend/node_modules /app/backend/node_modules
COPY --from=backend-builder /build/backend/dist /app/backend/dist
COPY --from=frontend-builder /build/frontend/dist /usr/share/nginx/html
COPY frontend/src/docs /usr/share/nginx/html/docs

COPY nginx/reverseproxy.conf /etc/nginx/http.d/default.conf

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
