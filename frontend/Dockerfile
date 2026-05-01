# Multi-stage build: builder
FROM node:20-alpine AS builder

WORKDIR /build

# Allow setting the API URL at build time so Vite embeds it into the bundle
ENV VITE_API_URL=/api

# Install pnpm
RUN npm install -g pnpm@10

# Copy package files
COPY frontend/package.json frontend/pnpm-lock.yaml ./

# Install dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY frontend/src ./src
COPY frontend/index.html frontend/vite.config.ts frontend/tsconfig.json ./

# Build React app with Vite
RUN pnpm build

# Runtime stage: nginx for static file serving
FROM nginx:1.27-alpine

# Copy nginx configuration
COPY frontend/nginx.conf /etc/nginx/nginx.conf

# Copy built React files
COPY --from=builder /build/dist /usr/share/nginx/html

# Copy docs directory for OpenAPI/Swagger
COPY docs /usr/share/nginx/html/docs

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
