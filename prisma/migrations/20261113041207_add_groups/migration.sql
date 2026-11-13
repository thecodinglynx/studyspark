-- AlterTable
ALTER TABLE "InviteCode" ADD COLUMN     "groupId" TEXT;

-- AlterTable
ALTER TABLE "SubjectShare" ADD COLUMN     "groupId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupSubject" (
    "groupId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "role" "ShareRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupSubject_pkey" PRIMARY KEY ("groupId","subjectId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- CreateIndex
CREATE INDEX "GroupSubject_subjectId_idx" ON "GroupSubject"("subjectId");

-- CreateIndex
CREATE INDEX "SubjectShare_groupId_idx" ON "SubjectShare"("groupId");

-- CreateIndex
CREATE INDEX "User_groupId_idx" ON "User"("groupId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectShare" ADD CONSTRAINT "SubjectShare_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteCode" ADD CONSTRAINT "InviteCode_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSubject" ADD CONSTRAINT "GroupSubject_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSubject" ADD CONSTRAINT "GroupSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing invite codes each get a group of their own, named after the code, so
-- people who sign up with them from now on are grouped. Nobody is moved: who
-- used each code was never recorded, so an admin places existing users.
WITH created AS (
    INSERT INTO "Group" ("id", "name", "createdAt", "updatedAt")
    SELECT 'g' || md5(random()::text || c."id"), c."code", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "InviteCode" c
    RETURNING "id", "name"
)
UPDATE "InviteCode" c
SET "groupId" = created."id"
FROM created
WHERE created."name" = c."code";
