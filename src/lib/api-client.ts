/**
 * HTTP client for the Astrocal REST API.
 *
 * Uses native fetch with a simple retry wrapper. Retries once on network
 * errors or 5xx responses with exponential backoff. 10-second timeout
 * via AbortController.
 */

/** Error thrown when the API returns a non-2xx response. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API responded with status ${status}`);
    this.name = "ApiError";
  }
}

/** Error thrown when a request times out. */
export class TimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "TimeoutError";
  }
}

/** Error thrown when the network request fails. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("Unable to connect to Astrocal API");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/** Parameters for checking availability. */
export interface CheckAvailabilityParams {
  readonly event_type_id: string;
  readonly start: string;
  readonly end: string;
  readonly timezone: string;
  readonly duration?: number;
}

/** Parameters for creating a single-invitee booking. */
export interface CreateBookingSingleParams {
  readonly event_type_id: string;
  readonly start_time: string;
  readonly invitee_name: string;
  readonly invitee_email: string;
  readonly invitee_timezone: string;
  readonly duration?: number;
  readonly notes?: string;
}

/** Parameters for creating a group booking. */
export interface CreateBookingGroupParams {
  readonly event_type_id: string;
  readonly start_time: string;
  readonly attendees: ReadonlyArray<{
    readonly name: string;
    readonly email: string;
    readonly timezone?: string;
  }>;
  readonly duration?: number;
  readonly notes?: string;
}

/** Parameters for creating a booking (single or group). */
export type CreateBookingParams = CreateBookingSingleParams | CreateBookingGroupParams;

/** Parameters for cancelling a booking. */
export interface CancelBookingParams {
  readonly reason?: string;
}

/** Parameters for rescheduling a booking. */
export interface RescheduleBookingParams {
  readonly new_start_time: string;
  readonly reason?: string;
}

/** Parameters for listing bookings. */
export interface ListBookingsParams {
  readonly status?: string;
  readonly limit?: number;
  readonly event_type_id?: string;
}

/** Parameters for listing event types. */
export interface ListEventTypesParams {
  readonly active?: boolean;
  readonly limit?: number;
}

/** Parameters for creating a waitlist entry. */
export interface CreateWaitlistEntryParams {
  readonly event_type_id: string;
  readonly invitee_name: string;
  readonly invitee_email: string;
  readonly invitee_timezone: string;
  readonly start_time?: string;
  readonly duration_minutes?: number;
  readonly notes?: string;
}

/** Parameters for listing waitlist entries. */
export interface ListWaitlistParams {
  readonly event_type_id: string;
  readonly status?: string;
  readonly limit?: number;
}

/** Response shape from POST /v1/waitlist. */
export interface WaitlistEntryResponse {
  readonly id: string;
  readonly event_type_id: string;
  readonly status: string;
  readonly position: number;
  readonly invitee_name: string;
  readonly invitee_email: string;
  readonly start_time: string | null;
  readonly expires_at: string;
  readonly cancel_token: string;
  readonly [key: string]: unknown;
}

/** Response shape from GET /v1/availability. */
export interface AvailabilityResponse {
  readonly event_type_id: string;
  readonly timezone: string;
  readonly start: string;
  readonly end: string;
  readonly slots: ReadonlyArray<{ start_time: string; end_time: string }>;
  readonly capped?: boolean;
}

/** Response shape from GET /v1/event-types/:id. */
export interface EventTypeResponse {
  readonly id: string;
  readonly title: string;
  readonly duration_minutes: number;
  readonly duration_options: readonly number[] | null;
  readonly [key: string]: unknown;
}

/** Response shape from POST /v1/bookings. */
export interface BookingResponse {
  readonly id: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly status: string;
  readonly invitee_name: string;
  readonly invitee_email: string;
  readonly [key: string]: unknown;
}

/** Response shape from POST /v1/bookings/:id/cancel. */
export interface CancelBookingResponse {
  readonly id: string;
  readonly status: string;
  readonly cancelled_at: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly [key: string]: unknown;
}

/** Response shape from POST /v1/bookings/:id/reschedule. */
export interface RescheduleBookingResponse {
  readonly id: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly status: string;
  readonly invitee_name: string;
  readonly invitee_email: string;
  readonly [key: string]: unknown;
}

/** A single item in a paginated API response. */
export interface PaginatedResponse<T> {
  readonly data: readonly T[];
  readonly has_more: boolean;
}

/** Event type item from GET /v1/event-types. */
export interface EventTypeListItem {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly description: string | null;
  readonly duration_minutes: number;
  readonly is_active: boolean;
  readonly price_amount: number | null;
  readonly price_currency: string | null;
  readonly [key: string]: unknown;
}

const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 1_000;
const MAX_RETRIES = 1;

/**
 * Astrocal REST API client.
 *
 * Wraps native fetch with authentication, timeout, and retry logic.
 */
export class AstrocalApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    // Remove trailing slash
    this.baseUrl = apiUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  /**
   * Checks availability for an event type within a date range.
   *
   * @param params - Query parameters (event_type_id, start, end, timezone).
   * @returns Available slots from the API.
   */
  async checkAvailability(params: CheckAvailabilityParams): Promise<AvailabilityResponse> {
    const qs = new URLSearchParams({
      event_type_id: params.event_type_id,
      start: params.start,
      end: params.end,
      timezone: params.timezone,
    });
    if (params.duration !== undefined) {
      qs.set("duration", String(params.duration));
    }
    return this.fetchWithRetry(`${this.baseUrl}/v1/availability?${qs}`, { method: "GET" });
  }

  /**
   * Creates a booking via the API.
   *
   * @param data - Booking details.
   * @returns Created booking from the API.
   */
  async createBooking(data: CreateBookingParams): Promise<BookingResponse> {
    return this.fetchWithRetry(`${this.baseUrl}/v1/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /**
   * Fetches a single event type by ID.
   *
   * @param id - Event type UUID.
   * @returns Event type details.
   */
  async getEventType(id: string): Promise<EventTypeResponse> {
    return this.fetchWithRetry(`${this.baseUrl}/v1/event-types/${id}`, { method: "GET" });
  }

  /**
   * Cancels a booking via the API.
   *
   * @param id - Booking UUID.
   * @param params - Optional cancellation reason.
   * @returns Cancelled booking from the API.
   */
  async cancelBooking(id: string, params?: CancelBookingParams): Promise<CancelBookingResponse> {
    return this.fetchWithRetry(`${this.baseUrl}/v1/bookings/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params ?? {}),
    });
  }

  /**
   * Reschedules a booking to a new time via the API.
   *
   * @param id - Booking UUID.
   * @param params - New start time and optional reason.
   * @returns Rescheduled booking from the API.
   */
  async rescheduleBooking(
    id: string,
    params: RescheduleBookingParams,
  ): Promise<RescheduleBookingResponse> {
    return this.fetchWithRetry(`${this.baseUrl}/v1/bookings/${id}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  }

  /**
   * Lists bookings with optional filters.
   *
   * @param params - Optional filters (status, limit, event_type_id).
   * @returns Paginated list of bookings.
   */
  async listBookings(params?: ListBookingsParams): Promise<PaginatedResponse<BookingResponse>> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.event_type_id) qs.set("event_type_id", params.event_type_id);
    const query = qs.toString();
    const url = `${this.baseUrl}/v1/bookings${query ? `?${query}` : ""}`;
    return this.fetchWithRetry(url, { method: "GET" });
  }

  /**
   * Lists event types with optional filters.
   *
   * @param params - Optional filters (active, limit).
   * @returns Paginated list of event types.
   */
  async listEventTypes(
    params?: ListEventTypesParams,
  ): Promise<PaginatedResponse<EventTypeListItem>> {
    const qs = new URLSearchParams();
    if (params?.active !== undefined) qs.set("active", String(params.active));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    const url = `${this.baseUrl}/v1/event-types${query ? `?${query}` : ""}`;
    return this.fetchWithRetry(url, { method: "GET" });
  }

  /**
   * Creates a waitlist entry via the API.
   *
   * @param data - Waitlist entry details.
   * @returns Created waitlist entry from the API.
   */
  async createWaitlistEntry(data: CreateWaitlistEntryParams): Promise<WaitlistEntryResponse> {
    return this.fetchWithRetry(`${this.baseUrl}/v1/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /**
   * Lists waitlist entries with optional filters.
   *
   * @param params - Filter parameters (event_type_id, status, limit).
   * @returns Paginated list of waitlist entries.
   */
  async listWaitlistEntries(
    params: ListWaitlistParams,
  ): Promise<PaginatedResponse<WaitlistEntryResponse>> {
    const qs = new URLSearchParams({ event_type_id: params.event_type_id });
    if (params.status) qs.set("status", params.status);
    if (params.limit) qs.set("limit", String(params.limit));
    return this.fetchWithRetry(`${this.baseUrl}/v1/waitlist?${qs}`, { method: "GET" });
  }

  /**
   * Gets a single waitlist entry by ID.
   *
   * @param id - Waitlist entry UUID.
   * @returns Waitlist entry details.
   */
  async getWaitlistEntry(id: string): Promise<WaitlistEntryResponse> {
    return this.fetchWithRetry(`${this.baseUrl}/v1/waitlist/${id}`, { method: "GET" });
  }

  /**
   * Performs an HTTP request with timeout and retry logic.
   *
   * Retries once on network errors or 5xx responses. Uses exponential
   * backoff with a 1-second base delay.
   */
  private async fetchWithRetry<T>(url: string, init: RequestInit, attempt = 0): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);

        // Retry on 5xx
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          await this.delay(RETRY_DELAY_MS * Math.pow(2, attempt));
          return this.fetchWithRetry(url, init, attempt + 1);
        }

        throw new ApiError(response.status, body);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      // AbortError = timeout
      if (error instanceof DOMException && error.name === "AbortError") {
        if (attempt < MAX_RETRIES) {
          await this.delay(RETRY_DELAY_MS * Math.pow(2, attempt));
          return this.fetchWithRetry(url, init, attempt + 1);
        }
        throw new TimeoutError();
      }

      // Network error (TypeError from fetch)
      if (error instanceof TypeError) {
        if (attempt < MAX_RETRIES) {
          await this.delay(RETRY_DELAY_MS * Math.pow(2, attempt));
          return this.fetchWithRetry(url, init, attempt + 1);
        }
        throw new NetworkError(error);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
