"use strict";

require("dotenv").config();
const path = require("path");

const { createApp } = require("./app");

const PORT = process.env.PORT || 18780;

const CONFIG_ROOT = process.env.CONFIG_ROOT || "/openclaw-config";
const MAIN_WORKSPACE_DIR = (process.env.MAIN_WORKSPACE_DIR || "workspace").trim();
// Internal absolute root derived from public MAIN_WORKSPACE_DIR.
const MAIN_WORKSPACE_FS_ROOT = path.resolve(CONFIG_ROOT, MAIN_WORKSPACE_DIR);

const WORKSPACE_SERVICE_TOKEN = process.env.WORKSPACE_SERVICE_TOKEN;

const ALLOW_ANONYMOUS = process.env.WORKSPACE_SERVICE_ALLOW_ANONYMOUS === "true";

const SYMLINK_REMAP_PREFIXES = (
  process.env.SYMLINK_REMAP_PREFIXES || "/home/node/.openclaw"
)
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

function isValidMainWorkspaceDir(value) {
  if (!value || value === "." || value === "..") return false;
  return !value.includes("/") && !value.includes("\\");
}

// Enforce auth required unless explicitly opted out for local dev
if (!WORKSPACE_SERVICE_TOKEN && !ALLOW_ANONYMOUS) {
  console.error(
    "ERROR: WORKSPACE_SERVICE_TOKEN is required but not set.\n" +
      "Set a strong random token: export WORKSPACE_SERVICE_TOKEN=$(openssl rand -hex 32)\n" +
      "For local development only, you may set WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true to skip this check.",
  );
  process.exit(1);
}

if (!isValidMainWorkspaceDir(MAIN_WORKSPACE_DIR)) {
  console.error(
    "ERROR: MAIN_WORKSPACE_DIR must be a single directory name (no slashes, '\\\\', '.' or '..').",
  );
  process.exit(1);
}

const app = createApp({
  configRoot: CONFIG_ROOT,
  mainWorkspaceDir: MAIN_WORKSPACE_DIR,
  token: WORKSPACE_SERVICE_TOKEN,
  symlinkRemapPrefixes: SYMLINK_REMAP_PREFIXES,
});

app.listen(PORT, () => {
  console.log(`MosBot Workspace Service running on port ${PORT}`);
  console.log(`Config root: ${CONFIG_ROOT}`);
  console.log(`Main workspace dir: ${MAIN_WORKSPACE_DIR}`);
  console.log(`Main workspace FS root: ${MAIN_WORKSPACE_FS_ROOT}`);
  console.log(
    `Auth: ${WORKSPACE_SERVICE_TOKEN ? "enabled" : "disabled (WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true)"}`,
  );
  console.log(`Health check: http://localhost:${PORT}/health`);

  if (ALLOW_ANONYMOUS) {
    console.warn(
      "WARNING: WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true — authentication is disabled. Do not use in production.",
    );
  }
});
