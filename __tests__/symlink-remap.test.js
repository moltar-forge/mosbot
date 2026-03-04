"use strict";

const os = require("os");
const path = require("path");
const fs = require("fs").promises;
const { createApp } = require("../src/app");

describe("Symlink remapping", () => {
  let tmpDir;
  let wsRoot;
  let configRoot;
  let app;
  const FOREIGN_PREFIX = "/home/node/.openclaw";

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-symlink-test-"));
    configRoot = path.join(tmpDir, "config-root");
    wsRoot = path.join(configRoot, "workspace");

    await fs.mkdir(path.join(wsRoot, "real"), { recursive: true });
    await fs.mkdir(configRoot, { recursive: true });
    await fs.mkdir(path.join(configRoot, "real"), { recursive: true });
    await fs.writeFile(path.join(wsRoot, "real", "file.txt"), "real content");
    await fs.writeFile(path.join(configRoot, "real", "file.txt"), "config-root content");
    await fs.writeFile(path.join(configRoot, "openclaw.json"), "{}");

    await fs.symlink(path.join(wsRoot, "real"), path.join(wsRoot, "link-to-real"));

    await fs.mkdir(path.join(wsRoot, "shared"), { recursive: true });
    await fs.writeFile(path.join(wsRoot, "shared", "remapped.txt"), "remapped content");

    await fs.symlink(`${FOREIGN_PREFIX}/shared`, path.join(wsRoot, "link-to-foreign"));

    app = createApp({
      configRoot,
      mainWorkspaceDir: "workspace",
      token: undefined,
      symlinkRemapPrefixes: [FOREIGN_PREFIX],
    });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("root selection", () => {
    it("routes openclaw.json to config root", () => {
      const ctx = app._resolvePathContext("/openclaw.json");
      expect(ctx.rootPath).toBe(configRoot);
      expect(ctx.resolvedPath).toBe(path.join(configRoot, "openclaw.json"));
    });

    it("maps /workspace/* to workspace-relative path", () => {
      expect(app._getMainWorkspaceAliasPath("/workspace/real/file.txt")).toBe(
        "/real/file.txt",
      );
    });

    it("rejects unprefixed paths that are outside the allowlist", () => {
      expect(() => app._resolvePathContext("/real/file.txt")).toThrow("Path not allowed");
    });

    it("routes /workspace/* virtual paths to workspace root without double nesting", () => {
      const ctx = app._resolvePathContext("/workspace/real/file.txt");
      expect(ctx.rootPath).toBe(wsRoot);
      expect(ctx.resolvedPath).toBe(path.join(wsRoot, "real", "file.txt"));
    });
  });

  describe("remapSymlinkTarget", () => {
    it("returns null for relative symlink targets", () => {
      const result = app._remapSymlinkTarget("relative/path", wsRoot);
      expect(result).toBeNull();
    });

    it("returns null when target does not match any prefix", () => {
      const result = app._remapSymlinkTarget("/some/other/path", wsRoot);
      expect(result).toBeNull();
    });

    it("remaps a target that exactly matches the prefix", () => {
      const result = app._remapSymlinkTarget(FOREIGN_PREFIX, wsRoot);
      expect(result).toBe(wsRoot);
    });

    it("remaps a target that starts with the prefix", () => {
      const result = app._remapSymlinkTarget(`${FOREIGN_PREFIX}/shared`, wsRoot);
      expect(result).toBe(path.join(wsRoot, "shared"));
    });
  });

  describe("resolveSafePath", () => {
    it("rejects disallowed relative paths", () => {
      expect(() => app._resolveSafePath("real/file.txt")).toThrow("Path not allowed");
    });

    it("rejects disallowed absolute paths", () => {
      expect(() => app._resolveSafePath("/real/file.txt")).toThrow("Path not allowed");
    });

    it("resolves /workspace/* aliases to the main workspace root", () => {
      const result = app._resolveSafePath("/workspace/real/file.txt");
      expect(result).toBe(path.join(wsRoot, "real", "file.txt"));
    });

    it("rejects root path (empty string)", () => {
      expect(() => app._resolveSafePath("")).toThrow("Path not allowed");
    });

    it("rejects root path (slash)", () => {
      expect(() => app._resolveSafePath("/")).toThrow("Path not allowed");
    });

    it("normalises backslashes before allowlist checks", () => {
      expect(() => app._resolveSafePath("real\\file.txt")).toThrow("Path not allowed");
    });

    it("treats non-string input as root and rejects it", () => {
      expect(() => app._resolveSafePath(null)).toThrow("Path not allowed");
    });

    it("allows openclaw config path in config root", () => {
      const result = app._resolveSafePath("/openclaw.json");
      expect(result).toBe(path.join(configRoot, "openclaw.json"));
    });

    it("throws on traversal when resolved path escapes explicit root", () => {
      expect(() => app._assertWithinRoot(wsRoot, "/completely/different/path")).toThrow(
        "Path traversal detected",
      );
    });

    it("does not throw when resolved path equals root", () => {
      expect(() => app._assertWithinRoot(wsRoot, wsRoot)).not.toThrow();
    });

    it("does not throw when resolved path is inside root", () => {
      expect(() =>
        app._assertWithinRoot(wsRoot, path.join(wsRoot, "subdir")),
      ).not.toThrow();
    });
  });

  describe("resolveWithRemap", () => {
    it("returns the path directly when it is reachable", async () => {
      const fsPath = path.join(wsRoot, "real", "file.txt");
      const result = await app._resolveWithRemap(fsPath, wsRoot);
      expect(result).toBe(fsPath);
    });

    it("uses default workspace root when root argument is omitted", async () => {
      const fsPath = path.join(wsRoot, "real", "file.txt");
      const result = await app._resolveWithRemap(fsPath);
      expect(result).toBe(fsPath);
    });

    it("follows a reachable symlink without remapping", async () => {
      const fsPath = path.join(wsRoot, "link-to-real");
      const result = await app._resolveWithRemap(fsPath, wsRoot);
      expect(result).toBe(fsPath);
    });

    it("walks through a reachable symlink component in slow path", async () => {
      const fsModule = require("fs").promises;
      const originalStat = fsModule.stat;
      let firstCall = true;
      fsModule.stat = jest.fn(async (...args) => {
        if (firstCall) {
          firstCall = false;
          const err = new Error("force slow path");
          err.code = "ENOENT";
          throw err;
        }
        return originalStat(...args);
      });

      const fsPath = path.join(wsRoot, "link-to-real", "file.txt");

      try {
        const result = await app._resolveWithRemap(fsPath, wsRoot);
        expect(result).toBe(fsPath);
      } finally {
        fsModule.stat = originalStat;
      }
    });

    it("resolves when input path does not start with root", async () => {
      const result = await app._resolveWithRemap("/real/file.txt", wsRoot);
      expect(result).toBe(path.join(wsRoot, "real", "file.txt"));
    });

    it("walks normal dirs before remapped symlink", async () => {
      await fs.mkdir(path.join(wsRoot, "subdir"), { recursive: true });
      await fs.symlink(
        `${FOREIGN_PREFIX}/shared`,
        path.join(wsRoot, "subdir", "deep-link"),
      );

      const fsPath = path.join(wsRoot, "subdir", "deep-link", "remapped.txt");
      const result = await app._resolveWithRemap(fsPath, wsRoot);
      expect(result).toBe(path.join(wsRoot, "shared", "remapped.txt"));
    });

    it("throws ENOENT for a completely missing path", async () => {
      const fsPath = path.join(wsRoot, "does-not-exist");
      await expect(app._resolveWithRemap(fsPath, wsRoot)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("throws ENOENT for a broken symlink with no remap prefix", async () => {
      const brokenLink = path.join(wsRoot, "broken-link");
      try {
        await fs.unlink(brokenLink);
      } catch (_) {
        // ignore
      }
      await fs.symlink("/some/other/foreign/path", brokenLink);

      await expect(app._resolveWithRemap(brokenLink, wsRoot)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  describe("getFileInfo edge branches", () => {
    it("warns when remapped path is also missing", async () => {
      const brokenRemapLink = path.join(wsRoot, "broken-remap-link");
      try {
        await fs.unlink(brokenRemapLink);
      } catch (_) {
        // ignore
      }
      await fs.symlink(`${FOREIGN_PREFIX}/nonexistent`, brokenRemapLink);

      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const supertest = require("supertest");
      const res = await supertest(app).get("/files?path=/workspace");
      expect(res.status).toBe(200);

      const warnCalls = warnSpy.mock.calls.map((c) => c[0]);
      expect(warnCalls.some((msg) => msg.includes("broken-remap-link"))).toBe(true);

      warnSpy.mockRestore();
    });

    it("omits symlinkTarget when readlink returns empty string", async () => {
      const fsModule = require("fs").promises;
      const originalReadlink = fsModule.readlink;
      fsModule.readlink = jest.fn(async (...args) => {
        if (args[0] === path.join(wsRoot, "link-to-real")) return "";
        return originalReadlink(...args);
      });

      const supertest = require("supertest");
      try {
        const res = await supertest(app).get("/files?path=/workspace");
        expect(res.status).toBe(200);
        const link = res.body.files.find((f) => f.name === "link-to-real");
        expect(link).toBeTruthy();
        expect(link.isSymlink).toBe(true);
        expect(link.symlinkTarget).toBeUndefined();
      } finally {
        fsModule.readlink = originalReadlink;
      }
    });
  });

  describe("assertWithinRoot root-separator branch", () => {
    it("covers root path with trailing separator behavior", () => {
      const rootApp = createApp({
        configRoot: path.parse(process.cwd()).root,
        mainWorkspaceDir: "tmp",
        token: undefined,
        symlinkRemapPrefixes: [],
      });
      expect(() =>
        rootApp._assertWithinRoot(path.parse(process.cwd()).root, "/etc"),
      ).not.toThrow();
    });
  });

  describe("listDirectory error handling", () => {
    it("uses recursive=false default when omitted", async () => {
      const dirPath = path.join(wsRoot, "real");
      const results = await app._listDirectory(dirPath, "/real", wsRoot);
      expect(Array.isArray(results)).toBe(true);
      expect(results.some((f) => f.name === "file.txt")).toBe(true);
    });

    it("skips unreadable entries and logs an error", async () => {
      const fsModule = require("fs").promises;
      const originalLstat = fsModule.lstat;
      let callCount = 0;
      fsModule.lstat = jest.fn(async (...args) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("permission denied");
        }
        return originalLstat(...args);
      });

      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const supertest = require("supertest");
      const res = await supertest(app).get("/files?path=/workspace");

      fsModule.lstat = originalLstat;
      errorSpy.mockRestore();

      expect(res.status).toBe(200);
    });
  });

  describe("GET /files with symlinks", () => {
    it("rejects disallowed paths before filesystem operations", async () => {
      const fsModule = require("fs").promises;
      const statSpy = jest.spyOn(fsModule, "stat");
      const supertest = require("supertest");

      const res = await supertest(app).get("/files?path=/tmp");

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PATH_NOT_ALLOWED");
      expect(statSpy).not.toHaveBeenCalled();

      statSpy.mockRestore();
    });

    it("lists workspace root including symlink entries", async () => {
      const supertest = require("supertest");
      const res = await supertest(app).get("/files?path=/workspace");
      expect(res.status).toBe(200);
      const names = res.body.files.map((f) => f.name);
      expect(names).toContain("real");
      expect(names).toContain("link-to-real");
      expect(names).toContain("link-to-foreign");
    });

    it("lists contents of a reachable symlink directory", async () => {
      const supertest = require("supertest");
      const res = await supertest(app).get("/files?path=/workspace/link-to-real");
      expect(res.status).toBe(200);
      expect(res.body.files.some((f) => f.name === "file.txt")).toBe(true);
    });

    it("lists contents of a remapped symlink directory", async () => {
      const supertest = require("supertest");
      const res = await supertest(app).get("/files?path=/workspace/link-to-foreign");
      expect(res.status).toBe(200);
      expect(res.body.files.some((f) => f.name === "remapped.txt")).toBe(true);
    });
  });
});
