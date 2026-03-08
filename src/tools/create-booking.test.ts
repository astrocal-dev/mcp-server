import { describe, it, expect, vi } from "vitest";
import { createBooking } from "./create-booking";
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

const validInput = {
  event_type_id: "evt_123",
  start_time: "2026-03-15T14:00:00Z",
  invitee_name: "Jane Doe",
  invitee_email: "jane@example.com",
  invitee_timezone: "America/New_York",
};

const mockBookingResponse = {
  id: "bkg_789",
  start_time: "2026-03-15T14:00:00Z",
  end_time: "2026-03-15T14:30:00Z",
  status: "confirmed",
  invitee_name: "Jane Doe",
  invitee_email: "jane@example.com",
};

describe("createBooking", () => {
  it("creates a booking and returns confirmation with human-readable message", async () => {
    const client = createMockClient({
      createBooking: vi.fn().mockResolvedValue(mockBookingResponse),
    });

    const result = await createBooking(validInput, client, baseConfig);

    expect(result.booking).toEqual({
      id: "bkg_789",
      start_time: "2026-03-15T14:00:00Z",
      end_time: "2026-03-15T14:30:00Z",
      status: "confirmed",
      invitee_name: "Jane Doe",
      invitee_email: "jane@example.com",
    });
    expect(result.message).toContain("Meeting confirmed");
    expect(result.message).toContain("Jane Doe");
    expect(result.message).toContain("jane@example.com");
    expect(result.message).toContain("calendar invitation has been sent");
  });

  it("uses default event type ID from config when not provided", async () => {
    const mockCreate = vi.fn().mockResolvedValue(mockBookingResponse);
    const client = createMockClient({ createBooking: mockCreate });

    const configWithDefault: AstrocalConfig = {
      ...baseConfig,
      defaultEventTypeId: "evt_default",
    };

    const inputWithoutEventType = {
      start_time: "2026-03-15T14:00:00Z",
      invitee_name: "Jane Doe",
      invitee_email: "jane@example.com",
    };

    await createBooking(inputWithoutEventType, client, configWithDefault);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ event_type_id: "evt_default" }),
    );
  });

  it("throws when event_type_id is missing and no default configured", async () => {
    const client = createMockClient();

    await expect(
      createBooking(
        {
          start_time: "2026-03-15T14:00:00Z",
          invitee_name: "Jane Doe",
          invitee_email: "jane@example.com",
        },
        client,
        baseConfig,
      ),
    ).rejects.toThrow("event_type_id is required");
  });

  it("defaults invitee_timezone to UTC when not provided", async () => {
    const mockCreate = vi.fn().mockResolvedValue(mockBookingResponse);
    const client = createMockClient({ createBooking: mockCreate });

    await createBooking(
      {
        event_type_id: "evt_123",
        start_time: "2026-03-15T14:00:00Z",
        invitee_name: "Jane Doe",
        invitee_email: "jane@example.com",
      },
      client,
      baseConfig,
    );

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ invitee_timezone: "UTC" }));
  });

  it("truncates notes at 1000 characters instead of rejecting", async () => {
    const mockCreate = vi.fn().mockResolvedValue(mockBookingResponse);
    const client = createMockClient({ createBooking: mockCreate });

    const longNotes = "x".repeat(2000);
    await createBooking({ ...validInput, notes: longNotes }, client, baseConfig);

    const calledWith = mockCreate.mock.calls[0]![0] as { notes: string };
    expect(calledWith.notes).toHaveLength(1000);
  });

  it("passes notes through when under 1000 characters", async () => {
    const mockCreate = vi.fn().mockResolvedValue(mockBookingResponse);
    const client = createMockClient({ createBooking: mockCreate });

    await createBooking({ ...validInput, notes: "Some meeting notes" }, client, baseConfig);

    const calledWith = mockCreate.mock.calls[0]![0] as { notes: string };
    expect(calledWith.notes).toBe("Some meeting notes");
  });

  it("throws on invalid email format", async () => {
    const client = createMockClient();

    await expect(
      createBooking({ ...validInput, invitee_email: "not-an-email" }, client, baseConfig),
    ).rejects.toThrow();
  });

  it("throws on empty invitee_name", async () => {
    const client = createMockClient();

    await expect(
      createBooking({ ...validInput, invitee_name: "" }, client, baseConfig),
    ).rejects.toThrow();
  });

  it("throws on invalid start_time format", async () => {
    const client = createMockClient();

    await expect(
      createBooking({ ...validInput, start_time: "not-a-datetime" }, client, baseConfig),
    ).rejects.toThrow();
  });

  it("maps API 409 error to human-readable message", async () => {
    const client = createMockClient({
      createBooking: vi.fn().mockRejectedValue(
        new ApiError(409, {
          error: { code: "conflict", message: "Slot already booked" },
        }),
      ),
    });

    await expect(createBooking(validInput, client, baseConfig)).rejects.toThrow(
      "no longer available",
    );
  });

  it("maps API 401 error to unauthorized message", async () => {
    const client = createMockClient({
      createBooking: vi
        .fn()
        .mockRejectedValue(new ApiError(401, { error: { code: "unauthorized" } })),
    });

    await expect(createBooking(validInput, client, baseConfig)).rejects.toThrow("Invalid API key");
  });
});
