# @astrocal/mcp-server

MCP server for the [Astrocal](https://astrocal.dev) scheduling API. Lets AI agents check availability, book meetings, cancel, reschedule, and list bookings via the [Model Context Protocol](https://modelcontextprotocol.io).

## Quick Start

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "astrocal": {
      "command": "npx",
      "args": ["-y", "@astrocal/mcp-server"],
      "env": {
        "ASTROCAL_API_KEY": "ac_live_xxxxxxxxxxxxx"
      }
    }
  }
}
```

Restart Claude Desktop and the tools will be available.

### Other MCP Clients

Install globally:

```bash
npm install -g @astrocal/mcp-server
```

Run:

```bash
ASTROCAL_API_KEY=ac_live_xxx astrocal-mcp
```

## Environment Variables

| Variable                         | Required | Description                                                         |
| -------------------------------- | -------- | ------------------------------------------------------------------- |
| `ASTROCAL_API_KEY`               | Yes      | Your Astrocal API key (get from the dashboard)                      |
| `ASTROCAL_API_URL`               | No       | API base URL (default: `https://api.astrocal.dev`)                  |
| `ASTROCAL_DEFAULT_EVENT_TYPE_ID` | No       | Default event type ID — skips needing to pass it to every tool call |

## Available Tools

### `check_availability`

Check available time slots for booking a meeting.

**Input:**

- `event_type_id` (string, optional) — Event type to check. Optional if `ASTROCAL_DEFAULT_EVENT_TYPE_ID` is set.
- `start_date` (string, required) — Start date in ISO 8601 format (e.g., `2026-03-15`)
- `end_date` (string, required) — End date in ISO 8601 format (e.g., `2026-03-22`)
- `timezone` (string, optional) — IANA timezone (e.g., `America/New_York`). Defaults to UTC.

### `create_booking`

Book a meeting at a specific time.

**Input:**

- `event_type_id` (string, optional) — Event type to book. Optional if default is set.
- `start_time` (string, required) — ISO 8601 datetime (e.g., `2026-03-15T14:00:00Z`)
- `invitee_name` (string, required) — Full name of the person booking
- `invitee_email` (string, required) — Email address for calendar invitation
- `invitee_timezone` (string, optional) — IANA timezone. Defaults to UTC.
- `notes` (string, optional) — Meeting notes (max 1000 characters)

### `cancel_booking`

Cancel an existing booking. The invitee will be notified via email.

**Input:**

- `booking_id` (string, required) — ID of the booking to cancel
- `reason` (string, optional) — Cancellation reason (max 500 characters)

### `reschedule_booking`

Reschedule a booking to a new time. Check availability first.

**Input:**

- `booking_id` (string, required) — ID of the booking to reschedule
- `new_start_time` (string, required) — New time in ISO 8601 format
- `reason` (string, optional) — Reason for rescheduling (max 500 characters)

### `list_bookings`

List bookings with optional filters.

**Input:**

- `status` (string, optional) — Filter: `confirmed`, `cancelled`, or `pending_payment`
- `limit` (number, optional) — Max results (default: 10, max: 100)
- `event_type_id` (string, optional) — Filter by event type

### `list_event_types`

List available event types that can be booked. No input required.

### `join_waitlist`

Join the waitlist for a fully booked event type.

**Input:**

- `event_type_id` (string, required) — Event type to join the waitlist for
- `name` (string, required) — Full name
- `email` (string, required) — Email address
- `preferred_times` (string, optional) — Preferred time ranges or notes

### `check_waitlist`

Check your position on a waitlist.

**Input:**

- `waitlist_entry_id` (string, required) — Waitlist entry ID returned from `join_waitlist`

## Example Conversation

> **User:** "What meetings can I book?"
>
> **Agent:** _calls `list_event_types`_ — "You have two event types: a 30-minute consultation (free) and a 1-hour strategy session ($50)."
>
> **User:** "Check if next Tuesday at 2pm is free for a consultation"
>
> **Agent:** _calls `check_availability`_ — "Tuesday at 2pm is available."
>
> **User:** "Book it for jane@example.com"
>
> **Agent:** _calls `create_booking`_ — "Done! Meeting confirmed for Tuesday, March 17 at 2:00 PM UTC with Jane Doe. A calendar invitation has been sent."
>
> **User:** "Actually, move it to 3pm"
>
> **Agent:** _calls `reschedule_booking`_ — "Rescheduled to 3:00 PM. Jane has been notified."

## Links

- [Documentation](https://astrocal.dev/docs)
- [GitHub](https://github.com/astrocal-dev/mcp-server)
- [Issues](https://github.com/astrocal-dev/mcp-server/issues)

## License

MIT
