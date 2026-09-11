import type { Role } from "../../lib/api";
import type { MessageKey } from "../../i18n/messages";

export type NavItem = {
  to: string;
  labelKey: Extract<MessageKey, `nav.${string}`>;
  roles: Role[];
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", roles: ["dispatcher"] },
  { to: "/customers", labelKey: "nav.customers", roles: ["dispatcher"] },
  { to: "/jobs", labelKey: "nav.jobs", roles: ["dispatcher"] },
  { to: "/dispatch", labelKey: "nav.dispatch", roles: ["dispatcher"] },
  { to: "/invoices", labelKey: "nav.invoices", roles: ["dispatcher"] },
  { to: "/my-jobs", labelKey: "nav.myJobs", roles: ["technician"] },
];

export function navForRole(role: Role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
