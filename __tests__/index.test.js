"use strict";

/**
 * Tests for src/index.js — the process entrypoint.
 *
 * We test two ways:
 * 1. Direct require with jest.mock — for coverage instrumentation
 * 2. Child process spawn — for testing process.exit() behaviour
 */

const { execFile } = require("child_process");
const path = require("path");

const INDEX_PATH = path.join(__dirname, "..", "src", "index.js");

// ── Mock dotenv to prevent .env file from interfering with tests ──────────────
jest.mock("dotenv", () => ({
  config: jest.fn(),
}));

// ── Mock app module so index.js doesn't bind to a real port ──────────────────
// jest.mock is hoisted, so the factory must be self-contained.

jest.mock("../src/app", () => {
  const listenFn = jest.fn((port, cb) => {
    if (cb) cb();
  });
  const mockApp = {
    listen: listenFn,
    _exposedRoot: "/tmp",
  };
  return {
    createApp: jest.fn(() => mockApp),
    __mockApp: mockApp,
  };
});

// ── Child-process helper ──────────────────────────────────────────────────────

function spawnIndex(env, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [INDEX_PATH],
      { env: { ...process.env, ...env }, timeout: timeoutMs },
      (error, stdout, stderr) => {
        resolve({ error, stdout, stderr, code: error ? error.code : 0 });
      },
    );
    if (env._KILL_AFTER_MS) {
      setTimeout(() => child.kill("SIGTERM"), parseInt(env._KILL_AFTER_MS, 10));
    }
  });
}

// ── Direct-require tests (for coverage) ──────────────────────────────────────

describe("src/index.js — direct require (coverage)", () => {
  let originalEnv;
  let exitMock;
  let appModule;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    // Clear index.js from cache so each test re-executes the module
    delete require.cache[require.resolve("../src/index")];
    appModule = require("../src/app");
    // Clear mock call history
    appModule.createApp.mockClear();
    appModule.__mockApp.listen.mockClear();
    // Ensure createApp always returns the mock app
    appModule.createApp.mockReturnValue(appModule.__mockApp);

    exitMock = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    // Restore env vars: delete keys added by tests, restore original values
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    jest.restoreAllMocks();
    delete require.cache[require.resolve("../src/index")];
  });

  it("calls process.exit(1) when token is missing and ALLOW_ANONYMOUS is not set", () => {
    process.env.WORKSPACE_SERVICE_TOKEN = "";
    process.env.AUTH_TOKEN = "";
    process.env.WORKSPACE_SERVICE_ALLOW_ANONYMOUS = "";

    expect(() => require("../src/index")).toThrow("process.exit called");
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it("starts the server when WORKSPACE_SERVICE_TOKEN is set", () => {
    process.env.WORKSPACE_SERVICE_TOKEN = "test-token";
    process.env.WORKSPACE_ROOT = "/tmp";
    process.env.WORKSPACE_SUBDIR = "";
    process.env.PORT = "0";

    // Initialize mock to ensure it's set up correctly
    appModule.createApp({
      workspaceRoot: "/tmp",
      workspaceSubdir: "",
      token: "test-token",
      symlinkRemapPrefixes: [],
    });
    appModule.createApp.mockClear();
    appModule.__mockApp.listen.mockClear();

    delete require.cache[require.resolve("../src/index")];
    expect(() => require("../src/index")).not.toThrow();
    expect(appModule.createApp).toHaveBeenCalled();
    expect(appModule.__mockApp.listen).toHaveBeenCalled();
  });

  it("starts the server when WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true", () => {
    process.env.WORKSPACE_SERVICE_TOKEN = "";
    process.env.AUTH_TOKEN = "";
    process.env.WORKSPACE_SERVICE_ALLOW_ANONYMOUS = "true";
    process.env.WORKSPACE_ROOT = "/tmp";
    process.env.WORKSPACE_SUBDIR = "";
    process.env.PORT = "0";

    // Initialize mock to ensure it's set up correctly
    appModule.createApp({
      workspaceRoot: "/tmp",
      workspaceSubdir: "",
      token: undefined,
      symlinkRemapPrefixes: [],
    });
    appModule.createApp.mockClear();
    appModule.__mockApp.listen.mockClear();

    delete require.cache[require.resolve("../src/index")];
    expect(() => require("../src/index")).not.toThrow();
    expect(appModule.createApp).toHaveBeenCalled();
    expect(appModule.__mockApp.listen).toHaveBeenCalled();
  });

  it("accepts legacy AUTH_TOKEN as a fallback", () => {
    process.env.WORKSPACE_SERVICE_TOKEN = "";
    process.env.AUTH_TOKEN = "legacy-token";
    process.env.WORKSPACE_SERVICE_ALLOW_ANONYMOUS = "";
    process.env.WORKSPACE_ROOT = "/tmp";
    process.env.WORKSPACE_SUBDIR = "";
    process.env.PORT = "0";

    // Initialize mock to ensure it's set up correctly
    appModule.createApp({
      workspaceRoot: "/tmp",
      workspaceSubdir: "",
      token: "legacy-token",
      symlinkRemapPrefixes: [],
    });
    appModule.createApp.mockClear();
    appModule.__mockApp.listen.mockClear();

    delete require.cache[require.resolve("../src/index")];
    expect(() => require("../src/index")).not.toThrow();
    expect(appModule.createApp).toHaveBeenCalled();
    expect(appModule.__mockApp.listen).toHaveBeenCalled();
  });

  it("logs deprecation warning when WORKSPACE_PATH is used without WORKSPACE_ROOT", () => {
    process.env.WORKSPACE_SERVICE_TOKEN = "test-token";
    process.env.WORKSPACE_PATH = "/tmp";
    process.env.WORKSPACE_ROOT = "";
    process.env.WORKSPACE_SUBDIR = "";
    process.env.PORT = "0";

    const warnSpy = jest.spyOn(console, "warn");
    delete require.cache[require.resolve("../src/index")];
    expect(() => require("../src/index")).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/deprecated WORKSPACE_PATH/),
    );
    warnSpy.mockRestore();
  });

  it("logs deprecation warning when AUTH_TOKEN is used without WORKSPACE_SERVICE_TOKEN", () => {
    process.env.AUTH_TOKEN = "legacy-token";
    process.env.WORKSPACE_SERVICE_TOKEN = "";
    process.env.WORKSPACE_SERVICE_ALLOW_ANONYMOUS = "";
    process.env.WORKSPACE_ROOT = "/tmp";
    process.env.WORKSPACE_SUBDIR = "";
    process.env.PORT = "0";

    const warnSpy = jest.spyOn(console, "warn");
    delete require.cache[require.resolve("../src/index")];
    expect(() => require("../src/index")).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/deprecated AUTH_TOKEN/));
    warnSpy.mockRestore();
  });

  it("logs warning when WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true", () => {
    process.env.WORKSPACE_SERVICE_TOKEN = "";
    process.env.AUTH_TOKEN = "";
    process.env.WORKSPACE_SERVICE_ALLOW_ANONYMOUS = "true";
    process.env.WORKSPACE_ROOT = "/tmp";
    process.env.WORKSPACE_SUBDIR = "";
    process.env.PORT = "0";

    const warnSpy = jest.spyOn(console, "warn");
    delete require.cache[require.resolve("../src/index")];
    expect(() => require("../src/index")).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true/),
    );
    warnSpy.mockRestore();
  });

  it("logs startup information on listen", () => {
    process.env.WORKSPACE_SERVICE_TOKEN = "test-token";
    process.env.WORKSPACE_ROOT = "/tmp";
    process.env.WORKSPACE_SUBDIR = "";
    process.env.PORT = "0";

    const logSpy = jest.spyOn(console, "log");
    delete require.cache[require.resolve("../src/index")];
    expect(() => require("../src/index")).not.toThrow();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/MosBot Workspace Service running on port/),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Workspace root:/));
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Exposed root:/));
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Health check:/));
    logSpy.mockRestore();
  });

  it("shows 'Auth: enabled' when token is set", () => {
    process.env.WORKSPACE_SERVICE_TOKEN = "test-token";
    process.env.WORKSPACE_ROOT = "/tmp";
    process.env.WORKSPACE_SUBDIR = "";
    process.env.PORT = "0";

    const logSpy = jest.spyOn(console, "log");
    delete require.cache[require.resolve("../src/index")];
    expect(() => require("../src/index")).not.toThrow();
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Auth: enabled/));
    logSpy.mockRestore();
  });

  it("shows 'Auth: disabled' when ALLOW_ANONYMOUS is set", () => {
    process.env.WORKSPACE_SERVICE_ALLOW_ANONYMOUS = "true";
    process.env.WORKSPACE_SERVICE_TOKEN = "";
    process.env.AUTH_TOKEN = "";
    process.env.WORKSPACE_ROOT = "/tmp";
    process.env.WORKSPACE_SUBDIR = "";
    process.env.PORT = "0";

    const logSpy = jest.spyOn(console, "log");
    delete require.cache[require.resolve("../src/index")];
    expect(() => require("../src/index")).not.toThrow();
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Auth: disabled/));
    logSpy.mockRestore();
  });
});

// ── Child-process tests (for process.exit verification) ──────────────────────

describe("src/index.js — process entrypoint (child process)", () => {
  it("exits with code 1 when WORKSPACE_SERVICE_TOKEN is not set", async () => {
    const result = await spawnIndex({
      WORKSPACE_SERVICE_TOKEN: "",
      AUTH_TOKEN: "",
      WORKSPACE_SERVICE_ALLOW_ANONYMOUS: "",
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/WORKSPACE_SERVICE_TOKEN is required/);
  });

  it("starts successfully when WORKSPACE_SERVICE_TOKEN is set", async () => {
    const result = await spawnIndex({
      WORKSPACE_SERVICE_TOKEN: "test-token",
      PORT: "0",
      WORKSPACE_ROOT: "/tmp",
      WORKSPACE_SUBDIR: "",
      _KILL_AFTER_MS: "500",
    });
    expect(result.stderr).not.toMatch(/WORKSPACE_SERVICE_TOKEN is required/);
  });
});
