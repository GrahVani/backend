# ============================================================
# Grahvani Backend - Multi-Service Dockerfile
# Usage: docker build --build-arg SERVICE_NAME=auth-service --build-arg ENTRY_FILE=main.js .
# ============================================================

# ---- Stage 1: Install dependencies ----
FROM node:22-alpine AS deps

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json turbo.json ./

# Copy contracts package (shared dependency)
COPY contracts/package.json ./contracts/

# Copy all service package.json files (needed for npm workspace resolution)
COPY services/auth-service/package.json ./services/auth-service/
COPY services/user-service/package.json ./services/user-service/
COPY services/client-service/package.json ./services/client-service/
COPY services/astro-engine/package.json ./services/astro-engine/
COPY services/media-service/package.json ./services/media-service/
COPY services/slack-service/package.json ./services/slack-service/
COPY services/learning-service/package.json ./services/learning-service/
COPY services/knowledge-service/package.json ./services/knowledge-service/
COPY services/api-gateway/package.json ./services/api-gateway/
COPY services/tutor-service/package.json ./services/tutor-service/
COPY packages/tutor-database/package.json ./packages/tutor-database/

# Install all workspace dependencies (including dev for build step)
RUN npm ci --ignore-scripts

# ---- Stage 2: Build ----
FROM node:22-alpine AS builder

ARG SERVICE_NAME
ARG ENTRY_FILE=server.js

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy root config
COPY package.json turbo.json ./

# Copy contracts source and build it
COPY contracts/ ./contracts/
RUN cd contracts && npx tsc

# Copy shared tutor database package and build it (required by tutor-service)
COPY packages/tutor-database/ ./packages/tutor-database/
RUN cd packages/tutor-database && npm run generate && npm run build

# Copy target service source
COPY services/${SERVICE_NAME}/ ./services/${SERVICE_NAME}/

# Generate Prisma client if schema exists
RUN if [ -f "services/${SERVICE_NAME}/prisma/schema.prisma" ]; then \
      npx prisma generate --schema=services/${SERVICE_NAME}/prisma/schema.prisma; \
    fi

# Build the target service
RUN cd services/${SERVICE_NAME} && npx tsc

# Persist entry file path for runtime
RUN echo "dist/${ENTRY_FILE}" > /app/.entrypoint

# Ensure generated/prisma dirs exist so COPY won't fail
RUN mkdir -p services/${SERVICE_NAME}/src/generated/prisma \
    && mkdir -p services/${SERVICE_NAME}/prisma

# ---- Stage 3: Prune to production deps ----
FROM node:22-alpine AS pruner

WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY contracts/package.json ./contracts/
COPY services/auth-service/package.json ./services/auth-service/
COPY services/user-service/package.json ./services/user-service/
COPY services/client-service/package.json ./services/client-service/
COPY services/astro-engine/package.json ./services/astro-engine/
COPY services/media-service/package.json ./services/media-service/
COPY services/slack-service/package.json ./services/slack-service/
COPY services/learning-service/package.json ./services/learning-service/
COPY services/knowledge-service/package.json ./services/knowledge-service/
COPY services/api-gateway/package.json ./services/api-gateway/
COPY services/tutor-service/package.json ./services/tutor-service/
COPY packages/tutor-database/package.json ./packages/tutor-database/

RUN npm ci --omit=dev --ignore-scripts

# ---- Stage 4: Production runner ----
FROM node:22-alpine AS runner

ARG SERVICE_NAME

ENV NODE_ENV=production
ENV TZ=Asia/Kolkata

WORKDIR /app

# Install OpenSSL for Prisma engines on Alpine
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup --system --gid 1001 grahvani && \
    adduser --system --uid 1001 grahvani

# Copy production-only node_modules
COPY --from=pruner /app/node_modules ./node_modules

# Copy root package.json (workspace resolution)
COPY --from=builder /app/package.json ./

# Copy entrypoint marker
COPY --from=builder /app/.entrypoint ./.entrypoint

# Copy built contracts
COPY --from=builder /app/contracts/dist ./contracts/dist
COPY --from=builder /app/contracts/package.json ./contracts/

# Copy built service
COPY --from=builder /app/services/${SERVICE_NAME}/dist ./services/${SERVICE_NAME}/dist
COPY --from=builder /app/services/${SERVICE_NAME}/package.json ./services/${SERVICE_NAME}/

# Copy Prisma schema + generated client (dirs guaranteed to exist from builder)
COPY --from=builder /app/services/${SERVICE_NAME}/prisma/ ./services/${SERVICE_NAME}/prisma/
COPY --from=builder /app/services/${SERVICE_NAME}/src/generated/ ./services/${SERVICE_NAME}/src/generated/

# Copy shared tutor database package (runtime dependency)
COPY --from=builder /app/packages/tutor-database/package.json ./packages/tutor-database/
COPY --from=builder /app/packages/tutor-database/dist ./packages/tutor-database/dist
COPY --from=builder /app/packages/tutor-database/prisma ./packages/tutor-database/prisma
COPY --from=builder /app/packages/tutor-database/node_modules/.prisma ./packages/tutor-database/node_modules/.prisma

# Set ownership
RUN chown -R grahvani:grahvani /app

USER grahvani

WORKDIR /app/services/${SERVICE_NAME}

# Use shell form to read dynamic entrypoint
CMD node $(cat /app/.entrypoint)
