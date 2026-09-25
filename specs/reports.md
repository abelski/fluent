# Mistake reports — current behavior

## Purpose
Lets any authenticated user flag a content mistake (e.g. a wrong translation or a broken
sentence) they found somewhere in the app, tagged with a free-text `context` string identifying
what they were looking at. Admins triage the resulting queue: hold, resolve, reopen, or (for
superadmins) permanently delete a report. Every status change notifies the original reporter
through the in-app inbox and, if they've consented to email, an email. Called over REST by the
authenticated app (student-facing report submission) and by the admin dashboard (triage UI).
Backed by: `backend/routers/reports.py` (mounted at `/api`, so routes are `/api/reports` and
`/api/admin/reports/*`).

## Scenarios

```gherkin
Scenario: A student submits a mistake report
  Given an authenticated user with a non-empty description
  When they POST /api/reports with an optional `context` string and a `description`
  Then a MistakeReport row is created with status "open", owned by that user
  And a Telegram notification is sent with the user's email and a truncated description
  And the new report's id is returned
```

```gherkin
Scenario: A student submits a report with an empty description
  Given an authenticated user
  When they POST /api/reports with a description that is empty or only whitespace
  Then the request is rejected with 400 "description required"
```

```gherkin
Scenario: An unauthenticated caller tries to submit a report
  Given no valid bearer token
  When they POST /api/reports
  Then the request is rejected by the shared auth dependency before reaching report logic
```

```gherkin
Scenario: An admin lists all reports
  Given an authenticated user with is_admin = true
  When they GET /api/admin/reports
  Then every report is returned newest-first, joined with the reporting user's name and email
```

```gherkin
Scenario: A non-admin tries to list or triage reports
  Given an authenticated user with is_admin = false
  When they call any /api/admin/reports* endpoint
  Then the request is rejected with 403 "Forbidden"
```

```gherkin
Scenario: An admin resolves a report
  Given a report in any status (no prior-status check is enforced) and an admin caller
  When they PATCH /api/admin/reports/{id}/resolve
  Then the report's status is set to "resolved"
  And the reporter receives an in-app inbox message about the status change
  And if the reporter has email_consent, they also receive an email with a Premium upsell appended,
    followed by a Telegram notification recording that the email was sent
  And if email sending fails, or the reporter has no consent, the resolve action still succeeds
```

```gherkin
Scenario: An admin puts a report on hold
  Given a report in any status (no prior-status check is enforced) and an admin caller
  When they PATCH /api/admin/reports/{id}/hold
  Then the report's status is set to "onhold"
  And the reporter is notified the same way as on resolve
```

```gherkin
Scenario: An admin reopens a report
  Given a report in any status (no prior-status check is enforced) and an admin caller
  When they PATCH /api/admin/reports/{id}/reopen
  Then the report's status is set back to "open"
  And the reporter is notified the same way as on resolve
```

```gherkin
Scenario: Triaging a report that doesn't exist
  Given a report id with no matching row
  When an admin calls resolve, hold, or reopen on that id
  Then the request is rejected with 404 "Report not found"
```

```gherkin
Scenario: A superadmin permanently deletes a report
  Given an authenticated user with is_superadmin = true
  When they DELETE /api/admin/reports/{id}
  Then the report row is deleted with no reporter notification
```

```gherkin
Scenario: An admin who is not a superadmin tries to delete a report
  Given an authenticated user with is_admin = true but is_superadmin = false
  When they DELETE /api/admin/reports/{id}
  Then the request is rejected with 403 "Forbidden"
```

```gherkin
Scenario: Notifying a reporter whose account no longer exists
  Given a report whose user_id no longer matches any User row
  When an admin changes that report's status
  Then the in-app inbox notification step still runs (scoped by user_id) and the status change
    commits
  And the email step is skipped because no matching user is found
```
