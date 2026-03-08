import { describe, it, expect, vi } from "vitest";
import { listEventTypes } from "./list-event-types";
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

const mockEventTypes = [
  {
    id: "evt_001",
    title: "30-Minute Consultation",
    slug: "30-minute-consultation",
    description: "Quick chat about your project",
    duration_minutes: 30,
    is_active: true,
    price_amount: null,
    price_currency: null,
  },
  {
    id: "evt_002",
    title: "1-Hour Strategy Session",
    slug: "1-hour-strategy-session",
    description: "Deep dive into your goals",
    duration_minutes: 60,
    is_active: true,
    price_amount: 5000,
    price_currency: "usd",
  },
];

describe("listEventTypes", () => {
  it("returns event types with correct fields", async () => {
    const client = createMockClient({
      listEventTypes: vi.fn().mockResolvedValue({ data: mockEventTypes, has_more: false }),
    });

    const result = await listEventTypes({}, client);

    expect(result.event_types).toHaveLength(2);
    expect(result.event_types[0]).toEqual({
      id: "evt_001",
      title: "30-Minute Consultation",
      slug: "30-minute-consultation",
      description: "Quick chat about your project",
      duration_minutes: 30,
    });
  });

  it("includes price fields only for paid event types", async () => {
    const client = createMockClient({
      listEventTypes: vi.fn().mockResolvedValue({ data: mockEventTypes, has_more: false }),
    });

    const result = await listEventTypes({}, client);

    // Free event type should not have price fields
    expect(result.event_types[0]).not.toHaveProperty("price_amount");
    expect(result.event_types[0]).not.toHaveProperty("price_currency");

    // Paid event type should have price fields
    expect(result.event_types[1]).toHaveProperty("price_amount", 5000);
    expect(result.event_types[1]).toHaveProperty("price_currency", "usd");
  });

  it("returns human-readable message with count", async () => {
    const client = createMockClient({
      listEventTypes: vi.fn().mockResolvedValue({ data: mockEventTypes, has_more: false }),
    });

    const result = await listEventTypes({}, client);

    expect(result.message).toContain("Found 2 event types");
    expect(result.message).toContain("available for booking");
  });

  it("returns singular form for single event type", async () => {
    const client = createMockClient({
      listEventTypes: vi.fn().mockResolvedValue({ data: [mockEventTypes[0]], has_more: false }),
    });

    const result = await listEventTypes({}, client);

    expect(result.message).toContain("Found 1 event type");
    expect(result.message).not.toContain("types ");
  });

  it("returns empty message when no event types", async () => {
    const client = createMockClient({
      listEventTypes: vi.fn().mockResolvedValue({ data: [], has_more: false }),
    });

    const result = await listEventTypes({}, client);

    expect(result.event_types).toHaveLength(0);
    expect(result.message).toBe("No event types available.");
  });

  it("always requests active event types with limit 100", async () => {
    const mockList = vi.fn().mockResolvedValue({ data: [], has_more: false });
    const client = createMockClient({ listEventTypes: mockList });

    await listEventTypes({}, client);

    expect(mockList).toHaveBeenCalledWith({ active: true, limit: 100 });
  });

  it("maps API 401 error to unauthorized message", async () => {
    const client = createMockClient({
      listEventTypes: vi
        .fn()
        .mockRejectedValue(new ApiError(401, { error: { code: "unauthorized" } })),
    });

    await expect(listEventTypes({}, client)).rejects.toThrow("Invalid API key");
  });

  it("maps API 500 error to server error message", async () => {
    const client = createMockClient({
      listEventTypes: vi
        .fn()
        .mockRejectedValue(new ApiError(500, { error: { code: "internal_error" } })),
    });

    await expect(listEventTypes({}, client)).rejects.toThrow("experiencing issues");
  });
});
