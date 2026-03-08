import { describe, it, expect, vi } from "vitest";
import { joinWaitlist } from "./join-waitlist";
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

const mockWaitlistEntry = {
  id: "wl_abc123",
  event_type_id: "et_123",
  status: "waiting",
  position: 3,
  invitee_name: "Alice Smith",
  invitee_email: "alice@example.com",
  start_time: "2026-03-15T14:00:00Z",
  expires_at: "2026-03-22T14:00:00Z",
  cancel_token: "tok_abc",
};

describe("joinWaitlist", () => {
  it("creates a waitlist entry and returns confirmation message", async () => {
    const client = createMockClient({
      createWaitlistEntry: vi.fn().mockResolvedValue(mockWaitlistEntry),
    });

    const result = await joinWaitlist(
      {
        event_type_id: "et_123",
        invitee_name: "Alice Smith",
        invitee_email: "alice@example.com",
        start_time: "2026-03-15T14:00:00Z",
      },
      client,
      mockConfig,
    );

    expect(result.waitlist_entry).toEqual({
      id: "wl_abc123",
      position: 3,
      status: "waiting",
      expires_at: "2026-03-22T14:00:00Z",
    });
    expect(result.message).toContain("position #3");
    expect(result.message).toContain("Alice Smith");
    expect(result.message).toContain("automatically booked");
  });

  it("uses default event type ID from config", async () => {
    const mockCreate = vi.fn().mockResolvedValue(mockWaitlistEntry);
    const client = createMockClient({ createWaitlistEntry: mockCreate });

    await joinWaitlist(
      { invitee_name: "Alice Smith", invitee_email: "alice@example.com" },
      client,
      { ...mockConfig, defaultEventTypeId: "et_default" },
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ event_type_id: "et_default" }),
    );
  });

  it("throws when no event_type_id and no default configured", async () => {
    const client = createMockClient();

    await expect(
      joinWaitlist(
        { invitee_name: "Alice Smith", invitee_email: "alice@example.com" },
        client,
        mockConfig,
      ),
    ).rejects.toThrow("event_type_id is required");
  });

  it("truncates notes at 1000 characters", async () => {
    const mockCreate = vi.fn().mockResolvedValue(mockWaitlistEntry);
    const client = createMockClient({ createWaitlistEntry: mockCreate });

    await joinWaitlist(
      {
        event_type_id: "et_123",
        invitee_name: "Alice Smith",
        invitee_email: "alice@example.com",
        notes: "x".repeat(2000),
      },
      client,
      mockConfig,
    );

    const calledWith = mockCreate.mock.calls[0]![0] as { notes: string };
    expect(calledWith.notes).toHaveLength(1000);
  });

  it("handles any-slot entry (no start_time)", async () => {
    const anySlotEntry = { ...mockWaitlistEntry, start_time: null };
    const client = createMockClient({
      createWaitlistEntry: vi.fn().mockResolvedValue(anySlotEntry),
    });

    const result = await joinWaitlist(
      {
        event_type_id: "et_123",
        invitee_name: "Alice Smith",
        invitee_email: "alice@example.com",
      },
      client,
      mockConfig,
    );

    expect(result.message).toContain("any available slot");
  });

  it("maps API 400 error to human-readable message", async () => {
    const client = createMockClient({
      createWaitlistEntry: vi.fn().mockRejectedValue(
        new ApiError(400, {
          error: { code: "waitlist_disabled", message: "Waitlist is not enabled" },
        }),
      ),
    });

    await expect(
      joinWaitlist(
        {
          event_type_id: "et_123",
          invitee_name: "Alice Smith",
          invitee_email: "alice@example.com",
        },
        client,
        mockConfig,
      ),
    ).rejects.toThrow();
  });

  it("maps API 409 conflict error", async () => {
    const client = createMockClient({
      createWaitlistEntry: vi.fn().mockRejectedValue(
        new ApiError(409, {
          error: { code: "already_on_waitlist", message: "Already on the waitlist" },
        }),
      ),
    });

    await expect(
      joinWaitlist(
        {
          event_type_id: "et_123",
          invitee_name: "Alice Smith",
          invitee_email: "alice@example.com",
        },
        client,
        mockConfig,
      ),
    ).rejects.toThrow("no longer available");
  });

  it("throws on missing invitee_name", async () => {
    const client = createMockClient();

    await expect(
      joinWaitlist(
        { event_type_id: "et_123", invitee_email: "alice@example.com" },
        client,
        mockConfig,
      ),
    ).rejects.toThrow();
  });

  it("throws on invalid email format", async () => {
    const client = createMockClient();

    await expect(
      joinWaitlist(
        { event_type_id: "et_123", invitee_name: "Alice", invitee_email: "not-an-email" },
        client,
        mockConfig,
      ),
    ).rejects.toThrow();
  });
});
