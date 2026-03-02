"use strict";

const request = require("supertest");
const os = require("os");
const path = require("path");
const fs = require("fs").promises;
const { createApp } = require("../src/app");

describe("Files API", () => {
  let tmpDir;
  let app;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-files-test-"));
    // workspace root is tmpDir, exposed subdir is "workspace"
    await fs.mkdir(path.join(tmpDir, "workspace", "subdir"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "workspace", "hello.txt"), "hello world");
    await fs.writeFile(
      path.join(tmpDir, "workspace", "subdir", "nested.txt"),
      "nested content",
    );

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

  // ── GET /files ─────────────────────────────────────────────────────────────

  describe("GET /files", () => {
    it("lists root directory contents", async () => {
      const res = await request(app).get("/files");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.files)).toBe(true);
      expect(res.body.count).toBeGreaterThanOrEqual(2);
    });

    it("lists a specific subdirectory", async () => {
      const res = await request(app).get("/files?path=/subdir");
      expect(res.status).toBe(200);
      expect(res.body.files.some((f) => f.name === "nested.txt")).toBe(true);
    });

    it("returns single file info when path points to a file", async () => {
      const res = await request(app).get("/files?path=/hello.txt");
      expect(res.status).toBe(200);
      expect(res.body.files).toHaveLength(1);
      expect(res.body.files[0].name).toBe("hello.txt");
      expect(res.body.files[0].type).toBe("file");
    });

    it("lists recursively when recursive=true", async () => {
      const res = await request(app).get("/files?recursive=true");
      expect(res.status).toBe(200);
      const names = res.body.files.map((f) => f.name);
      expect(names).toContain("nested.txt");
    });

    it("returns 404 for a non-existent path", async () => {
      const res = await request(app).get("/files?path=/does-not-exist.txt");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Path not found");
    });

    it("normalises traversal sequences safely within the workspace root", async () => {
      // /../../../etc/passwd normalises to /etc/passwd which resolves to
      // EXPOSED_ROOT/etc/passwd — safely inside the workspace. The path just
      // won't exist, so we get a 404, not a traversal error.
      const res = await request(app).get("/files?path=/../../../etc/passwd");
      expect(res.status).toBe(404);
    });
  });

  // ── GET /files/content ─────────────────────────────────────────────────────

  describe("GET /files/content", () => {
    it("returns file content", async () => {
      const res = await request(app).get("/files/content?path=/hello.txt");
      expect(res.status).toBe(200);
      expect(res.body.content).toBe("hello world");
      expect(res.body.encoding).toBe("utf8");
    });

    it("returns 400 when path parameter is missing", async () => {
      const res = await request(app).get("/files/content");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Path parameter is required");
    });

    it("returns 400 when path is a directory", async () => {
      const res = await request(app).get("/files/content?path=/subdir");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Cannot read directory as file");
    });

    it("returns 404 for a non-existent file", async () => {
      const res = await request(app).get("/files/content?path=/missing.txt");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("File not found");
    });
  });

  // ── POST /files ────────────────────────────────────────────────────────────

  describe("POST /files", () => {
    it("creates a new file and returns 201", async () => {
      const res = await request(app).post("/files").send({
        path: "/created.txt",
        content: "created content",
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe("File created successfully");
      expect(res.body.name).toBe("created.txt");

      const actual = await fs.readFile(
        path.join(tmpDir, "workspace", "created.txt"),
        "utf8",
      );
      expect(actual).toBe("created content");
    });

    it("creates parent directories as needed", async () => {
      const res = await request(app).post("/files").send({
        path: "/deep/nested/file.txt",
        content: "deep content",
      });
      expect(res.status).toBe(201);
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
  });

  // ── PUT /files ─────────────────────────────────────────────────────────────

  describe("PUT /files", () => {
    beforeAll(async () => {
      await fs.writeFile(path.join(tmpDir, "workspace", "updatable.txt"), "original");
    });

    it("updates an existing file and returns 200", async () => {
      const res = await request(app).put("/files").send({
        path: "/updatable.txt",
        content: "updated content",
      });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("File updated successfully");

      const actual = await fs.readFile(
        path.join(tmpDir, "workspace", "updatable.txt"),
        "utf8",
      );
      expect(actual).toBe("updated content");
    });

    it("returns 404 when file does not exist", async () => {
      const res = await request(app).put("/files").send({
        path: "/nonexistent.txt",
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
  });

  // ── DELETE /files ──────────────────────────────────────────────────────────

  describe("DELETE /files", () => {
    it("deletes a file and returns 204", async () => {
      await fs.writeFile(path.join(tmpDir, "workspace", "to-delete.txt"), "bye");
      const res = await request(app).delete("/files?path=/to-delete.txt");
      expect(res.status).toBe(204);

      await expect(
        fs.access(path.join(tmpDir, "workspace", "to-delete.txt")),
      ).rejects.toThrow();
    });

    it("deletes a directory recursively and returns 204", async () => {
      await fs.mkdir(path.join(tmpDir, "workspace", "dir-to-delete"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(tmpDir, "workspace", "dir-to-delete", "file.txt"),
        "x",
      );
      const res = await request(app).delete("/files?path=/dir-to-delete");
      expect(res.status).toBe(204);
    });

    it("returns 400 when path parameter is missing", async () => {
      const res = await request(app).delete("/files");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Path parameter is required");
    });

    it("returns 404 for a non-existent path", async () => {
      const res = await request(app).delete("/files?path=/missing.txt");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Path not found");
    });
  });

  // ── Error handler ──────────────────────────────────────────────────────────

  describe("Error handler (next(error) paths)", () => {
    it("GET /files: returns 500 for unexpected errors (via mocked fs.readdir)", async () => {
      const fsModule = require("fs").promises;
      const originalReaddir = fsModule.readdir;
      const boom = new Error("unexpected readdir error");
      fsModule.readdir = jest.fn().mockRejectedValueOnce(boom);

      const res = await request(app).get("/files");

      fsModule.readdir = originalReaddir;

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("unexpected readdir error");
    });

    it("GET /files: uses fallback message when error.message is empty", async () => {
      const fsModule = require("fs").promises;
      const originalReaddir = fsModule.readdir;
      const boom = new Error();
      fsModule.readdir = jest.fn().mockRejectedValueOnce(boom);

      const res = await request(app).get("/files");

      fsModule.readdir = originalReaddir;

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
    });

    it("GET /files/content: returns 500 for unexpected non-ENOENT errors", async () => {
      const fsModule = require("fs").promises;
      const originalReadFile = fsModule.readFile;
      const boom = new Error("unexpected readFile error");
      fsModule.readFile = jest.fn().mockRejectedValueOnce(boom);

      const res = await request(app).get("/files/content?path=/hello.txt");

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
        path: "/new-file.txt",
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
        path: "/updatable.txt",
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

      const res = await request(app).delete("/files?path=/hello.txt");

      fsModule.stat = originalStat;

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("unexpected stat error");
    });
  });
});
