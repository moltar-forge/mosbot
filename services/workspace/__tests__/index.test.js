"use strict";

/**
 * Tests for src/index.js — the process entrypoint.
 */

const { execFile } = require("child_process");
const path = require("path");

const INDEX_PATH = path.join(__dirname, "..", "src", "index.js");

jest.mock("dotenv", () => ({
  config: jest.fn(),
}));

jest.mock("../src/app", () => {
  const listenFn = jest.fn((port, cb) => {
    if (cb) cb();
  });
  const mockApp = { listen: listenFn };
  return {
    createApp: jest.fn(() => mockApp),
    __mockApp: mockApp,
  };
});

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

describe("src/index.js — direct require (coverage)", () => {
  let originalEnv;
  let exitMock;
  let appModule;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    delete require.cache[require.resolve("../src/index")];

    appModule = require("../src/app");
    appModule.createApp.mockClear();
    appModule.__mockApp.listen.mockClear();
    appModule.createApp.mockReturnValue(appModule.__mockApp);

    exitMock = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    jest.restoreAllMocks();
    delete require.cache[require.resolve("../src/index")];
  });

  it("calls process.exit(1) when token is missing and ALLOW_ANONYMOUS is not set", () => {
    process.env.WORKSPACE_SERVICE_TOKEN = "";
    process.env.WORKSPACE_SERVICE_ALLOW_ANONYMOUS = "";

    expect(() => require("../src/index")).toThrow("process.exit called");
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it("starts the server when WORKSPACE_SERVICE_TOKEN is set", () => {
    process.env.WORKSPACE_SERVICE_TOKEN = "test-token";
    process.env.CONFIG_ROOT = "/tmp/config";
    process.env.MAIN_WORKSPACE_DIR = "workspace";
    process.env.PORT = "0";

    delete require.cache[require.resolve("../src/index")];
    expect(() => require("../src/index")).not.toThrow();

    expect(appModule.createApp).toHaveBeenCalledWith(
      expect.objectContaining({
        configRoot: "/tmp/config",
        mainWorkspaceDir: "workspace",
        token: "test-token",
      }),
    );
    expect(appModule.__mockApp.listen).toHaveBeenCalled();
  });

  it("starts the server when WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true", () => {
    process.env.WORKSPACE_SERVICE_TOKEN = "";
    process.env.WORKSPACE_SERVICE_ALLOW_ANONYMOUS = "true";
    process.env.CONFIG_ROOT = "/tmp/config";
    process.env.MAIN_WORKSPACE_DIR = "workspace";
    process.env.PORT = "0";

    delete require.cache[require.resolve("../src/index")];
    expect(() => require("../src/index")).not.toThrow();

    expect(appModule.createApp).toHaveBeenCalledWith(
      expect.objectContaining({
        configRoot: "/tmp/config",
        mainWorkspaceDir: "workspace",
        token: "",
      }),
    );
  });

  it.each([
    { value: " ", label: "blank" },
    { value: ".", label: "dot" },
    { value: "..", label: "dotdot" },
    { value: "../workspace", label: "path" },
  ])("calls process.exit(1) when MAIN_WORKSPACE_DIR is invalid (%s)", ({ value }) => {
    process.env.WORKSPACE_SERVICE_TOKEN = "test-token";
    process.env.CONFIG_ROOT = "/tmp/config";
    process.env.MAIN_WORKSPACE_DIR = value;

    expect(() => require("../src/index")).toThrow("process.exit called");
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it("logs warning when WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true", () => {
    process.env.WORKSPACE_SERVICE_TOKEN = "";
    process.env.WORKSPACE_SERVICE_ALLOW_ANONYMOUS = "true";
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
    process.env.CONFIG_ROOT = "/tmp/config";
    process.env.MAIN_WORKSPACE_DIR = "workspace";
    process.env.PORT = "0";

    const logSpy = jest.spyOn(console, "log");
    delete require.cache[require.resolve("../src/index")];
    expect(() => require("../src/index")).not.toThrow();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/MosBot Workspace Service running on port/),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Config root:/));
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Main workspace dir:/));
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Main workspace FS root:/));
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Health check:/));

    logSpy.mockRestore();
  });
});

describe("src/index.js — process entrypoint (child process)", () => {
  it("exits with code 1 when WORKSPACE_SERVICE_TOKEN is not set", async () => {
    const result = await spawnIndex({
      WORKSPACE_SERVICE_TOKEN: "",
      WORKSPACE_SERVICE_ALLOW_ANONYMOUS: "",
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/WORKSPACE_SERVICE_TOKEN is required/);
  });

  it("starts successfully when WORKSPACE_SERVICE_TOKEN is set", async () => {
    const result = await spawnIndex({
      WORKSPACE_SERVICE_TOKEN: "test-token",
      PORT: "0",
      CONFIG_ROOT: "/tmp/config",
      MAIN_WORKSPACE_DIR: "workspace",
      _KILL_AFTER_MS: "500",
    });

    expect(result.stderr).not.toMatch(/WORKSPACE_SERVICE_TOKEN is required/);
  });
});
