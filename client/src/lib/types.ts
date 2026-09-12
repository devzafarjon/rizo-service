export type Role = "dispatcher" | "technician";
export type JobStatus = "new" | "scheduled" | "in_progress" | "completed" | "cancelled" | "invoiced";
export type JobKind = "installation" | "maintenance" | "repair";
export type Priority = "low" | "medium" | "high" | "urgent";
export type InvoiceStatus = "draft" | "sent" | "paid";

export type ChecklistItem = { id: string; done: boolean };

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  maintenanceIntervalMonths: number;
  nextMaintenanceOn: string | null;
  createdAt: string;
  locations?: ServiceLocation[];
  _count?: { jobs: number };
};

export type ServiceLocation = {
  id: string;
  customerId: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
};

export type JobNote = {
  id: string;
  jobId: string;
  userId: string;
  noteText: string;
  visibleToCustomer?: boolean;
  createdAt: string;
  user: { id: string; name: string };
};

export type JobPhoto = {
  id: string;
  jobId: string;
  photoUrl: string;
  uploadedBy: string;
  createdAt: string;
};

export type PartUsed = {
  id: string;
  jobId: string;
  partName: string;
  quantity: number;
  unitCost: number;
};

export type Invoice = {
  id: string;
  jobId: string;
  amount: number;
  status: InvoiceStatus;
  createdAt: string;
};

export type Job = {
  id: string;
  title: string;
  description: string | null;
  kind: JobKind;
  orderRef: string | null;
  checklist: ChecklistItem[];
  status: JobStatus;
  priority: Priority;
  customerId: string;
  locationId: string;
  assignedTechnicianId: string | null;
  scheduledDate: string | null;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  laborHours: number | null;
  customer: Customer;
  location: ServiceLocation;
  assignedTechnician: User | null;
  notes: JobNote[];
  photos: JobPhoto[];
  partsUsed: PartUsed[];
  invoices: Invoice[];
  submittedByCustomer?: boolean;
};

export type PortalSale = {
  id: string;
  productName: string;
  soldOn: string;
  notes: string | null;
};

export type PortalJob = {
  id: string;
  title: string;
  description: string | null;
  kind: JobKind;
  status: JobStatus;
  orderRef: string | null;
  submittedByCustomer: boolean;
  scheduledDate: string | null;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
  createdAt: string;
  completedAt: string | null;
  location: { id: string; address: string; city: string };
  technicianName: string | null;
  relatedSale: { id: string; productName: string } | null;
  notes: Array<{ id: string; noteText: string; createdAt: string }>;
  payment: { id: string | null; amount: number; status: InvoiceStatus | "draft" } | null;
  feedback: { id: string; rating: number; comment: string | null; createdAt: string } | null;
};

export type PortalCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  locations?: Array<{ id: string; address: string; city: string }>;
};

export type DashboardData = {
  stats: {
    openJobs: number;
    invoicesDue: number;
    overdue: number;
    unassigned: number;
    urgent: number;
    todayJobs: number;
    completedToday: number;
    dueAmount: number;
    installationsOpen: number;
    maintenanceOpen: number;
    maintenanceDue: number;
  };
  maintenanceDueShops: Array<{
    id: string;
    name: string;
    phone: string | null;
    nextMaintenanceOn: string | null;
    maintenanceIntervalMonths: number;
  }>;
  recentJobs: Job[];
};
