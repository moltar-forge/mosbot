# MosBot Workspace Service - Multi-stage Docker build
# Use Debian slim for better multi-platform (arm64) build compatibility under QEMU
FROM node:18-bookworm-slim AS base

# Install security updates and dumb-init for proper signal handling
RUN apt-get update && \
  apt-get upgrade -y && \
  apt-get install -y --no-install-recommends dumb-init && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

# App directory (node user already exists in official image)
WORKDIR /app

# Production dependencies stage
FROM base AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && \
  npm cache clean --force

# Final production stage
FROM base AS production

# Set production environment
ENV NODE_ENV=production

WORKDIR /app

# Copy production dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application source
COPY --chown=node:node server.js ./

# Switch to non-root user
USER node

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]
