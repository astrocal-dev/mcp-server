import { describe, it, expect, vi } from "vitest";
import { cancelBooking } from "./cancel-booking";
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

const mockCancelResponse = {
  id: "bkg_789",
  status: "cancelled",
  cancelled_at: "2026-03-10T12:00:00Z",
  start_time: "2026-03-15T14:00:00Z",
  end_time: "2026-03-15T14:30:00Z",
};

describe("cancelBooking", () => {
  it("cancels a booking and returns confirmation message", async () => {
    const client = createMockClient({
      cancelBooking: vi.fn().mockResolvedValue(mockCancelResponse),
    });

    const result = await cancelBooking({ booking_id: "bkg_789" }, client);

    expect(result.booking).toEqual({
      id: "bkg_789",
      status: "cancelled",
      cancelled_at: "2026-03-10T12:00:00Z",
    });
    expect(result.message).toContain("cancelled successfully");
    expect(result.message).toContain("notified");
  });

  it("passes reason to API client", async () => {
    const mockCancel = vi.fn().mockResolvedValue(mockCancelResponse);
    const client = createMockClient({ cancelBooking: mockCancel });

    await cancelBooking({ booking_id: "bkg_789", reason: "Schedule conflict" }, client);

    expect(mockCancel).toHaveBeenCalledWith("bkg_789", { reason: "Schedule conflict" });
  });

  it("truncates reason at 500 characters instead of rejecting", async () => {
    const mockCancel = vi.fn().mockResolvedValue(mockCancelResponse);
    const client = createMockClient({ cancelBooking: mockCancel });

    const longReason = "x".repeat(1000);
    await cancelBooking({ booking_id: "bkg_789", reason: longReason }, client);

    const calledWith = mockCancel.mock.calls[0]![1] as { reason: string };
    expect(calledWith.reason).toHaveLength(500);
  });

  it("passes undefined reason when not provided", async () => {
    const mockCancel = vi.fn().mockResolvedValue(mockCancelResponse);
    const client = createMockClient({ cancelBooking: mockCancel });

    await cancelBooking({ booking_id: "bkg_789" }, client);

    expect(mockCancel).toHaveBeenCalledWith("bkg_789", { reason: undefined });
  });

  it("throws on empty booking_id", async () => {
    const client = createMockClient();

    await expect(cancelBooking({ booking_id: "" }, client)).rejects.toThrow();
  });

  it("throws on missing booking_id", async () => {
    const client = createMockClient();

    await expect(cancelBooking({}, client)).rejects.toThrow();
  });

  it("maps API 404 error to human-readable message", async () => {
    const client = createMockClient({
      cancelBooking: vi.fn().mockRejectedValue(
        new ApiError(404, {
          error: { code: "not_found", message: "Booking not found" },
        }),
      ),
    });

    await expect(cancelBooking({ booking_id: "bkg_bad" }, client)).rejects.toThrow(
      "Booking not found",
    );
  });

  it("maps API 401 error to unauthorized message", async () => {
    const client = createMockClient({
      cancelBooking: vi
        .fn()
        .mockRejectedValue(new ApiError(401, { error: { code: "unauthorized" } })),
    });

    await expect(cancelBooking({ booking_id: "bkg_789" }, client)).rejects.toThrow(
      "Invalid API key",
    );
  });

  it("maps API 409 error to slot unavailable message", async () => {
    const client = createMockClient({
      cancelBooking: vi.fn().mockRejectedValue(
        new ApiError(409, {
          error: { code: "conflict", message: "Already cancelled" },
        }),
      ),
    });

    await expect(cancelBooking({ booking_id: "bkg_789" }, client)).rejects.toThrow(
      "no longer available",
    );
  });
});
