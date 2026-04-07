import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readConfig } from "./config.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("node:fs");
vi.mock("node:os", () => ({
  homedir: () => "/mock/home",
}));

describe("readConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns null when config file does not exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(readConfig()).toBeNull();
  });

  it("parses valid config with all fields", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ teamSlug: "kosli", apiBase: "https://api.eu1.honeycomb.io" })
    );

    const config = readConfig();
    expect(config).toEqual({
      teamSlug: "kosli",
      apiBase: "https://api.eu1.honeycomb.io",
    });
  });

  it("defaults apiBase when not provided", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ teamSlug: "kosli" })
    );

    const config = readConfig();
    expect(config).toEqual({
      teamSlug: "kosli",
      apiBase: "https://api.honeycomb.io",
    });
  });

  it("returns null when teamSlug is missing", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ apiBase: "https://api.honeycomb.io" })
    );

    expect(readConfig()).toBeNull();
  });

  it("returns null on invalid JSON", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("not json");

    expect(readConfig()).toBeNull();
  });

  it("reads from correct path", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ teamSlug: "test" })
    );

    readConfig();
    expect(fs.readFileSync).toHaveBeenCalledWith(
      "/mock/home/.config/kosli-honeycomb/config.json",
      "utf-8"
    );
  });
});
