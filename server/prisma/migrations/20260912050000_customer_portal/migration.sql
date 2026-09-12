-- AlterTable
ALTER TABLE "customers" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "customers" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "submitted_by_customer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "jobs" ADD COLUMN "related_sale_id" TEXT;

-- AlterTable
ALTER TABLE "job_notes" ADD COLUMN "visible_to_customer" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sold_on" DATE NOT NULL,
    "notes" TEXT,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feedback_job_id_key" ON "feedback"("job_id");
CREATE INDEX "feedback_customer_id_idx" ON "feedback"("customer_id");

ALTER TABLE "feedback" ADD CONSTRAINT "feedback_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "customer_auth_tokens" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_auth_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_auth_tokens_token_hash_key" ON "customer_auth_tokens"("token_hash");
CREATE INDEX "customer_auth_tokens_customer_id_idx" ON "customer_auth_tokens"("customer_id");

ALTER TABLE "customer_auth_tokens" ADD CONSTRAINT "customer_auth_tokens_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_related_sale_id_fkey" FOREIGN KEY ("related_sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
