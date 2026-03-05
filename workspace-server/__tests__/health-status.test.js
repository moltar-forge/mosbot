"use strict";

const request = require("supertest");
const os = require("os");
const path = require("path");
const fs = require("fs").promises;
const { createApp } = require("../src/app");

describe("Health and status endpoints", () => {
  let tmpDir;
  let workspaceRoot;
  let configRoot;
  let app;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-health-test-"));
    configRoot = path.join(tmpDir, "config-root");
    workspaceRoot = path.join(configRoot, "workspace");

    await fs.mkdir(configRoot, { recursive: true });
    await fs.mkdir(workspaceRoot, { recursive: true });

    app = createApp({
      configRoot,
      mainWorkspaceDir: "workspace",
      token: undefined,
      symlinkRemapPrefixes: [],
    });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    it("includes split-root fields", async () => {
      const res = await request(app).get("/health");
      expect(res.body.configRoot).toBe(configRoot);
      expect(res.body.mainWorkspaceDir).toBe("workspace");
      expect(res.body.mainWorkspaceFsRoot).toBe(workspaceRoot);
      expect(res.body.workspaceFsRoot).toBe(workspaceRoot);
      expect(res.body.configFsRoot).toBe(configRoot);
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe("GET /status", () => {
    it("returns 200 with both roots accessible", async () => {
      const res = await request(app).get("/status");
      expect(res.status).toBe(200);
      expect(res.body.workspaceAccessible).toBe(true);
      expect(res.body.configAccessible).toBe(true);
      expect(res.body.workspaceExists).toBe(true);
      expect(res.body.configExists).toBe(true);
    });

    it("returns 500 when workspace root does not exist", async () => {
      const missingWorkspaceApp = createApp({
        configRoot,
        mainWorkspaceDir: "missing-main-workspace",
        token: undefined,
        symlinkRemapPrefixes: [],
      });

      const res = await request(missingWorkspaceApp).get("/status");
      expect(res.status).toBe(500);
      expect(res.body.workspaceAccessible).toBe(false);
      expect(res.body.configAccessible).toBe(true);
      expect(res.body.errors.mainWorkspace).toBeDefined();
    });

    it("returns 500 when config root does not exist", async () => {
      const missingConfigApp = createApp({
        configRoot: "/nonexistent/config/path/that/does/not/exist",
        mainWorkspaceDir: "workspace",
        token: undefined,
        symlinkRemapPrefixes: [],
      });

      const res = await request(missingConfigApp).get("/status");
      expect(res.status).toBe(500);
      expect(res.body.workspaceAccessible).toBe(false);
      expect(res.body.configAccessible).toBe(false);
      expect(res.body.errors.mainWorkspace).toBeDefined();
      expect(res.body.errors.config).toBeDefined();
    });

    it("uses fallback status error message when root errors are blank", async () => {
      const fsModule = require("fs").promises;
      const originalStat = fsModule.stat;
      const blankError = new Error();
      blankError.message = "";
      fsModule.stat = jest.fn().mockRejectedValue(blankError);

      try {
        const res = await request(app).get("/status");
        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Filesystem root inaccessible");
      } finally {
        fsModule.stat = originalStat;
      }
    });
  });
});
