CREATE TABLE IF NOT EXISTS mistake_report (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES "user"(id),
    context VARCHAR,
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR NOT NULL DEFAULT 'open',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mistake_report_user_id ON mistake_report(user_id);
CREATE INDEX IF NOT EXISTS idx_mistake_report_status ON mistake_report(status);
