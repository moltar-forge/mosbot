"use strict";

const request = require("supertest");
const os = require("os");
const path = require("path");
const fs = require("fs").promises;
const { createApp } = require("../src/app");

describe("Files API", () => {
  let tmpDir;
  let workspaceRoot;
  let configRoot;
  let app;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-files-test-"));
    configRoot = path.join(tmpDir, "config-root");
    workspaceRoot = path.join(configRoot, "workspace");

    await fs.mkdir(configRoot, { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "subdir"), { recursive: true });
    await fs.mkdir(path.join(configRoot, "workspace-cto"), { recursive: true });
    await fs.mkdir(path.join(configRoot, "projects"), { recursive: true });
    await fs.mkdir(path.join(configRoot, "skills"), { recursive: true });
    await fs.mkdir(path.join(configRoot, "docs"), { recursive: true });
    await fs.mkdir(path.join(configRoot, "_archived_workspace_main"), {
      recursive: true,
    });

    await fs.writeFile(path.join(workspaceRoot, "hello.txt"), "hello world");
    await fs.writeFile(
      path.join(workspaceRoot, "subdir", "nested.txt"),
      "nested content",
    );
    await fs.writeFile(path.join(configRoot, "workspace-cto", "agent.txt"), "cto");
    await fs.writeFile(path.join(configRoot, "projects", "project.txt"), "project");
    await fs.writeFile(path.join(configRoot, "skills", "skill.txt"), "skill");
    await fs.writeFile(path.join(configRoot, "docs", "readme.md"), "docs");
    await fs.writeFile(
      path.join(configRoot, "_archived_workspace_main", "archived.txt"),
      "archived content",
    );
    await fs.writeFile(path.join(configRoot, "openclaw.json"), '{"models":[]}');
    await fs.writeFile(path.join(configRoot, "agents.json"), '{"agents":[]}');

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

  describe("GET /files", () => {
    it("denies root path when path is omitted", async () => {
      const res = await request(app).get("/files");
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: "Path not allowed",
        code: "PATH_NOT_ALLOWED",
        path: "/",
      });
    });

    it("denies explicit root path", async () => {
      const res = await request(app).get("/files?path=/");
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PATH_NOT_ALLOWED");
      expect(res.body.path).toBe("/");
    });

    it("lists a specific workspace subdirectory", async () => {
      const res = await request(app).get("/files?path=/workspace/subdir");
      expect(res.status).toBe(200);
      expect(res.body.files.some((f) => f.name === "nested.txt")).toBe(true);
    });

    it("maps /workspace to the main workspace root", async () => {
      const res = await request(app).get("/files?path=/workspace");
      expect(res.status).toBe(200);
      expect(res.body.files.some((f) => f.name === "hello.txt")).toBe(true);
    });

    it("maps /workspace/* paths to main workspace children without nesting", async () => {
      const res = await request(app).get("/files?path=/workspace/subdir");
      expect(res.status).toBe(200);
      expect(res.body.files.some((f) => f.name === "nested.txt")).toBe(true);
    });

    it("routes /workspace-<agent> paths to config root", async () => {
      const res = await request(app).get("/files?path=/workspace-cto");
      expect(res.status).toBe(200);
      expect(res.body.files.some((f) => f.name === "agent.txt")).toBe(true);
    });

    it("routes /projects paths to config root", async () => {
      const res = await request(app).get("/files?path=/projects");
      expect(res.status).toBe(200);
      expect(res.body.files.some((f) => f.name === "project.txt")).toBe(true);
    });

    it("routes /skills paths to config root", async () => {
      const res = await request(app).get("/files?path=/skills");
      expect(res.status).toBe(200);
      expect(res.body.files.some((f) => f.name === "skill.txt")).toBe(true);
    });

    it("routes /docs paths to config root", async () => {
      const res = await request(app).get("/files?path=/docs");
      expect(res.status).toBe(200);
      expect(res.body.files.some((f) => f.name === "readme.md")).toBe(true);
    });

    it("routes /_archived_workspace_main paths to config root", async () => {
      const res = await request(app).get("/files?path=/_archived_workspace_main");
      expect(res.status).toBe(200);
      expect(res.body.files.some((f) => f.name === "archived.txt")).toBe(true);
    });

    it("returns config file info from config root", async () => {
      const res = await request(app).get("/files?path=/openclaw.json");
      expect(res.status).toBe(200);
      expect(res.body.files).toHaveLength(1);
      expect(res.body.files[0].name).toBe("openclaw.json");
    });

    it("returns agents config file info from config root", async () => {
      const res = await request(app).get("/files?path=/agents.json");
      expect(res.status).toBe(200);
      expect(res.body.files).toHaveLength(1);
      expect(res.body.files[0].name).toBe("agents.json");
    });

    it("lists recursively when recursive=true", async () => {
      const res = await request(app).get("/files?path=/workspace&recursive=true");
      expect(res.status).toBe(200);
      const names = res.body.files.map((f) => f.name);
      expect(names).toContain("nested.txt");
    });

    it("returns 404 for a non-existent path", async () => {
      const res = await request(app).get("/files?path=/workspace/does-not-exist.txt");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Path not found");
    });

    it("denies non-allowlisted paths", async () => {
      const res = await request(app).get("/files?path=/foo");
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PATH_NOT_ALLOWED");
      expect(res.body.path).toBe("/foo");
    });

    it("rejects disallowed paths before filesystem calls", async () => {
      const fsModule = require("fs").promises;
      const statSpy = jest.spyOn(fsModule, "stat");

      const res = await request(app).get("/files?path=/tmp");

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PATH_NOT_ALLOWED");
      expect(statSpy).not.toHaveBeenCalled();

      statSpy.mockRestore();
    });

    it("denies traversal-style paths after normalization", async () => {
      const res = await request(app).get("/files?path=/workspace/../../../etc/passwd");
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PATH_NOT_ALLOWED");
      expect(res.body.path).toBe("/etc/passwd");
    });
  });

  describe("GET /files/content", () => {
    it("returns workspace file content", async () => {
      const res = await request(app).get("/files/content?path=/workspace/hello.txt");
      expect(res.status).toBe(200);
      expect(res.body.content).toBe("hello world");
      expect(res.body.encoding).toBe("utf8");
    });

    it("returns config file content from config root", async () => {
      const res = await request(app).get("/files/content?path=/openclaw.json");
      expect(res.status).toBe(200);
      expect(res.body.content).toContain("models");
    });

    it("returns agents config content from config root", async () => {
      const res = await request(app).get("/files/content?path=/agents.json");
      expect(res.status).toBe(200);
      expect(res.body.content).toContain("agents");
    });

    it("returns content for /workspace/* paths from main workspace root", async () => {
      const res = await request(app).get("/files/content?path=/workspace/hello.txt");
      expect(res.status).toBe(200);
      expect(res.body.content).toBe("hello world");
    });

    it("returns content for archived workspace files from config root", async () => {
      const res = await request(app).get(
        "/files/content?path=/_archived_workspace_main/archived.txt",
      );
      expect(res.status).toBe(200);
      expect(res.body.content).toBe("archived content");
    });

    it("returns 400 when path parameter is missing", async () => {
      const res = await request(app).get("/files/content");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Path parameter is required");
    });

    it("returns 400 when path is a directory", async () => {
      const res = await request(app).get("/files/content?path=/workspace/subdir");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Cannot read directory as file");
    });

    it("returns 404 for a non-existent file", async () => {
      const res = await request(app).get("/files/content?path=/workspace/missing.txt");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("File not found");
    });

    it("returns 403 for disallowed content path", async () => {
      const res = await request(app).get("/files/content?path=/tmp/secret.txt");
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PATH_NOT_ALLOWED");
      expect(res.body.path).toBe("/tmp/secret.txt");
    });
  });

  describe("POST /files", () => {
    it("creates a new workspace file and returns 201", async () => {
      const res = await request(app).post("/files").send({
        path: "/workspace/created.txt",
        content: "created content",
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe("File created successfully");
      expect(res.body.name).toBe("created.txt");

      const actual = await fs.readFile(path.join(workspaceRoot, "created.txt"), "utf8");
      expect(actual).toBe("created content");
    });

    it("creates parent directories in workspace root", async () => {
      const res = await request(app).post("/files").send({
        path: "/workspace/deep/nested/file.txt",
        content: "deep content",
      });
      expect(res.status).toBe(201);

      const actual = await fs.readFile(
        path.join(workspaceRoot, "deep", "nested", "file.txt"),
        "utf8",
      );
      expect(actual).toBe("deep content");
    });

    it("creates agents config file under config root", async () => {
      const res = await request(app).post("/files").send({
        path: "/agents.json",
        content: '{"version":1}',
      });
      expect(res.status).toBe(201);

      const actual = await fs.readFile(path.join(configRoot, "agents.json"), "utf8");
      expect(actual).toContain("version");
    });

    it("returns 400 when path is missing", async () => {
      const res = await request(app).post("/files").send({ content: "x" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Path and content are required");
    });

    it("returns 400 when content is missing", async () => {
      const res = await request(app).post("/files").send({ path: "/x.txt" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Path and content are required");
    });

    it("returns 403 for disallowed create path", async () => {
      const res = await request(app).post("/files").send({
        path: "/tmp/new-file.txt",
        content: "blocked",
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PATH_NOT_ALLOWED");
      expect(res.body.path).toBe("/tmp/new-file.txt");
    });
  });

  describe("PUT /files", () => {
    beforeAll(async () => {
      await fs.writeFile(path.join(workspaceRoot, "updatable.txt"), "original");
      await fs.writeFile(path.join(configRoot, "agents.json"), '{"version":1}');
    });

    it("updates an existing workspace file and returns 200", async () => {
      const res = await request(app).put("/files").send({
        path: "/workspace/updatable.txt",
        content: "updated content",
      });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("File updated successfully");

      const actual = await fs.readFile(path.join(workspaceRoot, "updatable.txt"), "utf8");
      expect(actual).toBe("updated content");
    });

    it("updates an existing config file and returns 200", async () => {
      const res = await request(app).put("/files").send({
        path: "/agents.json",
        content: '{"version":2}',
      });
      expect(res.status).toBe(200);

      const actual = await fs.readFile(path.join(configRoot, "agents.json"), "utf8");
      expect(actual).toContain('"version":2');
    });

    it("returns 404 when file does not exist", async () => {
      const res = await request(app).put("/files").send({
        path: "/workspace/nonexistent.txt",
        content: "x",
      });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("File not found");
    });

    it("returns 400 when path is missing", async () => {
      const res = await request(app).put("/files").send({ content: "x" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Path and content are required");
    });

    it("returns 400 when content is missing", async () => {
      const res = await request(app).put("/files").send({ path: "/x.txt" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Path and content are required");
    });

    it("returns 403 for disallowed update path", async () => {
      const res = await request(app).put("/files").send({
        path: "/tmp/agents.json",
        content: "{}",
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PATH_NOT_ALLOWED");
      expect(res.body.path).toBe("/tmp/agents.json");
    });
  });

  describe("DELETE /files", () => {
    it("deletes a workspace file and returns 204", async () => {
      await fs.writeFile(path.join(workspaceRoot, "to-delete.txt"), "bye");
      const res = await request(app).delete("/files?path=/workspace/to-delete.txt");
      expect(res.status).toBe(204);

      await expect(
        fs.access(path.join(workspaceRoot, "to-delete.txt")),
      ).rejects.toThrow();
    });

    it("deletes a workspace directory recursively and returns 204", async () => {
      await fs.mkdir(path.join(workspaceRoot, "dir-to-delete"), { recursive: true });
      await fs.writeFile(path.join(workspaceRoot, "dir-to-delete", "file.txt"), "x");
      const res = await request(app).delete("/files?path=/workspace/dir-to-delete");
      expect(res.status).toBe(204);
    });

    it("deletes a config file and returns 204", async () => {
      await fs.writeFile(path.join(configRoot, "agents.json"), '{"version":2}');
      const res = await request(app).delete("/files?path=/agents.json");
      expect(res.status).toBe(204);

      await expect(fs.access(path.join(configRoot, "agents.json"))).rejects.toThrow();
    });

    it("returns 400 when path parameter is missing", async () => {
      const res = await request(app).delete("/files");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Path parameter is required");
    });

    it("returns 404 for a non-existent path", async () => {
      const res = await request(app).delete("/files?path=/workspace/missing.txt");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Path not found");
    });

    it("returns 403 for disallowed delete path", async () => {
      const res = await request(app).delete("/files?path=/tmp/secret.txt");
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PATH_NOT_ALLOWED");
      expect(res.body.path).toBe("/tmp/secret.txt");
    });
  });

  describe("Error handler (next(error) paths)", () => {
    it("GET /files: returns 500 for unexpected errors (via mocked fs.readdir)", async () => {
      const fsModule = require("fs").promises;
      const originalReaddir = fsModule.readdir;
      const boom = new Error("unexpected readdir error");
      fsModule.readdir = jest.fn().mockRejectedValueOnce(boom);

      const res = await request(app).get("/files?path=/workspace");

      fsModule.readdir = originalReaddir;

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("unexpected readdir error");
    });

    it("GET /files: uses fallback message when error.message is empty", async () => {
      const fsModule = require("fs").promises;
      const originalReaddir = fsModule.readdir;
      const boom = new Error();
      fsModule.readdir = jest.fn().mockRejectedValueOnce(boom);

      const res = await request(app).get("/files?path=/workspace");

      fsModule.readdir = originalReaddir;

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
    });

    it("GET /files/content: returns 500 for unexpected non-ENOENT errors", async () => {
      const fsModule = require("fs").promises;
      const originalReadFile = fsModule.readFile;
      const boom = new Error("unexpected readFile error");
      fsModule.readFile = jest.fn().mockRejectedValueOnce(boom);

      const res = await request(app).get("/files/content?path=/workspace/hello.txt");

      fsModule.readFile = originalReadFile;

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("unexpected readFile error");
    });

    it("POST /files: returns 500 for unexpected errors (via mocked fs.mkdir)", async () => {
      const fsModule = require("fs").promises;
      const originalMkdir = fsModule.mkdir;
      const boom = new Error("unexpected mkdir error");
      fsModule.mkdir = jest.fn().mockRejectedValueOnce(boom);

      const res = await request(app).post("/files").send({
        path: "/workspace/new-file.txt",
        content: "content",
      });

      fsModule.mkdir = originalMkdir;

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("unexpected mkdir error");
    });

    it("PUT /files: returns 500 for unexpected errors (via mocked fs.writeFile)", async () => {
      const fsModule = require("fs").promises;
      const originalWriteFile = fsModule.writeFile;
      const boom = new Error("unexpected writeFile error");
      fsModule.writeFile = jest.fn().mockRejectedValueOnce(boom);

      const res = await request(app).put("/files").send({
        path: "/workspace/updatable.txt",
        content: "content",
      });

      fsModule.writeFile = originalWriteFile;

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("unexpected writeFile error");
    });

    it("DELETE /files: returns 500 for unexpected non-ENOENT errors (via mocked fs.stat)", async () => {
      const fsModule = require("fs").promises;
      const originalStat = fsModule.stat;
      const boom = new Error("unexpected stat error");
      boom.code = "EACCES";
      fsModule.stat = jest.fn().mockRejectedValueOnce(boom);

      const res = await request(app).delete("/files?path=/workspace/hello.txt");

      fsModule.stat = originalStat;

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("unexpected stat error");
    });
  });
});
