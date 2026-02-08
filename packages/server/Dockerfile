FROM node:22-slim AS builder

# Install build tools for native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy everything (monorepo needs full context)
COPY . .

# Install all deps
RUN pnpm install --frozen-lockfile

# Build core first (server depends on it)
RUN cd packages/core && npx tsup

# Build server
RUN cd packages/server && npx tsc

# --- Runtime (slim) ---
FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/core/package.json packages/core/
COPY --from=builder /app/packages/core/dist/ packages/core/dist/
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/server/dist/ packages/server/dist/
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/packages/core/node_modules/ packages/core/node_modules/
COPY --from=builder /app/packages/server/node_modules/ packages/server/node_modules/

EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
