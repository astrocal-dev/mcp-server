import { describe, it, expect, vi } from "vitest";
import { checkAvailability } from "./check-availability";
import { ApiError } from "../lib/api-client";
import type { AstrocalApiClient } from "../lib/api-client";
import type { AstrocalConfig } from "../lib/config";

function createMockClient(overrides?: Partial<AstrocalApiClient>) {
  return {
    checkAvailability: vi.fn(),
    createBooking: vi.fn(),
    getEventType: vi.fn(),
    cancelBooking: vi.fn(),
    rescheduleBooking: vi.fn(),
    listBookings: vi.fn(),
    listEventTypes: vi.fn(),
    ...overrides,
  } as unknown as AstrocalApiClient;
}

const baseConfig: AstrocalConfig = {
  apiUrl: "https://api.astrocal.dev",
  apiKey: "ac_test_key",
};

describe("checkAvailability", () => {
  it("returns available slots with event type metadata", async () => {
    const client = createMockClient({
      checkAvailability: vi.fn().mockResolvedValue({
        event_type_id: "evt_123",
        timezone: "UTC",
        start: "2026-03-15",
        end: "2026-03-22",
        slots: [
          { start_time: "2026-03-15T10:00:00Z", end_time: "2026-03-15T10:30:00Z" },
          { start_time: "2026-03-15T14:00:00Z", end_time: "2026-03-15T14:30:00Z" },
        ],
      }),
      getEventType: vi.fn().mockResolvedValue({
        id: "evt_123",
        title: "30 Minute Meeting",
        duration_minutes: 30,
      }),
    });

    const result = await checkAvailability(
      {
        event_type_id: "evt_123",
        start_date: "2026-03-15",
        end_date: "2026-03-22",
        timezone: "America/New_York",
      },
      client,
      baseConfig,
    );

    expect(result.available_slots).toHaveLength(2);
    expect(result.available_slots[0]).toEqual({
      start: "2026-03-15T10:00:00Z",
      end: "2026-03-15T10:30:00Z",
      duration_minutes: 30,
    });
    expect(result.event_type).toEqual({
      title: "30 Minute Meeting",
      duration_minutes: 30,
    });
  });

  it("uses default event type ID from config when not provided in input", async () => {
    const mockCheckAvailability = vi.fn().mockResolvedValue({
      event_type_id: "evt_default",
      timezone: "UTC",
      start: "2026-03-15",
      end: "2026-03-22",
      slots: [],
    });
    const mockGetEventType = vi.fn().mockResolvedValue({
      id: "evt_default",
      title: "Default Meeting",
      duration_minutes: 15,
    });

    const client = createMockClient({
      checkAvailability: mockCheckAvailability,
      getEventType: mockGetEventType,
    });

    const configWithDefault: AstrocalConfig = {
      ...baseConfig,
      defaultEventTypeId: "evt_default",
    };

    await checkAvailability(
      { start_date: "2026-03-15", end_date: "2026-03-22" },
      client,
      configWithDefault,
    );

    expect(mockCheckAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ event_type_id: "evt_default" }),
    );
  });

  it("throws when event_type_id is missing and no default configured", async () => {
    const client = createMockClient();

    await expect(
      checkAvailability({ start_date: "2026-03-15", end_date: "2026-03-22" }, client, baseConfig),
    ).rejects.toThrow("event_type_id is required");
  });

  it("defaults timezone to UTC when not provided", async () => {
    const mockCheckAvailability = vi.fn().mockResolvedValue({
      event_type_id: "evt_123",
      timezone: "UTC",
      start: "2026-03-15",
      end: "2026-03-22",
      slots: [],
    });
    const client = createMockClient({
      checkAvailability: mockCheckAvailability,
      getEventType: vi.fn().mockResolvedValue({
        id: "evt_123",
        title: "Meeting",
        duration_minutes: 30,
      }),
    });

    await checkAvailability(
      { event_type_id: "evt_123", start_date: "2026-03-15", end_date: "2026-03-22" },
      client,
      baseConfig,
    );

    expect(mockCheckAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "UTC" }),
    );
  });

  it("throws on invalid start_date format", async () => {
    const client = createMockClient();

    await expect(
      checkAvailability(
        { event_type_id: "evt_123", start_date: "not-a-date", end_date: "2026-03-22" },
        client,
        baseConfig,
      ),
    ).rejects.toThrow();
  });

  it("throws on invalid end_date format", async () => {
    const client = createMockClient();

    await expect(
      checkAvailability(
        { event_type_id: "evt_123", start_date: "2026-03-15", end_date: "March 22" },
        client,
        baseConfig,
      ),
    ).rejects.toThrow();
  });

  it("maps API errors to human-readable messages", async () => {
    const client = createMockClient({
      checkAvailability: vi.fn().mockRejectedValue(
        new ApiError(404, {
          error: { code: "not_found", message: "Event type not found" },
        }),
      ),
      getEventType: vi.fn().mockRejectedValue(
        new ApiError(404, {
          error: { code: "not_found", message: "Event type not found" },
        }),
      ),
    });

    await expect(
      checkAvailability(
        { event_type_id: "evt_bad", start_date: "2026-03-15", end_date: "2026-03-22" },
        client,
        baseConfig,
      ),
    ).rejects.toThrow("Event type not found");
  });

  it("computes correct duration_minutes from slot times", async () => {
    const client = createMockClient({
      checkAvailability: vi.fn().mockResolvedValue({
        event_type_id: "evt_123",
        timezone: "UTC",
        start: "2026-03-15",
        end: "2026-03-22",
        slots: [{ start_time: "2026-03-15T09:00:00Z", end_time: "2026-03-15T10:00:00Z" }],
      }),
      getEventType: vi.fn().mockResolvedValue({
        id: "evt_123",
        title: "60 Minute Meeting",
        duration_minutes: 60,
      }),
    });

    const result = await checkAvailability(
      { event_type_id: "evt_123", start_date: "2026-03-15", end_date: "2026-03-22" },
      client,
      baseConfig,
    );

    expect(result.available_slots[0]!.duration_minutes).toBe(60);
  });
});
