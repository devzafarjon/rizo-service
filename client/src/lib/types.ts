export type Role = "admin" | "dispatcher" | "technician";
export type JobStatus = "new" | "scheduled" | "in_progress" | "completed" | "cancelled" | "invoiced";
export type Priority = "low" | "medium" | "high" | "urgent";
export type InvoiceStatus = "draft" | "sent" | "paid";

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
  };
  recentJobs: Job[];
};
