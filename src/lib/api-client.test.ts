import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AstrocalApiClient, ApiError, TimeoutError, NetworkError } from "./api-client";

describe("AstrocalApiClient", () => {
  let client: AstrocalApiClient;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    client = new AstrocalApiClient("https://api.astrocal.dev", "ac_test_key");
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  describe("checkAvailability", () => {
    it("calls GET /v1/availability with correct params", async () => {
      const responseData = {
        event_type_id: "evt_123",
        timezone: "UTC",
        start: "2026-03-15",
        end: "2026-03-22",
        slots: [{ start_time: "2026-03-15T10:00:00Z", end_time: "2026-03-15T10:30:00Z" }],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(responseData));

      const result = await client.checkAvailability({
        event_type_id: "evt_123",
        start: "2026-03-15",
        end: "2026-03-22",
        timezone: "UTC",
      });

      expect(result).toEqual(responseData);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/v1/availability?");
      expect(url).toContain("event_type_id=evt_123");
      expect(url).toContain("start=2026-03-15");
      expect(url).toContain("end=2026-03-22");
      expect(url).toContain("timezone=UTC");
      expect(init.headers.Authorization).toBe("Bearer ac_test_key");
    });
  });

  describe("createBooking", () => {
    it("calls POST /v1/bookings with correct body", async () => {
      const bookingData = {
        id: "bkg_123",
        start_time: "2026-03-15T14:00:00Z",
        end_time: "2026-03-15T14:30:00Z",
        status: "confirmed",
        invitee_name: "Jane Doe",
        invitee_email: "jane@example.com",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(bookingData, 201));

      const result = await client.createBooking({
        event_type_id: "evt_123",
        start_time: "2026-03-15T14:00:00Z",
        invitee_name: "Jane Doe",
        invitee_email: "jane@example.com",
        invitee_timezone: "UTC",
      });

      expect(result).toEqual(bookingData);

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.astrocal.dev/v1/bookings");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({
        event_type_id: "evt_123",
        start_time: "2026-03-15T14:00:00Z",
        invitee_name: "Jane Doe",
        invitee_email: "jane@example.com",
        invitee_timezone: "UTC",
      });
    });
  });

  describe("getEventType", () => {
    it("calls GET /v1/event-types/:id", async () => {
      const eventType = { id: "evt_123", title: "30 Minute Meeting", duration_minutes: 30 };
      mockFetch.mockResolvedValueOnce(jsonResponse(eventType));

      const result = await client.getEventType("evt_123");

      expect(result).toEqual(eventType);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.astrocal.dev/v1/event-types/evt_123");
    });
  });

  describe("auth header", () => {
    it("sets Authorization: Bearer header on all requests", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      await client.getEventType("evt_123");

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers.Authorization).toBe("Bearer ac_test_key");
    });
  });

  describe("error handling", () => {
    it("throws ApiError on 4xx responses", async () => {
      const errorBody = { error: { code: "not_found", message: "Not found" } };
      mockFetch.mockResolvedValueOnce(jsonResponse(errorBody, 404));

      await expect(client.getEventType("evt_bad")).rejects.toThrow(ApiError);

      try {
        mockFetch.mockResolvedValueOnce(jsonResponse(errorBody, 404));
        await client.getEventType("evt_bad");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(404);
        expect((e as ApiError).body).toEqual(errorBody);
      }
    });

    it("throws ApiError on 401 without retrying", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: { code: "unauthorized" } }, 401));

      await expect(client.getEventType("evt_123")).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe("retry logic", () => {
    it("retries once on 500 response then succeeds", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ error: "server error" }, 500))
        .mockResolvedValueOnce(jsonResponse({ id: "evt_123" }));

      const result = await client.getEventType("evt_123");

      expect(result).toEqual({ id: "evt_123" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws ApiError after retry exhaustion on 500", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ error: "server error" }, 500))
        .mockResolvedValueOnce(jsonResponse({ error: "server error" }, 500));

      await expect(client.getEventType("evt_123")).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retries once on network error then succeeds", async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(jsonResponse({ id: "evt_123" }));

      const result = await client.getEventType("evt_123");

      expect(result).toEqual({ id: "evt_123" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws NetworkError after retry exhaustion on network error", async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockRejectedValueOnce(new TypeError("fetch failed"));

      await expect(client.getEventType("evt_123")).rejects.toThrow(NetworkError);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retries once on timeout then succeeds", async () => {
      mockFetch
        .mockImplementationOnce(() => {
          const error = new DOMException("The operation was aborted", "AbortError");
          return Promise.reject(error);
        })
        .mockResolvedValueOnce(jsonResponse({ id: "evt_123" }));

      const result = await client.getEventType("evt_123");

      expect(result).toEqual({ id: "evt_123" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws TimeoutError after retry exhaustion on timeout", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      mockFetch.mockRejectedValueOnce(abortError).mockRejectedValueOnce(abortError);

      await expect(client.getEventType("evt_123")).rejects.toThrow(TimeoutError);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("cancelBooking", () => {
    it("calls POST /v1/bookings/:id/cancel with correct body", async () => {
      const cancelData = {
        id: "bkg_123",
        status: "cancelled",
        cancelled_at: "2026-03-10T12:00:00Z",
        start_time: "2026-03-15T14:00:00Z",
        end_time: "2026-03-15T14:30:00Z",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(cancelData));

      const result = await client.cancelBooking("bkg_123", { reason: "No longer needed" });

      expect(result).toEqual(cancelData);

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.astrocal.dev/v1/bookings/bkg_123/cancel");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({ reason: "No longer needed" });
    });

    it("sends empty body when no params provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "bkg_123", status: "cancelled" }));

      await client.cancelBooking("bkg_123");

      const [, init] = mockFetch.mock.calls[0]!;
      expect(JSON.parse(init.body)).toEqual({});
    });
  });

  describe("rescheduleBooking", () => {
    it("calls POST /v1/bookings/:id/reschedule with correct body", async () => {
      const rescheduleData = {
        id: "bkg_123",
        start_time: "2026-03-20T15:00:00Z",
        end_time: "2026-03-20T15:30:00Z",
        status: "confirmed",
        invitee_name: "Jane Doe",
        invitee_email: "jane@example.com",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(rescheduleData));

      const result = await client.rescheduleBooking("bkg_123", {
        new_start_time: "2026-03-20T15:00:00Z",
        reason: "Time change",
      });

      expect(result).toEqual(rescheduleData);

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.astrocal.dev/v1/bookings/bkg_123/reschedule");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({
        new_start_time: "2026-03-20T15:00:00Z",
        reason: "Time change",
      });
    });
  });

  describe("listBookings", () => {
    it("calls GET /v1/bookings with query params", async () => {
      const listData = { data: [], has_more: false };
      mockFetch.mockResolvedValueOnce(jsonResponse(listData));

      const result = await client.listBookings({
        status: "confirmed",
        limit: 5,
        event_type_id: "evt_123",
      });

      expect(result).toEqual(listData);

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/v1/bookings?");
      expect(url).toContain("status=confirmed");
      expect(url).toContain("limit=5");
      expect(url).toContain("event_type_id=evt_123");
      expect(init.method).toBe("GET");
    });

    it("calls GET /v1/bookings without query params when none provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], has_more: false }));

      await client.listBookings();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.astrocal.dev/v1/bookings");
    });

    it("omits undefined params from query string", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], has_more: false }));

      await client.listBookings({ status: "confirmed" });

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain("status=confirmed");
      expect(url).not.toContain("limit=");
      expect(url).not.toContain("event_type_id=");
    });
  });

  describe("listEventTypes", () => {
    it("calls GET /v1/event-types with query params", async () => {
      const listData = { data: [], has_more: false };
      mockFetch.mockResolvedValueOnce(jsonResponse(listData));

      const result = await client.listEventTypes({ active: true, limit: 50 });

      expect(result).toEqual(listData);

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toContain("/v1/event-types?");
      expect(url).toContain("active=true");
      expect(url).toContain("limit=50");
      expect(init.method).toBe("GET");
    });

    it("calls GET /v1/event-types without query params when none provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], has_more: false }));

      await client.listEventTypes();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.astrocal.dev/v1/event-types");
    });
  });

  describe("URL construction", () => {
    it("strips trailing slash from base URL", async () => {
      const clientWithSlash = new AstrocalApiClient("https://api.astrocal.dev/", "ac_test_key");
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      await clientWithSlash.getEventType("evt_123");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.astrocal.dev/v1/event-types/evt_123");
    });
  });
});
