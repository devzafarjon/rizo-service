import type { Role } from "@prisma/client";

export type AuthUser = {
  userId: string;
  role: Role;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
