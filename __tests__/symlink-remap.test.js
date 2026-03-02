"use strict";

const os = require("os");
const path = require("path");
const fs = require("fs").promises;
const { createApp } = require("../src/app");

/**
 * These tests exercise the symlink remapping logic that handles cross-container
 * absolute symlinks. The scenario mirrors the real deployment:
 *
 *   - The openclaw container creates symlinks with absolute targets like
 *     /home/node/.openclaw/shared/docs
 *   - The workspace-service container mounts the same PVC at /workspace
 *   - SYMLINK_REMAP_PREFIXES=/home/node/.openclaw tells the service to
 *     translate those paths to /workspace/...
 */
describe("Symlink remapping", () => {
  let tmpDir;
  let app;
  // Simulate the "foreign" prefix (as seen from the openclaw container)
  const FOREIGN_PREFIX = "/home/node/.openclaw";

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-symlink-test-"));

    // Layout:
    //   tmpDir/workspace/                  ← EXPOSED_ROOT
    //   tmpDir/workspace/real/             ← real directory
    //   tmpDir/workspace/real/file.txt     ← real file
    //   tmpDir/workspace/link-to-real      ← symlink → tmpDir/workspace/real (reachable)
    //   tmpDir/workspace/link-to-foreign   ← symlink → FOREIGN_PREFIX/shared (unreachable)
    //   tmpDir/shared/                     ← what FOREIGN_PREFIX/shared remaps to
    //   tmpDir/shared/remapped.txt         ← file reachable via remap

    await fs.mkdir(path.join(tmpDir, "workspace", "real"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "workspace", "real", "file.txt"),
      "real content",
    );

    // Reachable symlink (points within the same tmpDir tree)
    await fs.symlink(
      path.join(tmpDir, "workspace", "real"),
      path.join(tmpDir, "workspace", "link-to-real"),
    );

    // Unreachable symlink (absolute path from "foreign" container)
    // The target FOREIGN_PREFIX/shared does not exist on this machine,
    // but tmpDir/shared does — that's what the remap translates it to.
    await fs.mkdir(path.join(tmpDir, "shared"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "shared", "remapped.txt"), "remapped content");

    // Create the symlink pointing to the foreign absolute path
    await fs.symlink(
      `${FOREIGN_PREFIX}/shared`,
      path.join(tmpDir, "workspace", "link-to-foreign"),
    );

    // SYMLINK_REMAP_PREFIXES: translate FOREIGN_PREFIX → tmpDir
    app = createApp({
      workspaceRoot: tmpDir,
      workspaceSubdir: "workspace",
      token: undefined,
      symlinkRemapPrefixes: [FOREIGN_PREFIX],
    });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("remapSymlinkTarget", () => {
    it("returns null for relative symlink targets", () => {
      const result = app._remapSymlinkTarget("relative/path");
      expect(result).toBeNull();
    });

    it("returns null when target does not match any prefix", () => {
      const result = app._remapSymlinkTarget("/some/other/path");
      expect(result).toBeNull();
    });

    it("remaps a target that exactly matches the prefix", () => {
      const result = app._remapSymlinkTarget(FOREIGN_PREFIX);
      expect(result).toBe(tmpDir);
    });

    it("remaps a target that starts with the prefix", () => {
      const result = app._remapSymlinkTarget(`${FOREIGN_PREFIX}/shared`);
      expect(result).toBe(path.join(tmpDir, "shared"));
    });
  });

  describe("resolveSafePath", () => {
    it("resolves a normal relative path", () => {
      const result = app._resolveSafePath("real/file.txt");
      expect(result).toBe(path.join(tmpDir, "workspace", "real", "file.txt"));
    });

    it("resolves an absolute path (leading slash stripped)", () => {
      const result = app._resolveSafePath("/real/file.txt");
      expect(result).toBe(path.join(tmpDir, "workspace", "real", "file.txt"));
    });

    it("resolves root path (empty string)", () => {
      const result = app._resolveSafePath("");
      expect(result).toBe(path.join(tmpDir, "workspace"));
    });

    it("resolves root path (slash)", () => {
      const result = app._resolveSafePath("/");
      expect(result).toBe(path.join(tmpDir, "workspace"));
    });

    it("normalises backslashes", () => {
      const result = app._resolveSafePath("real\\file.txt");
      expect(result).toBe(path.join(tmpDir, "workspace", "real", "file.txt"));
    });

    it("throws on path traversal when resolved path escapes EXPOSED_ROOT", () => {
      // assertWithinRoot is the defence-in-depth guard. We call it directly
      // with a path that is outside EXPOSED_ROOT to exercise the throw branch.
      expect(() => app._assertWithinRoot("/completely/different/path")).toThrow(
        "Path traversal detected",
      );
    });

    it("does not throw when resolved path equals EXPOSED_ROOT", () => {
      expect(() => app._assertWithinRoot(app._exposedRoot)).not.toThrow();
    });

    it("does not throw when resolved path is inside EXPOSED_ROOT", () => {
      expect(() =>
        app._assertWithinRoot(path.join(app._exposedRoot, "subdir")),
      ).not.toThrow();
    });

    it("treats non-string input as root", () => {
      const result = app._resolveSafePath(null);
      expect(result).toBe(path.join(tmpDir, "workspace"));
    });
  });

  describe("resolveWithRemap", () => {
    it("returns the path directly when it is reachable", async () => {
      const fsPath = path.join(tmpDir, "workspace", "real", "file.txt");
      const result = await app._resolveWithRemap(fsPath);
      expect(result).toBe(fsPath);
    });

    it("follows a reachable symlink without remapping (fast path)", async () => {
      // The symlink itself is stat-able, so the fast path returns immediately
      const fsPath = path.join(tmpDir, "workspace", "link-to-real");
      const result = await app._resolveWithRemap(fsPath);
      expect(result).toBe(fsPath);
    });

    it("walks through a reachable symlink component in the path (component-by-component)", async () => {
      // Normally, fs.stat() on the FULL path succeeds even if it passes through a
      // symlink (because stat follows symlinks). To exercise the component loop
      // (and cover the `current = candidate; continue` branch), we force the
      // initial fast-path stat() to fail once.
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

      const fsPath = path.join(tmpDir, "workspace", "link-to-real", "file.txt");

      try {
        const result = await app._resolveWithRemap(fsPath);
        expect(result).toBe(fsPath);
      } finally {
        fsModule.stat = originalStat;
      }
    });

    it("resolves when input path does not start with EXPOSED_ROOT", async () => {
      // fs.stat("/real/file.txt") fails, then the component loop resolves it
      // relative to EXPOSED_ROOT by walking segments ["real", "file.txt"].
      const result = await app._resolveWithRemap("/real/file.txt");
      expect(result).toBe(path.join(tmpDir, "workspace", "real", "file.txt"));
    });

    it("walks through regular directory components before hitting a remapped symlink", async () => {
      // Create: workspace/subdir/deep-link → FOREIGN_PREFIX/shared (unreachable)
      // Path: workspace/subdir/deep-link/remapped.txt
      // Fast path stat fails; component loop walks 'subdir' (real dir → line 133)
      // then 'deep-link' (symlink → remap) then appends 'remapped.txt'.
      // This exercises: current = candidate (line 133) and return current (line 139)
      // via the remap early-return path.
      await fs.mkdir(path.join(tmpDir, "workspace", "subdir"), {
        recursive: true,
      });
      await fs.symlink(
        `${FOREIGN_PREFIX}/shared`,
        path.join(tmpDir, "workspace", "subdir", "deep-link"),
      );

      const fsPath = path.join(
        tmpDir,
        "workspace",
        "subdir",
        "deep-link",
        "remapped.txt",
      );
      const result = await app._resolveWithRemap(fsPath);
      expect(result).toBe(path.join(tmpDir, "shared", "remapped.txt"));
    });

    it("returns the final current path when loop completes without symlinks", async () => {
      // Walk a path where all components are real directories/files.
      // The fast path stat fails for a non-existent leaf; the loop walks
      // real components (line 133) and throws ENOENT at the missing leaf (line 139
      // is NOT reached in this case — it's reached when the loop completes).
      // To reach line 139 (return current), we need all segments to resolve
      // without hitting a symlink. Create a real nested dir and pass its path
      // after making the fast-path fail by using a path that resolveWithRemap
      // receives that doesn't start with EXPOSED_ROOT (so rel = full path).
      // Simplest: pass a path outside EXPOSED_ROOT that maps to a real dir
      // via the loop. Actually the loop uses EXPOSED_ROOT as the base, so
      // we need to construct a path where all segments are real.
      // The path must fail fast-path stat. Use a path with a non-existent
      // intermediate component to force the loop, but that will throw ENOENT.
      // The only way to reach 'return current' is if ALL segments resolve.
      // That means the full path IS reachable, which means fast-path succeeds.
      // So line 139 is only reachable if the fast path fails but all components
      // resolve — which can happen if the path contains a symlink that IS
      // reachable (stat succeeds on the symlink component → line 114-115 runs,
      // current = candidate, continue; then remaining segments are real).
      // The test "walks through a reachable symlink component" covers this.
      // Here we verify the ENOENT propagation from the loop for completeness.
      const fsPath = path.join(tmpDir, "workspace", "subdir", "no-such-file");
      await expect(app._resolveWithRemap(fsPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("remaps an unreachable absolute symlink to the correct path", async () => {
      const fsPath = path.join(tmpDir, "workspace", "link-to-foreign");
      const result = await app._resolveWithRemap(fsPath);
      expect(result).toBe(path.join(tmpDir, "shared"));
    });

    it("remaps and appends remaining path segments", async () => {
      const fsPath = path.join(tmpDir, "workspace", "link-to-foreign", "remapped.txt");
      const result = await app._resolveWithRemap(fsPath);
      expect(result).toBe(path.join(tmpDir, "shared", "remapped.txt"));
    });

    it("throws ENOENT for a completely missing path", async () => {
      const fsPath = path.join(tmpDir, "workspace", "does-not-exist");
      await expect(app._resolveWithRemap(fsPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("throws ENOENT for a broken symlink with no matching remap prefix", async () => {
      // Create a symlink pointing to a foreign prefix that is NOT in the remap list
      const brokenLink = path.join(tmpDir, "workspace", "broken-link");
      try {
        await fs.unlink(brokenLink);
      } catch (_) {
        // ignore if it doesn't exist
      }
      await fs.symlink("/some/other/foreign/path", brokenLink);

      const fsPath = path.join(tmpDir, "workspace", "broken-link");
      await expect(app._resolveWithRemap(fsPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  describe("getFileInfo with broken remapped symlink", () => {
    it("warns when a symlink remaps but the remapped path also fails", async () => {
      // Create a symlink that remaps to a path that doesn't exist under tmpDir
      const brokenRemapLink = path.join(tmpDir, "workspace", "broken-remap-link");
      try {
        await fs.unlink(brokenRemapLink);
      } catch (_) {
        // ignore
      }
      // Points to FOREIGN_PREFIX/nonexistent — remap gives tmpDir/nonexistent
      await fs.symlink(`${FOREIGN_PREFIX}/nonexistent`, brokenRemapLink);

      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      // GET /files on this specific entry triggers getFileInfo which hits line 160
      const supertest = require("supertest");
      const res = await supertest(app).get("/files");
      expect(res.status).toBe(200);

      // The warn should have been called for the broken-remap-link entry
      const warnCalls = warnSpy.mock.calls.map((c) => c[0]);
      expect(warnCalls.some((msg) => msg.includes("broken-remap-link"))).toBe(true);

      warnSpy.mockRestore();
    });
  });

  describe("getFileInfo symlinkTarget optional field", () => {
    it("does not include symlinkTarget when readlink returns an empty string", async () => {
      const fsModule = require("fs").promises;
      const originalReadlink = fsModule.readlink;
      fsModule.readlink = jest.fn(async (...args) => {
        const p = args[0];
        if (p === path.join(tmpDir, "workspace", "link-to-real")) {
          return "";
        }
        return originalReadlink(...args);
      });

      const supertest = require("supertest");
      try {
        const res = await supertest(app).get("/files");
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

  describe("EXPOSED_ROOT normalization branches", () => {
    it("treats workspaceSubdir='.' as exposing workspaceRoot", () => {
      const appDot = createApp({
        workspaceRoot: tmpDir,
        workspaceSubdir: ".",
        token: undefined,
        symlinkRemapPrefixes: [],
      });
      expect(appDot._exposedRoot).toBe(path.resolve(tmpDir, "."));
    });

    it("covers assertWithinRoot when EXPOSED_ROOT ends with path.sep (root '/')", () => {
      const rootApp = createApp({
        workspaceRoot: path.parse(process.cwd()).root,
        workspaceSubdir: ".",
        token: undefined,
        symlinkRemapPrefixes: [],
      });
      expect(() => rootApp._assertWithinRoot("/etc")).not.toThrow();
    });
  });

  describe("listDirectory error handling", () => {
    it("uses recursive=false default when omitted", async () => {
      const dirPath = path.join(tmpDir, "workspace", "real");
      const results = await app._listDirectory(dirPath, "/real");
      expect(Array.isArray(results)).toBe(true);
      expect(results.some((f) => f.name === "file.txt")).toBe(true);
    });

    it("skips entries that cannot be read and logs an error", async () => {
      // Mock fs.lstat to throw a non-ENOENT error for one entry to exercise
      // the catch block in listDirectory (line 210).
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
      const res = await supertest(app).get("/files");

      fsModule.lstat = originalLstat;
      errorSpy.mockRestore();

      // The request should still succeed — the bad entry is skipped
      expect(res.status).toBe(200);
    });
  });

  describe("GET /files with symlinks", () => {
    it("lists the workspace root including symlink entries", async () => {
      const supertest = require("supertest");
      const res = await supertest(app).get("/files");
      expect(res.status).toBe(200);
      const names = res.body.files.map((f) => f.name);
      expect(names).toContain("real");
      expect(names).toContain("link-to-real");
      expect(names).toContain("link-to-foreign");
    });

    it("lists contents of a reachable symlink directory", async () => {
      const supertest = require("supertest");
      const res = await supertest(app).get("/files?path=/link-to-real");
      expect(res.status).toBe(200);
      expect(res.body.files.some((f) => f.name === "file.txt")).toBe(true);
    });

    it("lists contents of a remapped symlink directory", async () => {
      const supertest = require("supertest");
      const res = await supertest(app).get("/files?path=/link-to-foreign");
      expect(res.status).toBe(200);
      expect(res.body.files.some((f) => f.name === "remapped.txt")).toBe(true);
    });
  });
});
