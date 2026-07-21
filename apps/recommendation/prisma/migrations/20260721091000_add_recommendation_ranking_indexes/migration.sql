-- Bound recommendation scoring to recent event history and make the hot
-- interaction/collaborative-filter queries use selective ordered indexes.
CREATE INDEX "recommendation_interactions_userId_resourceType_occurredAt_idx"
  ON "recommendation_interactions"("userId", "resourceType", "occurredAt");

CREATE INDEX "recommendation_interactions_resourceType_occurredAt_idx"
  ON "recommendation_interactions"("resourceType", "occurredAt");

CREATE INDEX "user_listening_stats_songId_lastPlayedAt_idx"
  ON "user_listening_stats"("songId", "lastPlayedAt");
