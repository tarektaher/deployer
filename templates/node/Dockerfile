# Node.js API Server
FROM node:20-alpine

# Install tini for proper signal handling
RUN apk add --no-cache tini

# Create non-root user
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs nodejs

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN if [ -f package-lock.json ]; then \
        npm ci --only=production; \
    else \
        echo "Warning: No package-lock.json found, using npm install"; \
        npm install --production; \
    fi

# Copy source
COPY . .

# Build if build script exists
RUN if [ -f "package.json" ] && grep -q '"build"' package.json; then npm run build; fi

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose default port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:3000/health || wget -q --spider http://localhost:3000/ || exit 1

# Use tini as init
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["npm", "start"]
