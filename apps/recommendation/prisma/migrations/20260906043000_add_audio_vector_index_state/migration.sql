CREATE TABLE "audio_vector_index_states" (
    "id" VARCHAR(128) NOT NULL,
    "collectionName" VARCHAR(128) NOT NULL,
    "cursor" VARCHAR(512) NOT NULL DEFAULT '',
    "synchronizedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "audio_vector_index_states_pkey" PRIMARY KEY ("id")
);
