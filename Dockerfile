# syntax=docker/dockerfile:1.6

# ---------- Stage 1: build ---------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Install all deps (including dev) so we can compile TypeScript.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies before we copy node_modules into the runtime image.
RUN npm prune --omit=dev

# ---------- Stage 2: runtime -------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Run as a non-root user for the usual reasons.
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

USER app
EXPOSE 3000

# A lightweight liveness probe — no curl/wget in the alpine image, so use node.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
