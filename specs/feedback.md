# Feedback — current behavior

## Purpose
Lets anyone — logged in or not — send a free-text message plus a contact email to the Fluent
team, with no auth required. Admins review submissions in a read-only queue and can permanently
remove one. Called over REST by a feedback form/modal reachable from the app (any page, since no
auth is required) and by the admin dashboard.
Backed by: `backend/routers/feedback.py` (mounted at `/api`, so routes are `/api/feedback` and
`/api/admin/feedback/*`).

## Scenarios

```gherkin
Scenario: A visitor submits feedback
  Given any caller, authenticated or not, with a non-empty email and message
  When they POST /api/feedback with `email` and `message`
  Then a Feedback row is created with the trimmed email and message
  And a Telegram notification is sent with the email and a truncated message
  And the response is {"ok": true} with no id returned
```

```gherkin
Scenario: Feedback is submitted with a missing email or message
  Given a caller
  When they POST /api/feedback with an email or message that is empty or only whitespace
  Then the request is rejected with 422 ("Email is required" or "Message is required")
```

```gherkin
Scenario: Feedback message exceeds the length limit
  Given a caller
  When they POST /api/feedback with a message longer than 2000 characters
  Then the request is rejected with 422 "Message must be 2000 characters or fewer"
```

```gherkin
Scenario: An admin lists feedback
  Given an authenticated user with is_admin = true
  When they GET /api/admin/feedback
  Then every feedback row is returned newest-first, with no filtering or pagination server-side
```

```gherkin
Scenario: A non-admin tries to list or delete feedback
  Given an authenticated user with is_admin = false, or no token at all
  When they call any /api/admin/feedback* endpoint
  Then the request is rejected (403 "Forbidden" if authenticated-but-not-admin; 401/unauthenticated
    otherwise)
```

```gherkin
Scenario: An admin deletes a feedback entry
  Given an admin caller and an existing feedback id
  When they DELETE /api/admin/feedback/{id}
  Then the row is permanently removed and {"ok": true} is returned
```

```gherkin
Scenario: An admin deletes a feedback entry that doesn't exist
  Given an admin caller and an id with no matching row
  When they DELETE /api/admin/feedback/{id}
  Then the request is rejected with 404 "Not found"
```
