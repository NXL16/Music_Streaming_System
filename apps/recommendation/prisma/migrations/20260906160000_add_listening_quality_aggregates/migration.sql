ALTER TABLE "user_listening_stats"
  ADD COLUMN "earlySkipCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalEligibleSec" INTEGER NOT NULL DEFAULT 0;
