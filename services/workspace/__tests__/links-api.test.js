"use strict";

const request = require("supertest");
const os = require("os");
const path = require("path");
const fs = require("fs").promises;
const fsPromises = require("fs").promises;
const { createApp } = require("../src/app");

describe("Typed docs link API", () => {
  let tmpDir;
  let configRoot;
  let app;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-links-api-"));
    configRoot = path.join(tmpDir, "config-root");

    await fs.mkdir(path.join(configRoot, "workspace"), { recursive: true });
    await fs.mkdir(path.join(configRoot, "workspace-cto"), { recursive: true });

    app = createApp({
      configRoot,
      mainWorkspaceDir: "workspace",
      token: undefined,
      symlinkRemapPrefixes: [],
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("GET /links/docs/main returns missing by default", async () => {
    const res = await request(app).get("/links/docs/main");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: "docs",
      agentId: "main",
      workspaceVirtualPath: "/workspace",
      linkVirtualPath: "/workspace/docs",
      targetVirtualPath: "/docs",
      state: "missing",
    });
  });

  it("GET /links/docs/cto returns linked when a managed symlink exists", async () => {
    await fs.mkdir(path.join(configRoot, "docs"), { recursive: true });
    await fs.symlink("../docs", path.join(configRoot, "workspace-cto", "docs"));

    const res = await request(app).get("/links/docs/cto");
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("linked");
    expect(res.body.workspaceVirtualPath).toBe("/workspace-cto");
  });

  it("GET /links/docs/main returns conflict when link path is not a symlink", async () => {
    await fs.mkdir(path.join(configRoot, "workspace", "docs"), { recursive: true });

    const res = await request(app).get("/links/docs/main");
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("conflict");
    expect(res.body.conflict.reason).toBe("Path exists and is not a symlink");
  });

  it("PUT /links/docs/main creates docs root and managed symlink", async () => {
    const res = await request(app).put("/links/docs/main");

    expect(res.status).toBe(200);
    expect(res.body.action).toBe("created");
    expect(res.body.state).toBe("linked");

    const docsStats = await fs.stat(path.join(configRoot, "docs"));
    expect(docsStats.isDirectory()).toBe(true);

    const docsLinkStats = await fs.lstat(path.join(configRoot, "workspace", "docs"));
    expect(docsLinkStats.isSymbolicLink()).toBe(true);
  });

  it("PUT /links/docs/cto creates a missing workspace directory before linking", async () => {
    await fs.rm(path.join(configRoot, "workspace-cto"), { recursive: true, force: true });

    const res = await request(app).put("/links/docs/cto");
    expect(res.status).toBe(200);
    expect(res.body.action).toBe("created");
    expect(res.body.workspaceVirtualPath).toBe("/workspace-cto");

    const workspaceStats = await fs.stat(path.join(configRoot, "workspace-cto"));
    expect(workspaceStats.isDirectory()).toBe(true);

    const linkStats = await fs.lstat(path.join(configRoot, "workspace-cto", "docs"));
    expect(linkStats.isSymbolicLink()).toBe(true);
  });

  it("PUT /links/docs/main is idempotent when link is already managed", async () => {
    const first = await request(app).put("/links/docs/main");
    expect(first.status).toBe(200);
    expect(first.body.action).toBe("created");

    const second = await request(app).put("/links/docs/main");
    expect(second.status).toBe(200);
    expect(second.body.action).toBe("unchanged");
    expect(second.body.state).toBe("linked");
  });

  it("PUT /links/docs/main returns 409 for non-symlink conflicts", async () => {
    await fs.mkdir(path.join(configRoot, "workspace", "docs"), { recursive: true });

    const res = await request(app).put("/links/docs/main");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LINK_CONFLICT");
    expect(res.body.conflict.reason).toBe("Path exists and is not a symlink");
  });

  it("PUT /links/docs/main returns 409 for wrong symlink target conflicts", async () => {
    await fs.mkdir(path.join(configRoot, "docs"), { recursive: true });
    await fs.mkdir(path.join(configRoot, "elsewhere"), { recursive: true });
    await fs.symlink("../elsewhere", path.join(configRoot, "workspace", "docs"));

    const res = await request(app).put("/links/docs/main");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LINK_CONFLICT");
    expect(res.body.conflict.reason).toBe("Symlink points to unexpected target");
    expect(res.body.conflict.symlinkTarget).toBe("../elsewhere");
  });

  it("PUT /links/docs/main uses dot relative target when main workspace dir is docs", async () => {
    const customRoot = path.join(tmpDir, "config-main-docs");
    await fs.mkdir(path.join(customRoot, "docs"), { recursive: true });

    const customApp = createApp({
      configRoot: customRoot,
      mainWorkspaceDir: "docs",
      token: undefined,
      symlinkRemapPrefixes: [],
    });

    const res = await request(customApp).put("/links/docs/main");
    expect(res.status).toBe(200);
    expect(res.body.action).toBe("created");

    const symlinkTarget = await fs.readlink(path.join(customRoot, "docs", "docs"));
    expect(symlinkTarget).toBe(".");
  });

  it("DELETE /links/docs/main removes a managed symlink", async () => {
    await request(app).put("/links/docs/main");

    const res = await request(app).delete("/links/docs/main");
    expect(res.status).toBe(200);
    expect(res.body.action).toBe("deleted");
    expect(res.body.state).toBe("missing");

    await expect(
      fs.lstat(path.join(configRoot, "workspace", "docs")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("DELETE /links/docs/main is unchanged when link is already missing", async () => {
    const res = await request(app).delete("/links/docs/main");
    expect(res.status).toBe(200);
    expect(res.body.action).toBe("unchanged");
    expect(res.body.state).toBe("missing");
  });

  it("DELETE /links/docs/main returns conflict for non-managed paths", async () => {
    await fs.mkdir(path.join(configRoot, "workspace", "docs"), { recursive: true });

    const res = await request(app).delete("/links/docs/main");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LINK_CONFLICT");
    expect(res.body.conflict.reason).toBe("Path exists and is not a symlink");
  });

  it("returns 400 for unsupported link types", async () => {
    const res = await request(app).get("/links/projects/main");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Unsupported link type",
      code: "LINK_TYPE_UNSUPPORTED",
      type: "projects",
    });
  });

  it("PUT returns 400 for unsupported link types", async () => {
    const res = await request(app).put("/links/projects/main");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Unsupported link type",
      code: "LINK_TYPE_UNSUPPORTED",
      type: "projects",
    });
  });

  it("DELETE returns 400 for unsupported link types", async () => {
    const res = await request(app).delete("/links/projects/main");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Unsupported link type",
      code: "LINK_TYPE_UNSUPPORTED",
      type: "projects",
    });
  });

  it("returns 400 for invalid agent IDs", async () => {
    const res = await request(app).get("/links/docs/Bad.Agent");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid agent ID",
      code: "INVALID_AGENT_ID",
      agentId: "Bad.Agent",
    });
  });

  it("PUT returns 400 for invalid agent IDs", async () => {
    const res = await request(app).put("/links/docs/Bad.Agent");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid agent ID",
      code: "INVALID_AGENT_ID",
      agentId: "Bad.Agent",
    });
  });

  it("DELETE returns 400 for invalid agent IDs", async () => {
    const res = await request(app).delete("/links/docs/Bad.Agent");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid agent ID",
      code: "INVALID_AGENT_ID",
      agentId: "Bad.Agent",
    });
  });

  it("returns 500 when link inspection hits a non-ENOENT fs error", async () => {
    const originalLstat = fsPromises.lstat.bind(fsPromises);
    jest.spyOn(fsPromises, "lstat").mockImplementation(async (targetPath, ...args) => {
      if (String(targetPath).endsWith(path.join("workspace", "docs"))) {
        const error = new Error("Permission denied");
        error.code = "EACCES";
        throw error;
      }
      return originalLstat(targetPath, ...args);
    });

    const res = await request(app).get("/links/docs/main");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Permission denied");
  });

  it("returns 500 when PUT link creation hits a non-ENOENT fs error", async () => {
    const originalMkdir = fsPromises.mkdir.bind(fsPromises);
    jest.spyOn(fsPromises, "mkdir").mockImplementation(async (targetPath, ...args) => {
      if (String(targetPath).endsWith(path.join("workspace"))) {
        const error = new Error("mkdir failed");
        error.code = "EACCES";
        throw error;
      }
      return originalMkdir(targetPath, ...args);
    });

    const res = await request(app).put("/links/docs/main");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("mkdir failed");
  });

  it("returns 500 when DELETE unlink hits a non-ENOENT fs error", async () => {
    await request(app).put("/links/docs/main");

    jest.spyOn(fsPromises, "unlink").mockRejectedValue(
      Object.assign(new Error("unlink failed"), {
        code: "EACCES",
      }),
    );

    const res = await request(app).delete("/links/docs/main");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("unlink failed");
  });

  it("legacy /symlinks/ensure endpoint is removed", async () => {
    const res = await request(app).post("/symlinks/ensure");
    expect(res.status).toBe(404);
  });
});
