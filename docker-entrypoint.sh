#!/bin/bash
set -e

# Define the user IDs (using build args/env vars)
# Defaults to TrueNAS 'apps' user (568)
USER_ID=${USER_ID:-568}
GROUP_ID=${GROUP_ID:-568}

echo "Starting MySmartNotes Entrypoint..."
echo "Container running as UID: $(id -u), GID: $(id -g)"

# Ensure required directories exist on the host-mounted volumes
mkdir -p /app/data/notes /app/data/postgres /app/logs /app/generated /app/output /app/uploads

# Fix permissions for host-mounted volumes
# This allows the container to 'claim' ownership of folders owned by root
echo "Fixing permissions for /app/data and /app/logs (Target UID: $USER_ID)..."
chown -R $USER_ID:$GROUP_ID /app/data /app/logs /app/generated /app/output /app/uploads

# Drop privileges and execute the application
# We use gosu to ensure the python process runs as the non-root 'appuser'
echo "Dropping privileges to appuser..."
exec gosu appuser "$@"
