#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
php artisan config:cache
php artisan migrate --force
exec apache2-foreground
