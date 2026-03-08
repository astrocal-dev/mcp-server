import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ASTROCAL_API_KEY;
    delete process.env.ASTROCAL_API_URL;
    delete process.env.ASTROCAL_DEFAULT_EVENT_TYPE_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when ASTROCAL_API_KEY is missing", () => {
    expect(() => loadConfig()).toThrow("ASTROCAL_API_KEY environment variable is required");
  });

  it("loads config with required API key", () => {
    process.env.ASTROCAL_API_KEY = "ac_test_123";

    const config = loadConfig();

    expect(config.apiKey).toBe("ac_test_123");
    expect(config.apiUrl).toBe("https://api.astrocal.dev");
    expect(config.defaultEventTypeId).toBeUndefined();
  });

  it("uses custom API URL when provided", () => {
    process.env.ASTROCAL_API_KEY = "ac_test_123";
    process.env.ASTROCAL_API_URL = "http://localhost:3000";

    const config = loadConfig();

    expect(config.apiUrl).toBe("http://localhost:3000");
  });

  it("loads optional default event type ID", () => {
    process.env.ASTROCAL_API_KEY = "ac_test_123";
    process.env.ASTROCAL_DEFAULT_EVENT_TYPE_ID = "evt_abc123";

    const config = loadConfig();

    expect(config.defaultEventTypeId).toBe("evt_abc123");
  });

  it("treats empty ASTROCAL_DEFAULT_EVENT_TYPE_ID as undefined", () => {
    process.env.ASTROCAL_API_KEY = "ac_test_123";
    process.env.ASTROCAL_DEFAULT_EVENT_TYPE_ID = "";

    const config = loadConfig();

    expect(config.defaultEventTypeId).toBeUndefined();
  });
});
