-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "displayName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT,
    "displayName" TEXT NOT NULL,
    "headline" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "links" TEXT NOT NULL DEFAULT '[]',
    "careerLevel" TEXT NOT NULL DEFAULT 'EARLY',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "nextFactNo" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CandidateProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "targetTitlesJson" TEXT NOT NULL DEFAULT '[]',
    "targetKeywordsJson" TEXT NOT NULL DEFAULT '[]',
    "desiredSalaryMin" INTEGER,
    "salaryHardFloor" INTEGER,
    "salaryCurrency" TEXT NOT NULL DEFAULT 'USD',
    "remotePreference" TEXT NOT NULL DEFAULT 'ANY',
    "acceptableLocationsJson" TEXT NOT NULL DEFAULT '[]',
    "willingToRelocate" BOOLEAN NOT NULL DEFAULT false,
    "employmentTypesJson" TEXT NOT NULL DEFAULT '["FULL_TIME"]',
    "excludedEmploymentJson" TEXT NOT NULL DEFAULT '[]',
    "excludedCompaniesJson" TEXT NOT NULL DEFAULT '[]',
    "excludedKeywordsJson" TEXT NOT NULL DEFAULT '[]',
    "securityClearance" TEXT NOT NULL DEFAULT 'NONE',
    "hasDriversLicense" BOOLEAN NOT NULL DEFAULT true,
    "canTravelPercent" INTEGER,
    "workAuthorization" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Preferences_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Position_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Education" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "credential" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "field" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "startDate" TEXT,
    "endDate" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Education_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceFact" (
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
    "startDate" TEXT,
    "endDate" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvidenceFact_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvidenceFact_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "remoteType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "employmentType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "description" TEXT NOT NULL,
    "applyUrl" TEXT,
    "reqId" TEXT,
    "department" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "postedAt" DATETIME,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" DATETIME,
    "closedAt" DATETIME,
    "fieldVerificationJson" TEXT NOT NULL DEFAULT '{}',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "postedAt" DATETIME,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobSource_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastScanAt" DATETIME,
    "lastStatus" TEXT,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScanRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "jobsSeen" INTEGER NOT NULL DEFAULT 0,
    "jobsNew" INTEGER NOT NULL DEFAULT 0,
    "jobsClosed" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" TEXT NOT NULL DEFAULT '[]'
);

-- CreateTable
CREATE TABLE "JobMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "resultJson" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "userVerdict" TEXT,
    "verdictReason" TEXT,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobMatch_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "jobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SAVED',
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "reqId" TEXT,
    "source" TEXT,
    "url" TEXT,
    "salaryText" TEXT,
    "location" TEXT,
    "appliedAt" DATETIME,
    "followUpAt" DATETIME,
    "notes" TEXT,
    "outcome" TEXT,
    "resumeDocumentId" TEXT,
    "coverLetterDocumentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PHONE_SCREEN',
    "withWhom" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "jobId" TEXT,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "renderedText" TEXT NOT NULL,
    "gateJson" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedDocument_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GeneratedDocument_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "jobId" TEXT,
    "applicationId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "fromDomain" TEXT,
    "subject" TEXT,
    "detectedType" TEXT NOT NULL,
    "company" TEXT,
    "role" TEXT,
    "confidence" REAL NOT NULL,
    "applicationId" TEXT,
    "suggestedStatus" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailSignal_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Preferences_profileId_key" ON "Preferences"("profileId");

-- CreateIndex
CREATE INDEX "EvidenceFact_profileId_verificationStatus_idx" ON "EvidenceFact"("profileId", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceFact_profileId_code_key" ON "EvidenceFact"("profileId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_firstSeenAt_idx" ON "Job"("status", "firstSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_sourceType_sourceName_externalId_key" ON "JobSource"("sourceType", "sourceName", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceConfig_sourceType_identifier_key" ON "SourceConfig"("sourceType", "identifier");

-- CreateIndex
CREATE INDEX "JobMatch_profileId_tier_score_idx" ON "JobMatch"("profileId", "tier", "score");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatch_profileId_jobId_key" ON "JobMatch"("profileId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_profileId_jobId_key" ON "Application"("profileId", "jobId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_profileId_jobId_kind_idx" ON "GeneratedDocument"("profileId", "jobId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_profileId_dedupeKey_key" ON "Notification"("profileId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSignal_profileId_provider_messageId_key" ON "EmailSignal"("profileId", "provider", "messageId");
