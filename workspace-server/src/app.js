"use strict";

const express = require("express");
const fs = require("fs").promises;
const path = require("path");

const ALLOWED_CONFIG_FILE_NAMES = new Set(["openclaw.json", "agents.json"]);
const ALLOWED_CONFIG_PREFIXES = [
  "projects",
  "skills",
  "docs",
  "_archived_workspace_main",
];
const WORKSPACE_AGENT_PATH_PATTERN = /^\/workspace-[^/]+(?:\/.*)?$/;
const PATH_NOT_ALLOWED_CODE = "PATH_NOT_ALLOWED";
const SHARED_DOCS_DIR = "docs";
const SUPPORTED_LINK_TYPE = "docs";
const LINK_TYPE_UNSUPPORTED_CODE = "LINK_TYPE_UNSUPPORTED";
const INVALID_AGENT_ID_CODE = "INVALID_AGENT_ID";
const LINK_CONFLICT_CODE = "LINK_CONFLICT";
const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

function buildPathNotAllowedErrorPayload(err) {
  return {
    error: err?.message || "Path not allowed",
    code: PATH_NOT_ALLOWED_CODE,
    path: err?.normalizedPath || null,
  };
}

/**
 * Build and return an Express app configured with the given options.
 *
 * @param {object} opts
 * @param {string} opts.configRoot - Absolute path to OpenClaw config root
 * @param {string} opts.mainWorkspaceDir - Main workspace directory name under config root
 * @param {string|undefined} opts.token - Bearer token; undefined means anonymous access
 * @param {string[]} opts.symlinkRemapPrefixes - Absolute path prefixes to remap for symlinks
 */
function createApp(opts) {
  const { configRoot, mainWorkspaceDir, token, symlinkRemapPrefixes } = opts;

  const CONFIG_ROOT = path.resolve(configRoot);
  // Internal absolute root derived from public MAIN_WORKSPACE_DIR contract.
  const MAIN_WORKSPACE_FS_ROOT = path.resolve(CONFIG_ROOT, mainWorkspaceDir);

  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // ── Auth middleware ────────────────────────────────────────────────────────

  const optionalAuth = (req, res, next) => {
    if (!token) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization required" });
    }

    const provided = authHeader.substring(7);
    if (provided !== token) {
      return res.status(401).json({ error: "Invalid token" });
    }

    next();
  };

  // ── Path helpers ───────────────────────────────────────────────────────────

  function normalizeRelativePath(relativePath) {
    const raw = typeof relativePath === "string" ? relativePath : "/";
    const asPosix = raw.replace(/\\/g, "/");
    return path.posix.normalize(asPosix.startsWith("/") ? asPosix : `/${asPosix}`);
  }

  function isMainWorkspacePath(normalizedPath) {
    return normalizedPath === "/workspace" || normalizedPath.startsWith("/workspace/");
  }

  function isAllowedConfigRootPath(normalizedPath) {
    if (ALLOWED_CONFIG_FILE_NAMES.has(normalizedPath.replace(/^\/+/, ""))) {
      return true;
    }

    if (WORKSPACE_AGENT_PATH_PATTERN.test(normalizedPath)) {
      return true;
    }

    return ALLOWED_CONFIG_PREFIXES.some(
      (prefix) =>
        normalizedPath === `/${prefix}` || normalizedPath.startsWith(`/${prefix}/`),
    );
  }

  function isAllowedVirtualPath(normalizedPath) {
    return isMainWorkspacePath(normalizedPath) || isAllowedConfigRootPath(normalizedPath);
  }

  function createPathNotAllowedError(normalizedPath) {
    const error = new Error("Path not allowed");
    error.statusCode = 403;
    error.code = PATH_NOT_ALLOWED_CODE;
    error.normalizedPath = normalizedPath;
    return error;
  }

  function assertAllowedVirtualPath(normalizedPath) {
    if (!isAllowedVirtualPath(normalizedPath)) {
      throw createPathNotAllowedError(normalizedPath);
    }
  }

  function selectFsRootForPath(normalizedPath) {
    return isMainWorkspacePath(normalizedPath) ? MAIN_WORKSPACE_FS_ROOT : CONFIG_ROOT;
  }

  function getMainWorkspaceAliasPath(normalizedPath) {
    if (normalizedPath === "/workspace") {
      return "/";
    }

    if (normalizedPath.startsWith("/workspace/")) {
      return normalizedPath.substring("/workspace".length);
    }

    return null;
  }

  /**
   * Assert that `resolved` is within `rootPath`. Throws if it escapes.
   * Exported for direct unit testing of the defence-in-depth guard.
   */
  function assertWithinRoot(rootPath, resolved) {
    const rootWithSep = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;
    if (resolved !== rootPath && !resolved.startsWith(rootWithSep)) {
      throw new Error("Path traversal detected");
    }
  }

  // Defence in depth: main workspace must stay under CONFIG_ROOT.
  assertWithinRoot(CONFIG_ROOT, MAIN_WORKSPACE_FS_ROOT);

  function resolvePathContext(relativePath) {
    const normalizedPath = normalizeRelativePath(relativePath);
    assertAllowedVirtualPath(normalizedPath);

    const mainWorkspaceAliasPath = getMainWorkspaceAliasPath(normalizedPath);
    const routedPath = mainWorkspaceAliasPath || normalizedPath;
    const rootPath = selectFsRootForPath(normalizedPath);
    const relWithinRoot = routedPath.replace(/^\/+/, "");

    const resolvedPath = path.resolve(rootPath, relWithinRoot);
    assertWithinRoot(rootPath, resolvedPath);

    return {
      normalizedPath,
      routedPath,
      rootPath,
      resolvedPath,
    };
  }

  function resolveSafePath(relativePath) {
    return resolvePathContext(relativePath).resolvedPath;
  }

  function remapSymlinkTarget(target, rootPath) {
    if (!target || !path.isAbsolute(target)) return null;
    for (const prefix of symlinkRemapPrefixes) {
      if (target === prefix || target.startsWith(prefix + "/")) {
        const relative = target.substring(prefix.length);
        return path.join(rootPath, relative);
      }
    }
    return null;
  }

  async function resolveWithRemap(fsPath, rootPath = MAIN_WORKSPACE_FS_ROOT) {
    try {
      await fs.stat(fsPath);
      return fsPath;
    } catch (_) {
      // fall through to component-by-component resolution
    }

    let rel = fsPath;
    if (fsPath.startsWith(rootPath)) {
      rel = fsPath.substring(rootPath.length);
    }
    const segments = rel.split("/").filter(Boolean);

    let current = rootPath;

    for (let i = 0; i < segments.length; i++) {
      const candidate = path.join(current, segments[i]);

      try {
        const lstat = await fs.lstat(candidate);

        if (lstat.isSymbolicLink()) {
          try {
            await fs.stat(candidate);
            current = candidate;
            continue;
          } catch (_) {
            const target = await fs.readlink(candidate);
            const remapped = remapSymlinkTarget(target, rootPath);
            if (remapped) {
              const remaining = segments.slice(i + 1).join("/");
              const fullRemapped = remaining ? path.join(remapped, remaining) : remapped;
              await fs.stat(fullRemapped);
              return fullRemapped;
            }
            const err = new Error(`Broken symlink: ${candidate} -> ${target}`);
            err.code = "ENOENT";
            throw err;
          }
        }

        current = candidate;
      } catch (error) {
        throw error;
      }
    }

    return current;
  }

  async function getFileInfo(filePath, relativePath, rootPath) {
    const lstat = await fs.lstat(filePath);
    const isSymlink = lstat.isSymbolicLink();

    let stats = lstat;
    let symlinkTarget = null;

    if (isSymlink) {
      symlinkTarget = await fs.readlink(filePath);

      try {
        stats = await fs.stat(filePath);
      } catch (error) {
        const remapped = remapSymlinkTarget(symlinkTarget, rootPath);
        if (remapped) {
          try {
            stats = await fs.stat(remapped);
          } catch (remapError) {
            console.warn(
              `Broken symlink at ${filePath} (remapped ${remapped}): ${remapError.message}`,
            );
          }
        } else {
          console.warn(`Broken symlink at ${filePath}: ${error.message}`);
        }
      }
    }

    const fileInfo = {
      path: relativePath,
      name: path.basename(filePath),
      type: stats.isDirectory() ? "directory" : "file",
      size: stats.size,
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString(),
    };

    if (isSymlink) {
      fileInfo.isSymlink = true;
      if (symlinkTarget) {
        fileInfo.symlinkTarget = symlinkTarget;
      }
    }

    return fileInfo;
  }

  async function listDirectory(dirPath, relativePath, rootPath, recursive = false) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results = [];

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      const entryRelativePath = path.join(relativePath, entry.name);

      try {
        const info = await getFileInfo(entryPath, entryRelativePath, rootPath);
        results.push(info);

        if (recursive && entry.isDirectory()) {
          const subResults = await listDirectory(
            entryPath,
            entryRelativePath,
            rootPath,
            true,
          );
          results.push(...subResults);
        }
      } catch (error) {
        console.error(`Error reading ${entryPath}:`, error.message);
      }
    }

    return results;
  }

  async function inspectRoot(rootPath) {
    try {
      const stats = await fs.stat(rootPath);
      return {
        exists: true,
        accessible: true,
        modified: stats.mtime.toISOString(),
      };
    } catch (error) {
      return {
        exists: false,
        accessible: false,
        modified: null,
        error: error.message,
      };
    }
  }

  function pathNotFound(error) {
    return error && error.code === "ENOENT";
  }

  function buildUnsupportedLinkTypePayload(linkType) {
    return {
      error: "Unsupported link type",
      code: LINK_TYPE_UNSUPPORTED_CODE,
      type: linkType,
    };
  }

  function buildInvalidAgentIdPayload(agentId) {
    return {
      error: "Invalid agent ID",
      code: INVALID_AGENT_ID_CODE,
      agentId,
    };
  }

  function resolveAgentWorkspaceDirName(agentId) {
    if (agentId === "main") {
      return mainWorkspaceDir;
    }

    if (!AGENT_ID_PATTERN.test(agentId)) {
      return null;
    }

    return `workspace-${agentId}`;
  }

  function resolveWorkspaceVirtualPath(agentId) {
    return agentId === "main" ? "/workspace" : `/workspace-${agentId}`;
  }

  function buildDocsLinkContext(linkType, agentId) {
    if (linkType !== SUPPORTED_LINK_TYPE) {
      return {
        ok: false,
        status: 400,
        payload: buildUnsupportedLinkTypePayload(linkType),
      };
    }

    const workspaceDirName = resolveAgentWorkspaceDirName(agentId);
    if (!workspaceDirName) {
      return {
        ok: false,
        status: 400,
        payload: buildInvalidAgentIdPayload(agentId),
      };
    }

    const workspacePath = path.resolve(CONFIG_ROOT, workspaceDirName);
    const targetPath = path.resolve(CONFIG_ROOT, SHARED_DOCS_DIR);
    const linkPath = path.resolve(workspacePath, SHARED_DOCS_DIR);
    assertWithinRoot(CONFIG_ROOT, workspacePath);
    assertWithinRoot(CONFIG_ROOT, targetPath);
    assertWithinRoot(CONFIG_ROOT, linkPath);

    const workspaceVirtualPath = resolveWorkspaceVirtualPath(agentId);

    return {
      ok: true,
      linkType,
      agentId,
      workspacePath,
      targetPath,
      linkPath,
      workspaceVirtualPath,
      linkVirtualPath: `${workspaceVirtualPath}/${SHARED_DOCS_DIR}`,
      targetVirtualPath: `/${SHARED_DOCS_DIR}`,
    };
  }

  async function inspectDocsLinkState(context) {
    try {
      const lstat = await fs.lstat(context.linkPath);

      if (!lstat.isSymbolicLink()) {
        return {
          state: "conflict",
          conflict: {
            reason: "Path exists and is not a symlink",
          },
        };
      }

      const symlinkTarget = await fs.readlink(context.linkPath);
      const resolvedLinkTarget = path.resolve(
        path.dirname(context.linkPath),
        symlinkTarget,
      );
      if (resolvedLinkTarget !== context.targetPath) {
        return {
          state: "conflict",
          conflict: {
            reason: "Symlink points to unexpected target",
            symlinkTarget,
          },
        };
      }

      return {
        state: "linked",
        symlinkTarget,
      };
    } catch (error) {
      if (pathNotFound(error)) {
        return {
          state: "missing",
        };
      }
      throw error;
    }
  }

  function buildLinkResponsePayload(context, stateResult) {
    return {
      type: context.linkType,
      agentId: context.agentId,
      workspaceVirtualPath: context.workspaceVirtualPath,
      linkVirtualPath: context.linkVirtualPath,
      targetVirtualPath: context.targetVirtualPath,
      state: stateResult.state,
      ...(stateResult.conflict ? { conflict: stateResult.conflict } : {}),
    };
  }

  // ── Routes ─────────────────────────────────────────────────────────────────

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      configRoot: CONFIG_ROOT,
      mainWorkspaceDir,
      mainWorkspaceFsRoot: MAIN_WORKSPACE_FS_ROOT,
      workspaceFsRoot: MAIN_WORKSPACE_FS_ROOT,
      configFsRoot: CONFIG_ROOT,
      // compatibility keys
      workspace: MAIN_WORKSPACE_FS_ROOT,
      exposedRoot: MAIN_WORKSPACE_FS_ROOT,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/status", optionalAuth, async (req, res) => {
    const mainWorkspaceState = await inspectRoot(MAIN_WORKSPACE_FS_ROOT);
    const configState = await inspectRoot(CONFIG_ROOT);

    const payload = {
      configRoot: CONFIG_ROOT,
      mainWorkspaceDir,
      mainWorkspaceFsRoot: MAIN_WORKSPACE_FS_ROOT,
      workspaceFsRoot: MAIN_WORKSPACE_FS_ROOT,
      configFsRoot: CONFIG_ROOT,
      // compatibility keys
      workspace: MAIN_WORKSPACE_FS_ROOT,
      exposedRoot: MAIN_WORKSPACE_FS_ROOT,
      exists: mainWorkspaceState.exists,
      accessible: mainWorkspaceState.accessible,
      workspaceExists: mainWorkspaceState.exists,
      workspaceAccessible: mainWorkspaceState.accessible,
      workspaceModified: mainWorkspaceState.modified,
      mainWorkspaceExists: mainWorkspaceState.exists,
      mainWorkspaceAccessible: mainWorkspaceState.accessible,
      mainWorkspaceModified: mainWorkspaceState.modified,
      configExists: configState.exists,
      configAccessible: configState.accessible,
      configModified: configState.modified,
    };

    if (!mainWorkspaceState.accessible || !configState.accessible) {
      payload.error =
        mainWorkspaceState.error || configState.error || "Filesystem root inaccessible";
      payload.errors = {};
      if (mainWorkspaceState.error) {
        payload.errors.mainWorkspace = mainWorkspaceState.error;
        payload.errors.workspace = mainWorkspaceState.error;
      }
      if (configState.error) payload.errors.config = configState.error;
      return res.status(500).json(payload);
    }

    return res.json(payload);
  });

  app.get("/files", optionalAuth, async (req, res, next) => {
    try {
      const { path: relativePath = "/", recursive = "false" } = req.query;
      const isRecursive = recursive === "true";

      const context = resolvePathContext(relativePath);
      const resolvedPath = await resolveWithRemap(context.resolvedPath, context.rootPath);
      const stats = await fs.stat(resolvedPath);

      if (!stats.isDirectory()) {
        const info = await getFileInfo(
          resolvedPath,
          context.normalizedPath,
          context.rootPath,
        );
        return res.json({ files: [info], count: 1 });
      }

      const files = await listDirectory(
        resolvedPath,
        context.normalizedPath,
        context.rootPath,
        isRecursive,
      );

      res.json({
        files,
        count: files.length,
        path: context.normalizedPath,
        recursive: isRecursive,
      });
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({ error: "Path not found" });
      }
      next(error);
    }
  });

  app.get("/files/content", optionalAuth, async (req, res, next) => {
    try {
      const { path: relativePath, encoding = "utf8" } = req.query;

      if (!relativePath) {
        return res.status(400).json({ error: "Path parameter is required" });
      }

      const context = resolvePathContext(relativePath);
      const resolvedPath = await resolveWithRemap(context.resolvedPath, context.rootPath);
      const stats = await fs.stat(resolvedPath);

      if (stats.isDirectory()) {
        return res.status(400).json({ error: "Cannot read directory as file" });
      }

      const content = await fs.readFile(resolvedPath, encoding);
      const info = await getFileInfo(
        resolvedPath,
        context.normalizedPath,
        context.rootPath,
      );

      res.json({
        ...info,
        content,
        encoding,
      });
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({ error: "File not found" });
      }
      next(error);
    }
  });

  app.post("/files", optionalAuth, async (req, res, next) => {
    try {
      const { path: relativePath, content, encoding = "utf8" } = req.body;

      if (!relativePath || content === undefined) {
        return res.status(400).json({ error: "Path and content are required" });
      }

      const context = resolvePathContext(relativePath);
      const dirPath = path.dirname(context.resolvedPath);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(context.resolvedPath, content, encoding);

      const info = await getFileInfo(
        context.resolvedPath,
        context.normalizedPath,
        context.rootPath,
      );

      res.status(201).json({
        ...info,
        message: "File created successfully",
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/files", optionalAuth, async (req, res, next) => {
    try {
      const { path: relativePath, content, encoding = "utf8" } = req.body;

      if (!relativePath || content === undefined) {
        return res.status(400).json({ error: "Path and content are required" });
      }

      const context = resolvePathContext(relativePath);

      try {
        await fs.access(context.resolvedPath);
      } catch (error) {
        return res.status(404).json({ error: "File not found" });
      }

      await fs.writeFile(context.resolvedPath, content, encoding);
      const info = await getFileInfo(
        context.resolvedPath,
        context.normalizedPath,
        context.rootPath,
      );

      res.json({
        ...info,
        message: "File updated successfully",
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/files", optionalAuth, async (req, res, next) => {
    try {
      const { path: relativePath } = req.query;

      if (!relativePath) {
        return res.status(400).json({ error: "Path parameter is required" });
      }

      const context = resolvePathContext(relativePath);
      const stats = await fs.stat(context.resolvedPath);

      if (stats.isDirectory()) {
        await fs.rm(context.resolvedPath, { recursive: true, force: true });
      } else {
        await fs.unlink(context.resolvedPath);
      }

      res.status(204).send();
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({ error: "Path not found" });
      }
      next(error);
    }
  });

  app.get("/links/:type/:agentId", optionalAuth, async (req, res, next) => {
    try {
      const contextResult = buildDocsLinkContext(req.params.type, req.params.agentId);
      if (!contextResult.ok) {
        return res.status(contextResult.status).json(contextResult.payload);
      }

      const stateResult = await inspectDocsLinkState(contextResult);
      return res.json(buildLinkResponsePayload(contextResult, stateResult));
    } catch (error) {
      next(error);
    }
  });

  app.put("/links/:type/:agentId", optionalAuth, async (req, res, next) => {
    try {
      const contextResult = buildDocsLinkContext(req.params.type, req.params.agentId);
      if (!contextResult.ok) {
        return res.status(contextResult.status).json(contextResult.payload);
      }

      await fs.mkdir(contextResult.targetPath, { recursive: true });
      await fs.mkdir(contextResult.workspacePath, { recursive: true });

      const stateResult = await inspectDocsLinkState(contextResult);
      if (stateResult.state === "conflict") {
        return res.status(409).json({
          error: "Link conflict",
          code: LINK_CONFLICT_CODE,
          ...buildLinkResponsePayload(contextResult, stateResult),
        });
      }

      if (stateResult.state === "linked") {
        return res.json({
          action: "unchanged",
          ...buildLinkResponsePayload(contextResult, stateResult),
        });
      }

      const relativeTarget =
        path.relative(contextResult.workspacePath, contextResult.targetPath) || ".";
      await fs.symlink(relativeTarget, contextResult.linkPath);

      const createdState = await inspectDocsLinkState(contextResult);
      return res.json({
        action: "created",
        ...buildLinkResponsePayload(contextResult, createdState),
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/links/:type/:agentId", optionalAuth, async (req, res, next) => {
    try {
      const contextResult = buildDocsLinkContext(req.params.type, req.params.agentId);
      if (!contextResult.ok) {
        return res.status(contextResult.status).json(contextResult.payload);
      }

      const stateResult = await inspectDocsLinkState(contextResult);
      if (stateResult.state === "conflict") {
        return res.status(409).json({
          error: "Link conflict",
          code: LINK_CONFLICT_CODE,
          ...buildLinkResponsePayload(contextResult, stateResult),
        });
      }

      if (stateResult.state === "missing") {
        return res.json({
          action: "unchanged",
          ...buildLinkResponsePayload(contextResult, stateResult),
        });
      }

      await fs.unlink(contextResult.linkPath);
      return res.json({
        action: "deleted",
        ...buildLinkResponsePayload(contextResult, { state: "missing" }),
      });
    } catch (error) {
      next(error);
    }
  });

  // ── Error handler ──────────────────────────────────────────────────────────

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.code === PATH_NOT_ALLOWED_CODE) {
      return res.status(403).json(buildPathNotAllowedErrorPayload(err));
    }

    console.error("Error:", err);
    res.status(500).json({
      error: err.message || "Internal server error",
      path: req.path,
    });
  });

  // Expose helpers for testing
  app._assertWithinRoot = assertWithinRoot;
  app._normalizeRelativePath = normalizeRelativePath;
  app._isMainWorkspacePath = isMainWorkspacePath;
  app._isAllowedConfigRootPath = isAllowedConfigRootPath;
  app._isAllowedVirtualPath = isAllowedVirtualPath;
  app._selectFsRootForPath = selectFsRootForPath;
  app._getMainWorkspaceAliasPath = getMainWorkspaceAliasPath;
  app._resolvePathContext = resolvePathContext;
  app._resolveSafePath = resolveSafePath;
  app._remapSymlinkTarget = remapSymlinkTarget;
  app._resolveWithRemap = resolveWithRemap;
  app._listDirectory = listDirectory;
  app._workspaceFsRoot = MAIN_WORKSPACE_FS_ROOT;
  app._configFsRoot = CONFIG_ROOT;
  app._configRoot = CONFIG_ROOT;
  app._mainWorkspaceDir = mainWorkspaceDir;
  app._mainWorkspaceFsRoot = MAIN_WORKSPACE_FS_ROOT;

  return app;
}

module.exports = { createApp, buildPathNotAllowedErrorPayload };
