# Multi-stage build: builder
FROM node:20-alpine AS builder

WORKDIR /build

# Install pnpm
RUN npm install -g pnpm@10

# Copy package files
COPY backend/package.json backend/pnpm-lock.yaml ./

# Install dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY backend/src ./src
COPY backend/tsconfig.json .

# Build TypeScript
RUN pnpm build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm@10

COPY backend/package.json backend/pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /build/dist ./dist
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["node", "dist/index.js"]
