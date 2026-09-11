UPDATE "users" SET "role" = 'dispatcher' WHERE "role" = 'admin';

CREATE TYPE "Role_new" AS ENUM ('dispatcher', 'technician');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
