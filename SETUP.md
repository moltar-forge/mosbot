# Setup and Publishing Guide

This guide explains how to set up and publish the MosBot Workspace Service Docker image to GitHub Container Registry (GHCR).

## Prerequisites

1. GitHub account with access to the `bymosbot` organization
2. Docker installed locally (for testing)
3. Git configured

## Initial Setup

### 1. Initialize Git Repository

```bash
cd /Users/mosufy/Documents/webapps/Mosbot/mosbot-workspace-service
git init
git add .
git commit -m "Initial commit: MosBot Workspace Service"
```

### 2. Create GitHub Repository

1. Go to <https://github.com/organizations/bymosbot/repositories/new>
2. Repository name: `mosbot-workspace-service`
3. Description: "Lightweight HTTP service that exposes OpenClaw workspace files over REST API"
4. Visibility: Public (or Private, depending on your preference)
5. **Do NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

### 3. Push to GitHub

```bash
git remote add origin https://github.com/bymosbot/mosbot-workspace-service.git
git branch -M main
git push -u origin main
```

## Publishing Docker Images

### Automatic Publishing via GitHub Actions

The repository includes a GitHub Actions workflow (`.github/workflows/docker-publish.yml`) that automatically builds and publishes Docker images when you:

- Push to `main` or `develop` branches
- Create a git tag (e.g., `v1.0.0`)
- Manually trigger via GitHub Actions UI

**Important**: The repository name must be exactly `bymosbot/mosbot-workspace-service` for the image to be published as `ghcr.io/bymosbot/mosbot-workspace-service:latest`.

### First Time Setup

1. **Enable GitHub Actions**: Go to repository Settings → Actions → General
   - Ensure "Allow all actions and reusable workflows" is enabled
   - Save changes

2. **Make Package Public** (if repository is public):
   - Go to the package page: <https://github.com/bymosbot/mosbot-workspace-service/pkgs/container/mosbot-workspace-service>
   - Click "Package settings"
   - Under "Danger Zone", click "Change visibility" → "Public"
   - Confirm

### Manual Publishing (Alternative)

If you prefer to build and push manually:

```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Build multi-platform image
docker buildx create --use
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/bymosbot/mosbot-workspace-service:latest \
  --push \
  .
```

## Testing Locally

Before pushing, test the Docker image locally:

```bash
# Build image
docker build -t mosbot-workspace-service:test .

# Run container
docker run -d \
  --name mosbot-workspace-test \
  -e WORKSPACE_SERVICE_TOKEN=test-token \
  -e CONFIG_ROOT=/openclaw-config \
  -e MAIN_WORKSPACE_DIR=workspace \
  -v /tmp/test-config:/openclaw-config \
  -p 18780:18780 \
  mosbot-workspace-service:test

# Test health endpoint
curl http://localhost:18780/health

# Cleanup
docker stop mosbot-workspace-test
docker rm mosbot-workspace-test
```

## Versioning

To publish a specific version:

```bash
git tag v0.1.0
git push origin v0.1.0
```

This will trigger the GitHub Actions workflow and publish:

- `ghcr.io/bymosbot/mosbot-workspace-service:v0.1.0`
- `ghcr.io/bymosbot/mosbot-workspace-service:0.1`
- `ghcr.io/bymosbot/mosbot-workspace-service:latest` (if on main branch)

## Verifying Publication

After pushing, verify the image is available:

```bash
# Pull and test the published image
docker pull ghcr.io/bymosbot/mosbot-workspace-service:latest
docker run --rm ghcr.io/bymosbot/mosbot-workspace-service:latest node --version
```

## Troubleshooting

### Image Not Found

- Ensure the repository name is exactly `bymosbot/mosbot-workspace-service`
- Check GitHub Actions workflow ran successfully
- Verify package visibility is set to Public (if needed)

### Authentication Errors

- Ensure `GITHUB_TOKEN` has `packages:write` permission
- Check repository Actions settings allow workflows to run

### Multi-platform Build Issues

- Ensure Docker Buildx is available: `docker buildx version`
- Create builder: `docker buildx create --use`
