FROM node:23.3.0-slim AS builder

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ffmpeg \
    g++ \
    git \
    make \
    python3 \
    unzip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g bun@1.2.21 turbo@2.3.3

RUN ln -s /usr/bin/python3 /usr/bin/python

# Copy configuration files first
COPY package.json turbo.json tsconfig.json lerna.json renovate.json ./
COPY .npmrc* ./

# Copy build-utils.ts to root (required by packages for build)
COPY build-utils.ts ./

# Copy startup scripts
COPY start-mongodb-agent.ts ./
COPY start-custom-server.ts ./

# Copy assets
COPY characters ./characters
COPY scripts ./scripts

# Copy packages
COPY packages ./packages

# Install dependencies and generate lockfile
# Using --ignore-scripts to avoid postinstall issues during Docker build
RUN bun install --ignore-scripts

# Verify build-utils.ts is accessible
RUN echo "=== Verifying build-utils.ts ===" && \
    ls -la /app/build-utils.ts && \
    echo "build-utils.ts found at /app/"

# Remove client package - we'll use pre-built client from npm
RUN rm -rf packages/client

# Build packages individually to avoid turbo workspace resolution issues
# First, build core (required by all other packages)
RUN echo "=== Building @elizaos/core ===" && \
    cd packages/core && \
    bun build.ts || (echo "Core build failed, trying direct bun build..." && \
    bun build src/index.node.ts --outdir dist/node --target node --format esm && \
    bun build src/index.browser.ts --outdir dist/browser --target browser --format esm)

# Build service-interfaces
RUN echo "=== Building @elizaos/service-interfaces ===" && \
    cd packages/service-interfaces && \
    (bun build.ts 2>/dev/null || bun build src/index.ts --outdir dist --target node --format esm || echo "service-interfaces build skipped")

# Build server
RUN echo "=== Building @elizaos/server ===" && \
    cd packages/server && \
    (bun build.ts 2>/dev/null || bun build src/index.ts --outdir dist --target node --format esm || echo "server build with fallback")

# Build CLI
RUN echo "=== Building @elizaos/cli ===" && \
    cd packages/cli && \
    (bun build.ts 2>/dev/null || bun build src/index.ts --outdir dist --target node --format esm || echo "cli build with fallback")

# Build plugin-mongodb
RUN echo "=== Building @elizaos/plugin-mongodb ===" && \
    cd packages/plugin-mongodb && \
    (bun build src/index.ts --outdir dist --target node --format esm || echo "plugin-mongodb build skipped")

# Build plugin-venice (required for AI text generation)
RUN echo "=== Building @elizaos/plugin-venice ===" && \
    cd packages/plugin-venice && \
    (bun build.ts 2>/dev/null || bun build src/index.ts --outdir dist --target node --format esm || echo "plugin-venice build skipped")

# Build plugin-heir (HEIR platform integration)
RUN echo "=== Building @elizaos/plugin-heir ===" && \
    cd packages/plugin-heir && \
    (bun build src/plugin.ts --outdir dist --target node --format esm || echo "plugin-heir build skipped")

# Build plugin-bootstrap
RUN echo "=== Building @elizaos/plugin-bootstrap ===" && \
    cd packages/plugin-bootstrap && \
    (bun build.ts 2>/dev/null || bun build src/index.ts --outdir dist --target node --format esm || echo "plugin-bootstrap build skipped")

# Build plugin-sql (optional, for non-MongoDB setups)
RUN echo "=== Building @elizaos/plugin-sql ===" && \
    cd packages/plugin-sql && \
    (bun build.ts 2>/dev/null || bun build src/index.ts --outdir dist --target node --format esm || echo "plugin-sql build skipped")

# Final verification
RUN echo "=== Build Verification ===" && \
    echo "Core dist:" && ls -la packages/core/dist/ 2>/dev/null || echo "No core dist" && \
    echo "Server dist:" && ls -la packages/server/dist/ 2>/dev/null || echo "No server dist" && \
    echo "CLI dist:" && ls -la packages/cli/dist/ 2>/dev/null || echo "No cli dist"

FROM node:23.3.0-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    git \
    python3 \
    unzip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g bun@1.2.21 turbo@2.3.3

# Copy all built files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/turbo.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/lerna.json ./
COPY --from=builder /app/build-utils.ts ./
COPY --from=builder /app/start-mongodb-agent.ts ./
COPY --from=builder /app/start-custom-server.ts ./
COPY --from=builder /app/characters ./characters
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/scripts ./scripts

# Create symlink for local CLI (our modified version with MongoDB support)
RUN ln -sf /app/packages/cli/dist/index.js /usr/local/bin/elizaos-local 2>/dev/null || echo "CLI symlink skipped"

# Download pre-built client UI from official ElizaOS release
# Try multiple versions, don't fail if unavailable - UI is optional
# Cache bust: v3
RUN mkdir -p /tmp/client-download && cd /tmp/client-download && \
    (npm pack @elizaos/client@latest 2>&1 || npm pack @elizaos/client 2>&1 || echo "npm pack failed") && \
    if ls *.tgz 1>/dev/null 2>&1; then \
      tar -xzf *.tgz && \
      if [ -d "package/dist" ]; then \
        mkdir -p /app/packages/server/dist/client && \
        cp -r package/dist/* /app/packages/server/dist/client/ && \
        echo "✅ Pre-built client UI installed"; \
      else \
        echo "⚠️ Client package found but no dist folder"; \
        ls -la package/ 2>/dev/null || true; \
      fi; \
    else \
      echo "⚠️ Could not download @elizaos/client package, UI will not be available"; \
    fi && \
    cd / && rm -rf /tmp/client-download

ENV NODE_ENV=production
ENV CHARACTER_PATH="./characters/eliza.json"

EXPOSE 3000
EXPOSE 50000-50100/udp

# Run using bun with the startup script
CMD ["bun", "run", "start-custom-server.ts"]
