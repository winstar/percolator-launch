FROM node:22-slim AS builder

WORKDIR /app

RUN npm install -g pnpm@10

# Copy everything from repo root (railway up uploads from root)
COPY . .

# Install deps
RUN pnpm install --no-frozen-lockfile

# Build core (uses tsup) then server (uses tsc)
RUN cd packages/core && npx tsup
RUN cd packages/server && npx tsc

FROM node:22-slim

WORKDIR /app

RUN npm install -g pnpm@10

COPY --from=builder /app .

EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
