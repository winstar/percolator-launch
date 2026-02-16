# Builder stage
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config and root package files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy shared, core, and keeper packages
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY packages/keeper ./packages/keeper

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build shared and core first
RUN pnpm --filter @percolator/shared build
RUN pnpm --filter @percolator/core build

# Build keeper
RUN pnpm --filter @percolator/keeper build

# Runner stage
FROM node:22-alpine AS runner

WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/keeper/dist ./packages/keeper/dist
COPY --from=builder /app/packages/keeper/package.json ./packages/keeper/

# Copy all node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=builder /app/packages/keeper/node_modules ./packages/keeper/node_modules

# Copy workspace config for runtime
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./

WORKDIR /app/packages/keeper

CMD ["node", "dist/index.js"]
