# React SPA - Multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (use npm install to handle missing lock files)
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Build the app
RUN npm run build

# Normalize output directory (Vite uses dist, CRA uses build)
RUN if [ -d "build" ] && [ ! -d "dist" ]; then mv build dist; fi

# Production stage
FROM nginx:alpine AS production

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
