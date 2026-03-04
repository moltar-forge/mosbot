"use strict";

const request = require("supertest");
const os = require("os");
const path = require("path");
const fs = require("fs").promises;
const fsPromises = require("fs").promises;
const { createApp } = require("../src/app");

describe("Docs symlink bootstrap", () => {
  let tmpDir;
  let configRoot;
  let app;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-symlink-bootstrap-"));
    configRoot = path.join(tmpDir, "config-root");

    await fs.mkdir(path.join(configRoot, "workspace"), { recursive: true });
    await fs.mkdir(path.join(configRoot, "workspace-cto"), { recursive: true });
    await fs.writeFile(path.join(configRoot, "README.txt"), "ignore me");

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

  it("creates docs root and workspace docs symlinks", async () => {
    const res = await request(app).post("/symlinks/ensure");

    expect(res.status).toBe(200);
    expect(res.body.sharedDir).toBe("/docs");
    expect(res.body.scannedWorkspaces).toBe(2);
    expect(res.body.created).toEqual(
      expect.arrayContaining(["/workspace/docs", "/workspace-cto/docs"]),
    );
    expect(res.body.conflicts).toEqual([]);

    const docsRootStats = await fs.stat(path.join(configRoot, "docs"));
    expect(docsRootStats.isDirectory()).toBe(true);

    const mainDocsLstat = await fs.lstat(path.join(configRoot, "workspace", "docs"));
    const agentDocsLstat = await fs.lstat(path.join(configRoot, "workspace-cto", "docs"));
    expect(mainDocsLstat.isSymbolicLink()).toBe(true);
    expect(agentDocsLstat.isSymbolicLink()).toBe(true);
  });

  it("is idempotent when symlinks are already correct", async () => {
    const first = await request(app).post("/symlinks/ensure");
    expect(first.status).toBe(200);

    const second = await request(app).post("/symlinks/ensure");
    expect(second.status).toBe(200);
    expect(second.body.created).toEqual([]);
    expect(second.body.existing).toEqual(
      expect.arrayContaining(["/workspace/docs", "/workspace-cto/docs"]),
    );
    expect(second.body.conflicts).toEqual([]);
  });

  it("returns conflict when destination exists as non-symlink", async () => {
    await fs.mkdir(path.join(configRoot, "workspace", "docs"), { recursive: true });

    const res = await request(app).post("/symlinks/ensure");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DOCS_SYMLINK_CONFLICT");
    expect(res.body.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/workspace/docs",
          reason: "Path exists and is not a symlink",
        }),
      ]),
    );
    expect(res.body.created).toContain("/workspace-cto/docs");
  });

  it("returns conflict when destination symlink points to wrong target", async () => {
    await fs.mkdir(path.join(configRoot, "somewhere-else"), { recursive: true });
    await fs.symlink(
      path.join(configRoot, "somewhere-else"),
      path.join(configRoot, "workspace", "docs"),
    );

    const res = await request(app).post("/symlinks/ensure");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DOCS_SYMLINK_CONFLICT");
    expect(res.body.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/workspace/docs",
          reason: "Symlink points to unexpected target",
        }),
      ]),
    );
    expect(res.body.created).toContain("/workspace-cto/docs");
  });

  it("returns 500 when listing docs symlinks hits a non-ENOENT fs error", async () => {
    const originalLstat = fsPromises.lstat.bind(fsPromises);
    const lstatSpy = jest.spyOn(fsPromises, "lstat");
    lstatSpy.mockImplementation(async (targetPath, ...args) => {
      if (String(targetPath).endsWith(path.join("workspace", "docs"))) {
        const error = new Error("Permission denied");
        error.code = "EACCES";
        throw error;
      }
      return originalLstat(targetPath, ...args);
    });

    const res = await request(app).post("/symlinks/ensure");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Permission denied");
  });

  it("creates a dot-relative target when workspace dir equals docs root", async () => {
    const customRoot = path.join(tmpDir, "config-root-main-docs");
    await fs.mkdir(path.join(customRoot, "docs"), { recursive: true });
    await fs.writeFile(path.join(customRoot, "README.txt"), "ignore me");

    const customApp = createApp({
      configRoot: customRoot,
      mainWorkspaceDir: "docs",
      token: undefined,
      symlinkRemapPrefixes: [],
    });

    const res = await request(customApp).post("/symlinks/ensure");
    expect(res.status).toBe(200);
    expect(res.body.created).toContain("/docs/docs");

    const linkTarget = await fs.readlink(path.join(customRoot, "docs", "docs"));
    expect(linkTarget).toBe(".");
  });
});
