#!/bin/sh
set -e

# Escape a string for safe inclusion in a double-quoted JavaScript string literal.
escape_js() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n' ' '
}

# Generate runtime config from environment variables.
# This file is loaded by index.html before the app bundle, allowing
# VITE_API_URL and VITE_APP_NAME to be set at container start
# without rebuilding the image.
cat > /usr/share/nginx/html/config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  VITE_API_URL: "$(escape_js "${VITE_API_URL:-}")",
  VITE_APP_NAME: "$(escape_js "${VITE_APP_NAME:-}")"
};
EOF

exec nginx -g 'daemon off;'
