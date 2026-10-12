-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EvidenceFact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "positionId" TEXT,
    "context" TEXT,
    "roleContext" TEXT,
    "category" TEXT NOT NULL,
    "experienceType" TEXT NOT NULL DEFAULT 'PROFESSIONAL',
    "canonicalFact" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'Self-reported',
    "sourceDetail" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "conceptIdsJson" TEXT NOT NULL DEFAULT '[]',
    "allowedWordingJson" TEXT NOT NULL DEFAULT '[]',
    "prohibitedExpansionsJson" TEXT NOT NULL DEFAULT '[]',
    "relationsJson" TEXT NOT NULL DEFAULT '[]',
    "startDate" TEXT,
    "endDate" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvidenceFact_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvidenceFact_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EvidenceFact" ("allowedWordingJson", "canonicalFact", "category", "code", "conceptIdsJson", "confidence", "context", "createdAt", "endDate", "experienceType", "id", "positionId", "profileId", "prohibitedExpansionsJson", "roleContext", "source", "sourceDetail", "startDate", "updatedAt", "verificationStatus", "verifiedAt") SELECT "allowedWordingJson", "canonicalFact", "category", "code", "conceptIdsJson", "confidence", "context", "createdAt", "endDate", "experienceType", "id", "positionId", "profileId", "prohibitedExpansionsJson", "roleContext", "source", "sourceDetail", "startDate", "updatedAt", "verificationStatus", "verifiedAt" FROM "EvidenceFact";
DROP TABLE "EvidenceFact";
ALTER TABLE "new_EvidenceFact" RENAME TO "EvidenceFact";
CREATE INDEX "EvidenceFact_profileId_verificationStatus_idx" ON "EvidenceFact"("profileId", "verificationStatus");
CREATE UNIQUE INDEX "EvidenceFact_profileId_code_key" ON "EvidenceFact"("profileId", "code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
