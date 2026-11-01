# Build a partir da raiz do repositório: React e Laravel no mesmo serviço.
FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build

FROM php:8.4-apache
RUN apt-get update && apt-get install -y --no-install-recommends \
    git unzip libicu-dev libonig-dev libpq-dev libzip-dev libxml2-dev \
    && docker-php-ext-install -j"$(nproc)" bcmath dom intl mbstring pdo_mysql pdo_pgsql zip \
    && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
WORKDIR /var/www/html
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --prefer-dist --no-interaction --no-scripts --optimize-autoloader
COPY backend/ ./
COPY --from=frontend /app/frontend/dist/ ./public/
# Não deixar Apache servir index.html por fora do roteamento Laravel.
RUN mv public/index.html public/storefront.html \
    && rm -f public/_headers \
    && composer dump-autoload --no-dev --optimize \
    && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R ug+rwX storage bootstrap/cache
RUN a2enmod rewrite headers \
    && sed -i 's#DocumentRoot /var/www/html#DocumentRoot /var/www/html/public#' /etc/apache2/sites-available/000-default.conf \
    && sed -i 's/Listen 80/Listen 10000/' /etc/apache2/ports.conf \
    && sed -i 's/:80>/:10000>/' /etc/apache2/sites-available/000-default.conf \
    && printf '<Directory /var/www/html/public>\n    AllowOverride All\n    Require all granted\n</Directory>\n' > /etc/apache2/conf-available/laravel.conf \
    && a2enconf laravel
ENV PORT=10000
EXPOSE 10000
CMD ["sh", "/var/www/html/docker/migrate-and-start.sh"]
