import { describe, it, expect, vi } from "vitest";
import { checkWaitlist } from "./check-waitlist";
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
    createWaitlistEntry: vi.fn(),
    listWaitlistEntries: vi.fn(),
    getWaitlistEntry: vi.fn(),
    ...overrides,
  } as unknown as AstrocalApiClient;
}

const mockConfig: AstrocalConfig = {
  apiUrl: "https://api.astrocal.dev",
  apiKey: "test-key",
  defaultEventTypeId: undefined,
};

const mockEntry = {
  id: "wl_abc123",
  event_type_id: "et_123",
  status: "waiting",
  position: 1,
  invitee_name: "Alice Smith",
  invitee_email: "alice@example.com",
  start_time: "2026-03-15T14:00:00Z",
  expires_at: "2026-03-22T14:00:00Z",
  cancel_token: "tok_abc",
};

describe("checkWaitlist", () => {
  it("returns a single entry when entry_id is provided", async () => {
    const client = createMockClient({
      getWaitlistEntry: vi.fn().mockResolvedValue(mockEntry),
    });

    const result = await checkWaitlist({ entry_id: "wl_abc123" }, client, mockConfig);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.id).toBe("wl_abc123");
    expect(result.message).toContain("wl_abc123");
  });

  it("lists entries for an event type", async () => {
    const client = createMockClient({
      listWaitlistEntries: vi.fn().mockResolvedValue({
        data: [mockEntry, { ...mockEntry, id: "wl_def456", position: 2 }],
        has_more: false,
      }),
    });

    const result = await checkWaitlist({ event_type_id: "et_123" }, client, mockConfig);

    expect(result.entries).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.message).toContain("Found 2 waitlist entries");
  });

  it("uses default event type ID from config", async () => {
    const mockList = vi.fn().mockResolvedValue({ data: [], has_more: false });
    const client = createMockClient({ listWaitlistEntries: mockList });

    await checkWaitlist({}, client, { ...mockConfig, defaultEventTypeId: "et_default" });

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ event_type_id: "et_default" }));
  });

  it("throws when no event_type_id and no default and no entry_id", async () => {
    const client = createMockClient();

    await expect(checkWaitlist({}, client, mockConfig)).rejects.toThrow(
      "event_type_id is required",
    );
  });

  it("returns empty message when no entries found", async () => {
    const client = createMockClient({
      listWaitlistEntries: vi.fn().mockResolvedValue({ data: [], has_more: false }),
    });

    const result = await checkWaitlist({ event_type_id: "et_123" }, client, mockConfig);

    expect(result.entries).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.message).toContain("No waitlist entries found");
  });

  it("includes status in empty message when filtered", async () => {
    const client = createMockClient({
      listWaitlistEntries: vi.fn().mockResolvedValue({ data: [], has_more: false }),
    });

    const result = await checkWaitlist(
      { event_type_id: "et_123", status: "promoted" },
      client,
      mockConfig,
    );

    expect(result.message).toContain('"promoted"');
  });

  it("passes status filter and limit to API client", async () => {
    const mockList = vi.fn().mockResolvedValue({ data: [], has_more: false });
    const client = createMockClient({ listWaitlistEntries: mockList });

    await checkWaitlist(
      { event_type_id: "et_123", status: "waiting", limit: 5 },
      client,
      mockConfig,
    );

    expect(mockList).toHaveBeenCalledWith({
      event_type_id: "et_123",
      status: "waiting",
      limit: 5,
    });
  });

  it("indicates when more entries are available", async () => {
    const client = createMockClient({
      listWaitlistEntries: vi.fn().mockResolvedValue({
        data: [mockEntry],
        has_more: true,
      }),
    });

    const result = await checkWaitlist({ event_type_id: "et_123" }, client, mockConfig);

    expect(result.has_more).toBe(true);
    expect(result.message).toContain("more entries available");
  });

  it("maps API 404 error to human-readable message", async () => {
    const client = createMockClient({
      getWaitlistEntry: vi.fn().mockRejectedValue(
        new ApiError(404, {
          error: { code: "not_found", message: "Waitlist entry not found" },
        }),
      ),
    });

    await expect(checkWaitlist({ entry_id: "wl_bad" }, client, mockConfig)).rejects.toThrow(
      "not found",
    );
  });
});
