-- Support cursor pagination for the Library Songs view without scanning the
-- user's album and playlist memberships.
CREATE INDEX "user_library_resources_userId_resourceType_createdAt_resourceId_idx"
ON "user_library_resources"("userId", "resourceType", "createdAt", "resourceId");

CREATE INDEX "user_library_resources_userId_resourceType_title_resourceId_idx"
ON "user_library_resources"("userId", "resourceType", "title", "resourceId");
