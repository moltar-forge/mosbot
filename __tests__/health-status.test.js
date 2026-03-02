"use strict";

const request = require("supertest");
const os = require("os");
const path = require("path");
const fs = require("fs").promises;
const { createApp } = require("../src/app");

describe("Health and status endpoints", () => {
  let tmpDir;
  let app;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-health-test-"));
    await fs.mkdir(path.join(tmpDir, "workspace"), { recursive: true });

    app = createApp({
      workspaceRoot: tmpDir,
      workspaceSubdir: "workspace",
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

    it("includes workspace and exposedRoot fields", async () => {
      const res = await request(app).get("/health");
      expect(res.body.workspace).toBe(tmpDir);
      expect(res.body.exposedRoot).toBe(path.join(tmpDir, "workspace"));
      expect(res.body.workspaceSubdir).toBe("workspace");
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe("GET /status", () => {
    it("returns 200 with accessible: true when workspace exists", async () => {
      const res = await request(app).get("/status");
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(true);
      expect(res.body.accessible).toBe(true);
      expect(res.body.workspace).toBe(tmpDir);
    });

    it("returns 500 with accessible: false when workspace does not exist", async () => {
      const missingApp = createApp({
        workspaceRoot: "/nonexistent/path/that/does/not/exist",
        workspaceSubdir: "workspace",
        token: undefined,
        symlinkRemapPrefixes: [],
      });
      const res = await request(missingApp).get("/status");
      expect(res.status).toBe(500);
      expect(res.body.exists).toBe(false);
      expect(res.body.accessible).toBe(false);
      expect(res.body.error).toBeDefined();
    });
  });
});
