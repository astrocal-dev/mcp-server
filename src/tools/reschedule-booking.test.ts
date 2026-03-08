import { describe, it, expect, vi } from "vitest";
import { rescheduleBooking } from "./reschedule-booking";
import { ApiError } from "../lib/api-client";
import type { AstrocalApiClient } from "../lib/api-client";

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

const mockRescheduleResponse = {
  id: "bkg_789",
  start_time: "2026-03-20T15:00:00Z",
  end_time: "2026-03-20T15:30:00Z",
  status: "confirmed",
  invitee_name: "Jane Doe",
  invitee_email: "jane@example.com",
};

const validInput = {
  booking_id: "bkg_789",
  new_start_time: "2026-03-20T15:00:00Z",
};

describe("rescheduleBooking", () => {
  it("reschedules a booking and returns confirmation with human-readable message", async () => {
    const client = createMockClient({
      rescheduleBooking: vi.fn().mockResolvedValue(mockRescheduleResponse),
    });

    const result = await rescheduleBooking(validInput, client);

    expect(result.booking).toEqual({
      id: "bkg_789",
      start_time: "2026-03-20T15:00:00Z",
      end_time: "2026-03-20T15:30:00Z",
      status: "confirmed",
      invitee_name: "Jane Doe",
      invitee_email: "jane@example.com",
    });
    expect(result.message).toContain("rescheduled");
    expect(result.message).toContain("Jane Doe");
    expect(result.message).toContain("jane@example.com");
    expect(result.message).toContain("notified");
  });

  it("passes reason to API client", async () => {
    const mockReschedule = vi.fn().mockResolvedValue(mockRescheduleResponse);
    const client = createMockClient({ rescheduleBooking: mockReschedule });

    await rescheduleBooking({ ...validInput, reason: "Time change requested" }, client);

    expect(mockReschedule).toHaveBeenCalledWith("bkg_789", {
      new_start_time: "2026-03-20T15:00:00Z",
      reason: "Time change requested",
    });
  });

  it("truncates reason at 500 characters", async () => {
    const mockReschedule = vi.fn().mockResolvedValue(mockRescheduleResponse);
    const client = createMockClient({ rescheduleBooking: mockReschedule });

    const longReason = "x".repeat(1000);
    await rescheduleBooking({ ...validInput, reason: longReason }, client);

    const calledWith = mockReschedule.mock.calls[0]![1] as { reason: string };
    expect(calledWith.reason).toHaveLength(500);
  });

  it("throws on missing booking_id", async () => {
    const client = createMockClient();

    await expect(
      rescheduleBooking({ new_start_time: "2026-03-20T15:00:00Z" }, client),
    ).rejects.toThrow();
  });

  it("throws on missing new_start_time", async () => {
    const client = createMockClient();

    await expect(rescheduleBooking({ booking_id: "bkg_789" }, client)).rejects.toThrow();
  });

  it("throws on invalid new_start_time format", async () => {
    const client = createMockClient();

    await expect(
      rescheduleBooking({ booking_id: "bkg_789", new_start_time: "not-a-datetime" }, client),
    ).rejects.toThrow();
  });

  it("maps API 409 error to slot unavailable message", async () => {
    const client = createMockClient({
      rescheduleBooking: vi.fn().mockRejectedValue(
        new ApiError(409, {
          error: { code: "conflict", message: "Slot already booked" },
        }),
      ),
    });

    await expect(rescheduleBooking(validInput, client)).rejects.toThrow("no longer available");
  });

  it("maps API 404 error to not found message", async () => {
    const client = createMockClient({
      rescheduleBooking: vi.fn().mockRejectedValue(
        new ApiError(404, {
          error: { code: "not_found", message: "Booking not found" },
        }),
      ),
    });

    await expect(rescheduleBooking(validInput, client)).rejects.toThrow("Booking not found");
  });

  it("maps API 401 error to unauthorized message", async () => {
    const client = createMockClient({
      rescheduleBooking: vi
        .fn()
        .mockRejectedValue(new ApiError(401, { error: { code: "unauthorized" } })),
    });

    await expect(rescheduleBooking(validInput, client)).rejects.toThrow("Invalid API key");
  });
});
