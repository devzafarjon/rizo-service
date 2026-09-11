-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('installation', 'maintenance', 'repair');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "maintenance_interval_months" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "customers" ADD COLUMN "next_maintenance_on" DATE;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "kind" "JobKind" NOT NULL DEFAULT 'repair';
ALTER TABLE "jobs" ADD COLUMN "order_ref" TEXT;
ALTER TABLE "jobs" ADD COLUMN "checklist" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "jobs_kind_idx" ON "jobs"("kind");
