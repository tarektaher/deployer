# Laravel Dockerfile - PHP FPM with Nginx + Node.js Build
# ------------------------------------------------------------------------------
# Stage 1: Build Frontend Assets (Node.js)
# ------------------------------------------------------------------------------
FROM node:20-alpine AS node_build

WORKDIR /app

# Copy package files first to cache dependencies
COPY package.json package-lock.json* ./

# Install Node dependencies
RUN if [ -f package-lock.json ]; then \
        npm ci; \
    else \
        echo "Warning: No package-lock.json found, using npm install"; \
        npm install; \
    fi

# Copy the rest of the application source code
COPY . .

# Build assets (Vite/Mix)
# We ignore errors because some legacy projects might not have a build script, 
# but for standard Laravel apps this generates public/build
RUN npm run build || echo "No build script found or build failed, skipping..."

# ------------------------------------------------------------------------------
# Stage 2: Production Image (PHP-FPM + Nginx)
# ------------------------------------------------------------------------------
FROM php:{{PHP_VERSION}}-fpm-alpine AS base

# Install System Dependencies
RUN apk add --no-cache \
    nginx \
    supervisor \
    libpng-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    libzip-dev \
    oniguruma-dev \
    icu-dev \
    postgresql-dev \
    git \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
        pdo_mysql \
        pdo_pgsql \
        mbstring \
        exif \
        pcntl \
        bcmath \
        gd \
        zip \
        intl \
        opcache

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /var/www/html

# Copy Application Code
COPY . .

# Copy Compiled Assets from Stage 1
COPY --from=node_build /app/public /var/www/html/public

# Prepare .env for composer scripts
RUN if [ -f .env.example ] && [ ! -f .env ]; then cp .env.example .env; fi

# Install PHP Dependencies (Optimize for Production)
RUN composer install --no-dev --optimize-autoloader --no-interaction

# Set Permissions (Base ownership, detailed fix in entrypoint)
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html/storage \
    && chmod -R 755 /var/www/html/bootstrap/cache

# Copy Configuration Files
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY supervisord.conf /etc/supervisor.d/laravel.ini
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Make entrypoint executable
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# PHP Optimizations & Memory Limit
RUN echo "opcache.enable=1" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.memory_consumption=256" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.interned_strings_buffer=16" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.max_accelerated_files=10000" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.validate_timestamps=0" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "memory_limit=512M" >> /usr/local/etc/php/conf.d/custom.ini

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
