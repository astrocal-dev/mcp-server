import { describe, it, expect, vi } from "vitest";
import { listBookings } from "./list-bookings";
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

const mockBookings = [
  {
    id: "bkg_001",
    start_time: "2026-03-15T14:00:00Z",
    end_time: "2026-03-15T14:30:00Z",
    status: "confirmed",
    invitee_name: "Jane Doe",
    invitee_email: "jane@example.com",
    org_id: "org_123",
    cancel_token: "secret_token",
  },
  {
    id: "bkg_002",
    start_time: "2026-03-16T10:00:00Z",
    end_time: "2026-03-16T10:30:00Z",
    status: "confirmed",
    invitee_name: "John Smith",
    invitee_email: "john@example.com",
    org_id: "org_123",
    cancel_token: "another_token",
  },
];

describe("listBookings", () => {
  it("returns bookings with stripped internal fields", async () => {
    const client = createMockClient({
      listBookings: vi.fn().mockResolvedValue({ data: mockBookings, has_more: false }),
    });

    const result = await listBookings({}, client);

    expect(result.bookings).toHaveLength(2);
    expect(result.bookings[0]).toEqual({
      id: "bkg_001",
      start_time: "2026-03-15T14:00:00Z",
      end_time: "2026-03-15T14:30:00Z",
      status: "confirmed",
      invitee_name: "Jane Doe",
      invitee_email: "jane@example.com",
    });
    // Ensure internal fields are not included
    expect(result.bookings[0]).not.toHaveProperty("org_id");
    expect(result.bookings[0]).not.toHaveProperty("cancel_token");
  });

  it("returns human-readable message with count", async () => {
    const client = createMockClient({
      listBookings: vi.fn().mockResolvedValue({ data: mockBookings, has_more: false }),
    });

    const result = await listBookings({}, client);

    expect(result.message).toContain("Found 2 bookings");
  });

  it("returns singular form for single booking", async () => {
    const client = createMockClient({
      listBookings: vi.fn().mockResolvedValue({ data: [mockBookings[0]], has_more: false }),
    });

    const result = await listBookings({}, client);

    expect(result.message).toContain("Found 1 booking.");
    expect(result.message).not.toContain("bookings");
  });

  it("returns empty list message when no bookings", async () => {
    const client = createMockClient({
      listBookings: vi.fn().mockResolvedValue({ data: [], has_more: false }),
    });

    const result = await listBookings({}, client);

    expect(result.bookings).toHaveLength(0);
    expect(result.message).toBe("No bookings found.");
  });

  it("indicates when more results are available", async () => {
    const client = createMockClient({
      listBookings: vi.fn().mockResolvedValue({ data: mockBookings, has_more: true }),
    });

    const result = await listBookings({}, client);

    expect(result.has_more).toBe(true);
    expect(result.message).toContain("More results available");
  });

  it("defaults limit to 10", async () => {
    const mockList = vi.fn().mockResolvedValue({ data: [], has_more: false });
    const client = createMockClient({ listBookings: mockList });

    await listBookings({}, client);

    expect(mockList).toHaveBeenCalledWith({
      status: undefined,
      limit: 10,
      event_type_id: undefined,
    });
  });

  it("passes status filter to API client", async () => {
    const mockList = vi.fn().mockResolvedValue({ data: [], has_more: false });
    const client = createMockClient({ listBookings: mockList });

    await listBookings({ status: "cancelled" }, client);

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
  });

  it("passes event_type_id filter to API client", async () => {
    const mockList = vi.fn().mockResolvedValue({ data: [], has_more: false });
    const client = createMockClient({ listBookings: mockList });

    await listBookings({ event_type_id: "evt_123" }, client);

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ event_type_id: "evt_123" }));
  });

  it("passes custom limit to API client", async () => {
    const mockList = vi.fn().mockResolvedValue({ data: [], has_more: false });
    const client = createMockClient({ listBookings: mockList });

    await listBookings({ limit: 50 }, client);

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it("rejects invalid status values", async () => {
    const client = createMockClient();

    await expect(listBookings({ status: "invalid_status" }, client)).rejects.toThrow();
  });

  it("rejects limit below 1", async () => {
    const client = createMockClient();

    await expect(listBookings({ limit: 0 }, client)).rejects.toThrow();
  });

  it("rejects limit above 100", async () => {
    const client = createMockClient();

    await expect(listBookings({ limit: 101 }, client)).rejects.toThrow();
  });

  it("maps API 401 error to unauthorized message", async () => {
    const client = createMockClient({
      listBookings: vi
        .fn()
        .mockRejectedValue(new ApiError(401, { error: { code: "unauthorized" } })),
    });

    await expect(listBookings({}, client)).rejects.toThrow("Invalid API key");
  });
});
