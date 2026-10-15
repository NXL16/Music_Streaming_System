CREATE INDEX "listening_events_user_event_type_created_at_idx"
ON "listening_events" ("userId", "eventType", "createdAt");
