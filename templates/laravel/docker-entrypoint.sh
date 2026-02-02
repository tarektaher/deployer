#!/bin/sh
set -e

# Fix permissions for storage and cache directories
# using `set -x` to verify execution in logs if needed
# We assume the container runs as root initially (default in this image)
# and drops privileges via supervisord configuration, or we fix perms here.

echo "Setting permissions for Laravel directories..."

# Ensure storage structure exists
mkdir -p /var/www/html/storage/app/public
mkdir -p /var/www/html/storage/framework/cache/data
mkdir -p /var/www/html/storage/framework/sessions
mkdir -p /var/www/html/storage/framework/views
mkdir -p /var/www/html/storage/logs
mkdir -p /var/www/html/bootstrap/cache

# Fix ownership
# Force chown to www-data for critical directories
chown -R www-data:www-data /var/www/html/storage
chown -R www-data:www-data /var/www/html/bootstrap/cache

# Fix permissions
# 775 allows group (www-data) to write
chmod -R 775 /var/www/html/storage
chmod -R 775 /var/www/html/bootstrap/cache

echo "Creating storage symlink..."
# Run as www-data to ensure logs/cache created during this command are owned by www-data
su -s /bin/sh -c "php artisan storage:link --force" www-data || echo "Storage link creation failed or already exists."

# Run passed command
exec "$@"
