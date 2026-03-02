"use strict";

const request = require("supertest");
const os = require("os");
const path = require("path");
const fs = require("fs").promises;
const { createApp } = require("../src/app");

describe("Authentication middleware", () => {
  let tmpDir;
  let app;
  const TOKEN = "test-token-abc123";

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-auth-test-"));
    // Create a minimal workspace structure
    await fs.mkdir(path.join(tmpDir, "workspace"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "workspace", "hello.txt"), "hello");
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("when token is configured", () => {
    beforeAll(() => {
      app = createApp({
        workspaceRoot: tmpDir,
        workspaceSubdir: "workspace",
        token: TOKEN,
        symlinkRemapPrefixes: [],
      });
    });

    it("returns 401 when Authorization header is missing", async () => {
      const res = await request(app).get("/status");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Authorization required");
    });

    it("returns 401 when Authorization header has wrong scheme", async () => {
      const res = await request(app).get("/status").set("Authorization", "Basic abc");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Authorization required");
    });

    it("returns 401 when token is incorrect", async () => {
      const res = await request(app)
        .get("/status")
        .set("Authorization", "Bearer wrong-token");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid token");
    });

    it("returns 200 when token is correct", async () => {
      const res = await request(app)
        .get("/status")
        .set("Authorization", `Bearer ${TOKEN}`);
      expect(res.status).toBe(200);
    });

    it("allows /health without a token", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
    });
  });

  describe("when no token is configured (anonymous mode)", () => {
    beforeAll(() => {
      app = createApp({
        workspaceRoot: tmpDir,
        workspaceSubdir: "workspace",
        token: undefined,
        symlinkRemapPrefixes: [],
      });
    });

    it("allows /status without any Authorization header", async () => {
      const res = await request(app).get("/status");
      expect(res.status).toBe(200);
    });

    it("allows /files without any Authorization header", async () => {
      const res = await request(app).get("/files");
      expect(res.status).toBe(200);
    });
  });
});
