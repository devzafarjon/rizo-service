import type { Role } from "@prisma/client";

export type AuthUser = {
  userId: string;
  role: Role;
  email: string;
};

export type PortalCustomer = {
  customerId: string;
  email: string;
  scope: "customer";
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      customer?: PortalCustomer;
    }
  }
}

export {};
