import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted so mock fns survive vi.resetModules()
const { mockCapture, mockShutdown, mockCaptureException } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockShutdown: vi.fn(),
  mockCaptureException: vi.fn(),
}));

vi.mock("posthog-node", () => {
  return {
    PostHog: class MockPostHog {
      capture = mockCapture;
      shutdown = mockShutdown;
      captureException = mockCaptureException;
    },
  };
});

describe("telemetry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    mockCapture.mockReset();
    mockShutdown.mockReset();
    mockCaptureException.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("initTelemetry", () => {
    it("skips initialization when POSTHOG_API_KEY is not set", async () => {
      delete process.env.POSTHOG_API_KEY;
      const { initTelemetry, trackToolInvocation } = await import("./telemetry");

      initTelemetry();
      trackToolInvocation("check_availability", true, 100);

      expect(mockCapture).not.toHaveBeenCalled();
    });

    it("initializes when POSTHOG_API_KEY is set", async () => {
      process.env.POSTHOG_API_KEY = "phc_test_key";
      const { initTelemetry, trackToolInvocation } = await import("./telemetry");

      initTelemetry();
      trackToolInvocation("check_availability", true, 150);

      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: "mcp-server",
        event: "mcp.tool_invoked",
        properties: {
          tool_name: "check_availability",
          success: true,
          duration_ms: 150,
        },
      });
    });
  });

  describe("trackToolInvocation", () => {
    it("includes error_type on failure", async () => {
      process.env.POSTHOG_API_KEY = "phc_test_key";
      const { initTelemetry, trackToolInvocation } = await import("./telemetry");

      initTelemetry();
      trackToolInvocation("create_booking", false, 200, "ValidationError");

      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: "mcp-server",
        event: "mcp.tool_invoked",
        properties: {
          tool_name: "create_booking",
          success: false,
          duration_ms: 200,
          error_type: "ValidationError",
        },
      });
    });

    it("is a no-op when client is null", async () => {
      delete process.env.POSTHOG_API_KEY;
      const { trackToolInvocation } = await import("./telemetry");

      trackToolInvocation("check_availability", true, 100);

      expect(mockCapture).not.toHaveBeenCalled();
    });
  });

  describe("trackServerStarted", () => {
    it("captures server_started event", async () => {
      process.env.POSTHOG_API_KEY = "phc_test_key";
      const { initTelemetry, trackServerStarted } = await import("./telemetry");

      initTelemetry();
      trackServerStarted();

      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: "mcp-server",
        event: "mcp.server_started",
      });
    });
  });

  describe("captureToolException", () => {
    it("calls client.captureException with tool_name, error_type, and source", async () => {
      process.env.POSTHOG_API_KEY = "phc_test_key";
      const { initTelemetry, captureToolException } = await import("./telemetry");

      initTelemetry();
      const error = new Error("API timeout");
      captureToolException(error, "create_booking", "TimeoutError");

      expect(mockCaptureException).toHaveBeenCalledWith(error, "mcp-server", {
        tool_name: "create_booking",
        error_type: "TimeoutError",
        source: "mcp",
      });
    });

    it("is a no-op when client is null", async () => {
      delete process.env.POSTHOG_API_KEY;
      const { captureToolException } = await import("./telemetry");

      captureToolException(new Error("test"), "check_availability", "UnknownError");

      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it("does not throw if client.captureException throws", async () => {
      process.env.POSTHOG_API_KEY = "phc_test_key";
      mockCaptureException.mockImplementation(() => {
        throw new Error("PostHog SDK failure");
      });

      const { initTelemetry, captureToolException } = await import("./telemetry");

      initTelemetry();
      expect(() =>
        captureToolException(new Error("test"), "list_bookings", "ApiError"),
      ).not.toThrow();
    });
  });

  describe("shutdownTelemetry", () => {
    it("calls shutdown on the client", async () => {
      process.env.POSTHOG_API_KEY = "phc_test_key";
      const { initTelemetry, shutdownTelemetry } = await import("./telemetry");

      initTelemetry();
      await shutdownTelemetry();

      expect(mockShutdown).toHaveBeenCalled();
    });
  });
});
