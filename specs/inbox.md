# In-app inbox — current behavior

## Purpose
A per-user message inbox inside the app (separate from email) that other features write into —
milestone achievements, leaderboard rewards/notices, mistake-report status changes, and Premium
welcome — plus a superadmin composer that can broadcast a one-off bilingual message to a chosen
audience. Students read, mark-read, delete, and undelete their own messages; superadmins compose,
review send history, and retract a broadcast. Called over REST by the dashboard inbox page
(student reading) and by the admin dashboard's inbox composer (superadmin authoring). Reads are
cached per user/message so a warm request issues no database statements.
Backed by: `backend/routers/inbox.py` (mounted at `/api`, so routes are `/api/me/inbox*` and
`/api/admin/inbox*`), `frontend/app/dashboard/inbox/` (`page.tsx`, `MessageView.tsx`).

## Scenarios

```gherkin
Scenario: A student checks their unread count
  Given an authenticated user
  When they GET /api/me/inbox/unread-count
  Then the count of their deliveries that are unread and not deleted is returned
```

```gherkin
Scenario: A student opens their inbox list
  Given an authenticated user
  When they GET /api/me/inbox with a limit and offset
  Then one page of their deliveries is returned, newest first, as snippets only (no full body)
```

```gherkin
Scenario: A student opens one message
  Given an authenticated user and a delivery id
  When they GET /api/me/inbox/{delivery_id}
  Then the full message content is returned if that delivery belongs to them and isn't deleted
  Then a 404 is returned if the delivery belongs to someone else, doesn't exist, or was deleted
```

```gherkin
Scenario: A student marks a message read by opening it
  Given the dashboard inbox page renders MessageView for an unread message
  When the component mounts
  Then it fires exactly one POST /api/me/inbox/actions with action "read" and that message's id
  And it does not re-fire on subsequent renders of the same message
```

```gherkin
Scenario: A student marks all messages read
  Given an authenticated user with unread messages
  When they POST /api/me/inbox/actions with action "read" and all=true
  Then every unread, non-deleted delivery of theirs is marked read in one UPDATE
  And the unread count returned afterward is 0
```

```gherkin
Scenario: A student deletes a message
  Given an authenticated user and one or more delivery ids they own
  When they POST /api/me/inbox/actions with action "delete" and those ids
  Then each delivery's deleted_at is set, and only ids that were actually theirs and not already
    deleted come back in affected_ids
  And the inbox page shows an Undo snackbar and removes the row from the list optimistically
```

```gherkin
Scenario: A student undoes a delete
  Given a delivery that was just soft-deleted
  When they POST /api/me/inbox/actions with action "undelete" and that id (via the snackbar's Undo)
  Then deleted_at is cleared for that delivery and it reappears in the list at its original
    position if still held client-side, or via a fresh reload otherwise
```

```gherkin
Scenario: A student's action request is malformed
  Given an authenticated user
  When they POST /api/me/inbox/actions with an action outside read/delete/undelete, or with both
    `ids` and `all` set, or neither set, or `all` used with an action other than read, or `ids`
    with 0 or more than 500 entries
  Then the request is rejected with 422 and a message describing which rule was violated
```

```gherkin
Scenario: A student's action ids include someone else's message
  Given an authenticated user submits an id that belongs to another user
  When the action executes
  Then that id is silently excluded from the UPDATE (scoped by user_id) and never appears in
    affected_ids — it is not treated as an error
```

```gherkin
Scenario: A student clicks Reply on a message
  Given the message-view page for one delivery
  When the student clicks Reply
  Then a feedback modal opens pre-filled with a quote of the message title and the student's own
    email (read from their JWT), which submits through the general feedback endpoint, not inbox
```

```gherkin
Scenario: A superadmin composes a broadcast to specific users
  Given an authenticated superadmin
  When they POST /api/admin/inbox with audience "users", a list of 1-5000 user_ids, kind, bilingual
    title/body, and optional CTA label+url
  Then a message is created and fanned out to exactly those user ids (deduplicated) in one bulk
    insert, and the recipient count is returned
```

```gherkin
Scenario: A superadmin composes a broadcast to a computed audience
  Given an authenticated superadmin
  When they POST /api/admin/inbox with audience "all", "premium", "free", or "inactive" (the last
    requiring inactive_days between 1 and 3650)
  Then the recipient set is resolved server-side at send time — active-premium users for
    "premium", everyone else for "free", users whose last_login (or created_at) is older than the
    cutoff for "inactive" — never cached, so a user who just bought Premium is excluded from a
    "buy Premium" broadcast made moments later
```

```gherkin
Scenario: A superadmin previews a broadcast before sending
  Given a composed message body
  When they POST /api/admin/inbox with dry_run=true
  Then only the resolved recipient count is returned and no message or delivery rows are created
  And the admin UI uses this to show a confirm dialog with the real number before the actual send
```

```gherkin
Scenario: A broadcast's audience resolves to nobody
  Given an audience filter (e.g. "inactive" with an unusually strict day count)
  When the recipient query returns zero users
  Then the request is rejected with 422 "no users match this audience" and nothing is sent
```

```gherkin
Scenario: A broadcast's content fails validation
  Given a superadmin composing a message
  When title_ru/title_en is empty or exceeds 120 characters, body_ru/body_en exceeds 4000
    characters, cta_url exceeds 500 characters or isn't an internal path starting with a single
    "/" (rejecting things like "//evil.host" or "javascript:"), or only some of cta_url/
    cta_label_ru/cta_label_en are filled in instead of all three or none
  Then the request is rejected with 422 naming the specific field
```

```gherkin
Scenario: A non-superadmin tries to use the composer
  Given an authenticated admin who is not a superadmin, or any non-admin
  When they call any /api/admin/inbox* endpoint
  Then the request is rejected with 403 "Forbidden"
```

```gherkin
Scenario: A superadmin reviews broadcast history
  Given an authenticated superadmin
  When they GET /api/admin/inbox
  Then the last 100 admin-sourced messages are returned with per-message recipient and read counts,
    computed fresh (never cached, since stale counts would mislead)
```

```gherkin
Scenario: A superadmin retracts a sent broadcast
  Given an existing inbox message id
  When they DELETE /api/admin/inbox/{message_id}
  Then all of its deliveries are deleted first, then the message itself, removing it from every
    recipient's inbox
  Then a 404 is returned if the message id doesn't exist
```
