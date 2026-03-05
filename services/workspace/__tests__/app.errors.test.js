"use strict";

const { buildPathNotAllowedErrorPayload } = require("../src/app");

describe("PATH_NOT_ALLOWED payload helper", () => {
  it("uses provided message and normalizedPath", () => {
    const payload = buildPathNotAllowedErrorPayload({
      message: "Custom deny message",
      normalizedPath: "/tmp/secret.txt",
    });

    expect(payload).toEqual({
      error: "Custom deny message",
      code: "PATH_NOT_ALLOWED",
      path: "/tmp/secret.txt",
    });
  });

  it("uses fallback values when message/path are missing", () => {
    const payload = buildPathNotAllowedErrorPayload({
      message: "",
    });

    expect(payload).toEqual({
      error: "Path not allowed",
      code: "PATH_NOT_ALLOWED",
      path: null,
    });
  });
});
