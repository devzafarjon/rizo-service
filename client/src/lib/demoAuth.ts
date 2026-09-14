import type { PortalCustomer, Role, User } from "./types";

export const USER_KEY = "fsm_user";
export const PORTAL_USER_KEY = "fsm_portal_user";

export const DEMO_STAFF: Record<Role, User> = {
  dispatcher: {
    id: "demo-dispatcher",
    name: "Bekzod Tursunov",
    email: "dispatcher@rizo.local",
    role: "dispatcher",
    phone: "+998 90 222 22 22",
  },
  technician: {
    id: "demo-technician",
    name: "Javlon Rahimov",
    email: "tech@rizo.local",
    role: "technician",
    phone: "+998 90 333 33 33",
  },
};

export const DEMO_PORTAL: PortalCustomer = {
  id: "demo-portal",
  name: "Baraka Market",
  email: "baraka@shop.uz",
  phone: "+998 71 200 10 10",
  emailVerified: true,
  locations: [
    { id: "demo-baraka-1", address: "Amir Temur 12", city: "Toshkent" },
    { id: "demo-baraka-2", address: "Chilonzor 9-kvartal 4", city: "Toshkent" },
  ],
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function readStoredUser(): User | null {
  const user = readJson<User>(USER_KEY);
  if (!user?.id || (user.role !== "dispatcher" && user.role !== "technician")) {
    return null;
  }
  return user;
}

export function writeStoredUser(user: User | null) {
  if (!user) {
    localStorage.removeItem(USER_KEY);
    return;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function readStoredPortal(): PortalCustomer | null {
  const customer = readJson<PortalCustomer>(PORTAL_USER_KEY);
  if (!customer?.id || !customer.name) {
    return null;
  }
  if (customer.id === DEMO_PORTAL.id) {
    return { ...DEMO_PORTAL };
  }
  return customer;
}

export function writeStoredPortal(customer: PortalCustomer | null) {
  if (!customer) {
    localStorage.removeItem(PORTAL_USER_KEY);
    return;
  }
  localStorage.setItem(PORTAL_USER_KEY, JSON.stringify(customer));
}
