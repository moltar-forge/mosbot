"use strict";

const express = require("express");
const fs = require("fs").promises;
const path = require("path");

/**
 * Build and return an Express app configured with the given options.
 *
 * Separating app creation from server startup makes the app fully testable
 * without binding to a real port.
 *
 * @param {object} opts
 * @param {string} opts.workspaceRoot   - Absolute path to the mounted workspace root
 * @param {string} opts.workspaceSubdir - Subdirectory within workspaceRoot to expose
 * @param {string|undefined} opts.token - Bearer token; undefined means anonymous access
 * @param {string[]} opts.symlinkRemapPrefixes - Absolute path prefixes to remap for symlinks
 */
function createApp(opts) {
  const { workspaceRoot, workspaceSubdir, token, symlinkRemapPrefixes } = opts;

  const EXPOSED_ROOT = path.resolve(
    workspaceRoot,
    workspaceSubdir && workspaceSubdir !== "." ? workspaceSubdir : ".",
  );

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

  /**
   * Assert that `resolved` is within EXPOSED_ROOT. Throws if it escapes.
   * Exported for direct unit testing of the defence-in-depth guard.
   */
  function assertWithinRoot(resolved) {
    const rootWithSep = EXPOSED_ROOT.endsWith(path.sep)
      ? EXPOSED_ROOT
      : `${EXPOSED_ROOT}${path.sep}`;
    if (resolved !== EXPOSED_ROOT && !resolved.startsWith(rootWithSep)) {
      throw new Error("Path traversal detected");
    }
  }

  function resolveSafePath(relativePath) {
    const raw = typeof relativePath === "string" ? relativePath : "/";
    const asPosix = raw.replace(/\\/g, "/");
    const normalized = path.posix.normalize(
      asPosix.startsWith("/") ? asPosix : `/${asPosix}`,
    );
    const relWithinRoot = normalized.replace(/^\/+/, "");

    const resolved = path.resolve(EXPOSED_ROOT, relWithinRoot);
    assertWithinRoot(resolved);
    return resolved;
  }

  function remapSymlinkTarget(target) {
    if (!target || !path.isAbsolute(target)) return null;
    for (const prefix of symlinkRemapPrefixes) {
      if (target === prefix || target.startsWith(prefix + "/")) {
        const relative = target.substring(prefix.length);
        return path.join(workspaceRoot, relative);
      }
    }
    return null;
  }

  async function resolveWithRemap(fsPath) {
    try {
      await fs.stat(fsPath);
      return fsPath;
    } catch (_) {
      // fall through to component-by-component resolution
    }

    let rel = fsPath;
    if (fsPath.startsWith(EXPOSED_ROOT)) {
      rel = fsPath.substring(EXPOSED_ROOT.length);
    }
    const segments = rel.split("/").filter(Boolean);

    let current = EXPOSED_ROOT;

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
            const remapped = remapSymlinkTarget(target);
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

  async function getFileInfo(filePath, relativePath) {
    const lstat = await fs.lstat(filePath);
    const isSymlink = lstat.isSymbolicLink();

    let stats = lstat;
    let symlinkTarget = null;

    if (isSymlink) {
      symlinkTarget = await fs.readlink(filePath);

      try {
        stats = await fs.stat(filePath);
      } catch (error) {
        const remapped = remapSymlinkTarget(symlinkTarget);
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

  async function listDirectory(dirPath, relativePath, recursive = false) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results = [];

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      const entryRelativePath = path.join(relativePath, entry.name);

      try {
        const info = await getFileInfo(entryPath, entryRelativePath);
        results.push(info);

        if (recursive && entry.isDirectory()) {
          const subResults = await listDirectory(entryPath, entryRelativePath, true);
          results.push(...subResults);
        }
      } catch (error) {
        console.error(`Error reading ${entryPath}:`, error.message);
      }
    }

    return results;
  }

  // ── Routes ─────────────────────────────────────────────────────────────────

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      workspace: workspaceRoot,
      exposedRoot: EXPOSED_ROOT,
      workspaceSubdir,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/status", optionalAuth, async (req, res) => {
    try {
      const stats = await fs.stat(EXPOSED_ROOT);

      res.json({
        workspace: workspaceRoot,
        exposedRoot: EXPOSED_ROOT,
        workspaceSubdir,
        exists: true,
        accessible: true,
        modified: stats.mtime.toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        workspace: workspaceRoot,
        exposedRoot: EXPOSED_ROOT,
        workspaceSubdir,
        exists: false,
        accessible: false,
        error: error.message,
      });
    }
  });

  app.get("/files", optionalAuth, async (req, res, next) => {
    try {
      const { path: relativePath = "/", recursive = "false" } = req.query;
      const isRecursive = recursive === "true";

      const fullPath = resolveSafePath(relativePath);
      const resolvedPath = await resolveWithRemap(fullPath);
      const stats = await fs.stat(resolvedPath);

      if (!stats.isDirectory()) {
        const info = await getFileInfo(resolvedPath, relativePath);
        return res.json({ files: [info], count: 1 });
      }

      const files = await listDirectory(resolvedPath, relativePath, isRecursive);

      res.json({
        files,
        count: files.length,
        path: relativePath,
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

      const fullPath = resolveSafePath(relativePath);
      const resolvedPath = await resolveWithRemap(fullPath);
      const stats = await fs.stat(resolvedPath);

      if (stats.isDirectory()) {
        return res.status(400).json({ error: "Cannot read directory as file" });
      }

      const content = await fs.readFile(resolvedPath, encoding);
      const info = await getFileInfo(resolvedPath, relativePath);

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

      const fullPath = resolveSafePath(relativePath);
      const dirPath = path.dirname(fullPath);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(fullPath, content, encoding);

      const info = await getFileInfo(fullPath, relativePath);

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

      const fullPath = resolveSafePath(relativePath);

      try {
        await fs.access(fullPath);
      } catch (error) {
        return res.status(404).json({ error: "File not found" });
      }

      await fs.writeFile(fullPath, content, encoding);
      const info = await getFileInfo(fullPath, relativePath);

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

      const fullPath = resolveSafePath(relativePath);
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }

      res.status(204).send();
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({ error: "Path not found" });
      }
      next(error);
    }
  });

  // ── Error handler ──────────────────────────────────────────────────────────

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error("Error:", err);
    res.status(500).json({
      error: err.message || "Internal server error",
      path: req.path,
    });
  });

  // Expose helpers for testing
  app._assertWithinRoot = assertWithinRoot;
  app._resolveSafePath = resolveSafePath;
  app._remapSymlinkTarget = remapSymlinkTarget;
  app._resolveWithRemap = resolveWithRemap;
  app._listDirectory = listDirectory;
  app._exposedRoot = EXPOSED_ROOT;

  return app;
}

module.exports = { createApp };
