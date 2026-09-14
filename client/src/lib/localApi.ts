import { DEMO_STAFF, readStoredUser } from "./demoAuth";
import { LABOR_RATE } from "./invoice";
import { canMoveJob } from "./jobFlow";
import type {
  ChecklistItem,
  Customer,
  Invoice,
  InvoiceStatus,
  Job,
  JobKind,
  JobNote,
  JobStatus,
  PartUsed,
  PortalJob,
  PortalSale,
  Priority,
  ServiceLocation,
  User,
} from "./types";

const DB_KEY = "fsm_demo_db";
const DB_VERSION = 2;

const TECH_2: User = {
  id: "demo-technician-2",
  name: "Dilnoza Saidova",
  email: "tech2@rizo.local",
  role: "technician",
  phone: "+998 90 444 44 44",
};

const USERS: User[] = [DEMO_STAFF.dispatcher, DEMO_STAFF.technician, TECH_2];

type Sale = PortalSale & { customerId: string };
type FeedbackRow = {
  id: string;
  jobId: string;
  customerId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};
type LocalJob = Job & { relatedSaleId?: string | null };

type DemoDb = {
  version: number;
  customers: Customer[];
  locations: ServiceLocation[];
  jobs: LocalJob[];
  sales: Sale[];
  invoices: Invoice[];
  feedback: FeedbackRow[];
};

function calendarDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
}

function dayStamp(offset = 0) {
  const date = new Date(`${calendarDate()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString();
}

function nowStamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

function newId() {
  return `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function checklist(kind: JobKind): ChecklistItem[] {
  const ids =
    kind === "installation"
      ? ["confirm_order", "install_pos", "connect_peripherals", "network_login", "train_staff", "handover"]
      : kind === "maintenance"
        ? ["inspect_hardware", "update_software", "test_receipts", "backup_reports", "clean_hardware", "schedule_next"]
        : ["diagnose", "fix_or_replace", "test_after", "photo_result"];
  return ids.map((id) => ({ id, done: false }));
}

function userById(id: string | null | undefined) {
  return USERS.find((user) => user.id === id) ?? null;
}

function seed(): DemoDb {
  const today = dayStamp(0);
  const yesterday = dayStamp(-1);
  const tomorrow = dayStamp(1);
  const created = nowStamp();

  const locations: ServiceLocation[] = [
    { id: "demo-baraka-1", customerId: "demo-portal", address: "Amir Temur 12", city: "Toshkent", lat: 41.3111, lng: 69.2797, notes: "Asosiy do‘kon" },
    { id: "demo-baraka-2", customerId: "demo-portal", address: "Chilonzor 9-kvartal 4", city: "Toshkent", lat: 41.285, lng: 69.204, notes: "2-filial" },
    { id: "demo-nur-1", customerId: "demo-nur", address: "Bobur 88", city: "Toshkent", lat: 41.2995, lng: 69.2401, notes: "Savdo zali" },
    { id: "demo-fashion-1", customerId: "demo-fashion", address: "Chorsu bozori, 2-qavat", city: "Toshkent", lat: 41.326, lng: 69.235, notes: null },
    { id: "demo-fresh-1", customerId: "demo-fresh", address: "Yunusobod 19", city: "Toshkent", lat: 41.364, lng: 69.289, notes: null },
  ];

  const customers: Customer[] = [
    { id: "demo-portal", name: "Baraka Market", phone: "+998 71 200 10 10", email: "baraka@shop.uz", notes: "3 ta filial. RIZO kassa va tovar hisobi.", maintenanceIntervalMonths: 3, nextMaintenanceOn: tomorrow, createdAt: created },
    { id: "demo-nur", name: "Nur Electronics", phone: "+998 90 555 01 01", email: "nur@electro.uz", notes: "Katta ombor + vitrina. Skanner va chek printer.", maintenanceIntervalMonths: 2, nextMaintenanceOn: yesterday, createdAt: created },
    { id: "demo-fashion", name: "Chorsu Fashion", phone: "+998 93 700 22 33", email: null, notes: "Kiyim do‘koni. Mijozlar sodiqlik dasturi kerak.", maintenanceIntervalMonths: 3, nextMaintenanceOn: today, createdAt: created },
    { id: "demo-fresh", name: "Green Fresh", phone: "+998 97 111 45 45", email: "hello@greenfresh.uz", notes: "Oziq-ovqat. Tarozi va tezkor kassa.", maintenanceIntervalMonths: 3, nextMaintenanceOn: tomorrow, createdAt: created },
  ];

  const sales: Sale[] = [
    { id: "demo-sale-1", customerId: "demo-portal", productName: "RIZO kassa + chek printer", soldOn: yesterday, notes: "Asosiy do‘kon" },
    { id: "demo-sale-2", customerId: "demo-nur", productName: "RIZO kassa + skanner", soldOn: yesterday, notes: null },
    { id: "demo-sale-3", customerId: "demo-fresh", productName: "Tarozi integratsiyasi", soldOn: yesterday, notes: null },
  ];

  const invoices: Invoice[] = [{ id: "demo-inv-1", jobId: "demo-job-7", amount: 420000, status: "sent", createdAt: yesterday }];
  const feedback: FeedbackRow[] = [
    { id: "demo-fb-1", jobId: "demo-job-7", customerId: "demo-fresh", rating: 5, comment: "Tarozi tez ulandi, kassirlar rozi.", createdAt: yesterday },
  ];

  const jobs: LocalJob[] = [
    makeJob({ id: "demo-job-1", title: "RIZO kassa o‘rnatish", description: "Yangi buyurtma ORD-1042: terminal, chek printer va xodimlarni o‘qitish.", kind: "installation", orderRef: "ORD-1042", status: "scheduled", priority: "high", customerId: "demo-portal", locationId: "demo-baraka-1", assignedTechnicianId: "demo-technician", scheduledDate: today, scheduledTimeStart: "09:00", scheduledTimeEnd: "11:00", notes: [note("demo-job-1", DEMO_STAFF.dispatcher, "Mijoz ertalab ochilishidan oldin kelishni so‘radi.", true)] }),
    makeJob({ id: "demo-job-2", title: "Kassa qutisi ta’miri", description: "Chek chiqmayapti. Printerni tekshirish.", kind: "repair", status: "in_progress", priority: "urgent", customerId: "demo-nur", locationId: "demo-nur-1", assignedTechnicianId: "demo-technician", scheduledDate: today, scheduledTimeStart: "12:00", scheduledTimeEnd: "13:30", startedAt: dayStamp(0).replace("T00:00:00.000Z", "T07:05:00.000Z"), partsUsed: [part("demo-job-2", "Chek lenti 80mm", 2, 35000)], notes: [note("demo-job-2", DEMO_STAFF.technician, "Printer ulangan, drajver yangilanmoqda.")] }),
    makeJob({ id: "demo-job-3", title: "Skanner sozlash", description: "Shtrix-kod o‘qimayapti. Ombor tomoni.", kind: "repair", status: "scheduled", priority: "medium", customerId: "demo-nur", locationId: "demo-nur-1", assignedTechnicianId: "demo-technician-2", scheduledDate: today, scheduledTimeStart: "10:00", scheduledTimeEnd: "11:00" }),
    makeJob({ id: "demo-job-4", title: "Sodiqlik dasturi sozlash", description: "Yangi buyurtma: mijoz kartalari va keshbek qoidalari.", kind: "installation", orderRef: "ORD-1108", status: "new", priority: "medium", customerId: "demo-fashion", locationId: "demo-fashion-1" }),
    makeJob({ id: "demo-job-5", title: "2-filialga RIZO ulash", description: "Yangi buyurtma ORD-1055: Chilonzor filiali. Tarmoq va kassa.", kind: "installation", orderRef: "ORD-1055", status: "scheduled", priority: "high", customerId: "demo-portal", locationId: "demo-baraka-2", assignedTechnicianId: "demo-technician-2", scheduledDate: tomorrow, scheduledTimeStart: "09:30", scheduledTimeEnd: "12:00" }),
    makeJob({ id: "demo-job-6", title: "Kassirlarni o‘qitish", description: "Smena ochish, qaytarish, hisobot — o‘rnatishdan keyingi o‘qitish.", kind: "installation", orderRef: "ORD-980", status: "completed", priority: "low", customerId: "demo-fresh", locationId: "demo-fresh-1", assignedTechnicianId: "demo-technician-2", scheduledDate: yesterday, scheduledTimeStart: "14:00", scheduledTimeEnd: "16:00", startedAt: dayStamp(-1).replace("T00:00:00.000Z", "T09:00:00.000Z"), completedAt: dayStamp(-1).replace("T00:00:00.000Z", "T11:10:00.000Z"), laborHours: 2, partsUsed: [part("demo-job-6", "O‘quv qo‘llanma", 3, 15000)], notes: [note("demo-job-6", TECH_2, "3 kassir o‘qitildi. Hisobot Telegramga ulandi.", true)] }),
    makeJob({ id: "demo-job-7", title: "Tarozi integratsiyasi", description: "Yangi buyurtma: og‘irlikni kassaga uzatish.", kind: "installation", orderRef: "ORD-991", status: "invoiced", priority: "medium", customerId: "demo-fresh", locationId: "demo-fresh-1", assignedTechnicianId: "demo-technician", scheduledDate: yesterday, scheduledTimeStart: "10:00", scheduledTimeEnd: "12:00", startedAt: dayStamp(-1).replace("T00:00:00.000Z", "T05:00:00.000Z"), completedAt: dayStamp(-1).replace("T00:00:00.000Z", "T07:00:00.000Z"), laborHours: 2, partsUsed: [part("demo-job-7", "Tarozi kabeli", 1, 120000)] }),
    makeJob({ id: "demo-job-8", title: "Rejali texnik xizmat", description: "Kassa, printer va skannerni tekshirish. Drajver va litsenziyani yangilash.", kind: "maintenance", status: "scheduled", priority: "medium", customerId: "demo-nur", locationId: "demo-nur-1", assignedTechnicianId: "demo-technician-2", scheduledDate: today, scheduledTimeStart: "16:00", scheduledTimeEnd: "17:30" }),
    makeJob({ id: "demo-job-9", title: "Chek printer ishlamayapti", description: "Do‘kondan: kechagi smenadan beri chek chiqmayapti. Lenta bor.", kind: "repair", status: "new", priority: "high", customerId: "demo-portal", locationId: "demo-baraka-1", submittedByCustomer: true, relatedSaleId: "demo-sale-1" }),
    makeJob({ id: "demo-job-10", title: "Kassa drajverini yangilash", description: "Printer drajveri yangilandi. Chek yana chiqyapti.", kind: "repair", status: "completed", priority: "medium", customerId: "demo-portal", locationId: "demo-baraka-1", assignedTechnicianId: "demo-technician", scheduledDate: yesterday, scheduledTimeStart: "15:00", scheduledTimeEnd: "16:00", startedAt: dayStamp(-1).replace("T00:00:00.000Z", "T10:00:00.000Z"), completedAt: dayStamp(-1).replace("T00:00:00.000Z", "T11:00:00.000Z"), laborHours: 1, notes: [note("demo-job-10", DEMO_STAFF.technician, "Drajver o‘rnatildi. Iltimos, kechki smenada chekni tekshiring.", true)] }),
  ];

  return { version: DB_VERSION, customers, locations, jobs, sales, invoices, feedback };
}

function note(jobId: string, user: User, noteText: string, visible = false): JobNote {
  return { id: `${jobId}-note-${user.id}`, jobId, userId: user.id, noteText, visibleToCustomer: visible, createdAt: nowStamp(), user: { id: user.id, name: user.name } };
}

function part(jobId: string, partName: string, quantity: number, unitCost: number): PartUsed {
  return { id: `${jobId}-part`, jobId, partName, quantity, unitCost };
}

function makeJob(input: Partial<LocalJob> & Pick<LocalJob, "id" | "title" | "kind" | "status" | "priority" | "customerId" | "locationId">): LocalJob {
  return {
    description: null,
    orderRef: null,
    checklist: checklist(input.kind),
    assignedTechnicianId: null,
    scheduledDate: null,
    scheduledTimeStart: null,
    scheduledTimeEnd: null,
    createdAt: nowStamp(),
    startedAt: null,
    completedAt: null,
    laborHours: null,
    customer: emptyCustomer(input.customerId),
    location: emptyLocation(input.locationId, input.customerId),
    assignedTechnician: null,
    notes: [],
    photos: [],
    partsUsed: [],
    invoices: [],
    submittedByCustomer: false,
    relatedSaleId: null,
    ...input,
  };
}

function emptyCustomer(id: string): Customer {
  return { id, name: "", phone: null, email: null, notes: null, maintenanceIntervalMonths: 3, nextMaintenanceOn: null, createdAt: nowStamp() };
}

function emptyLocation(id: string, customerId: string): ServiceLocation {
  return { id, customerId, address: "", city: "", lat: null, lng: null, notes: null };
}

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      const fresh = seed();
      save(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as DemoDb;
    if (parsed.version !== DB_VERSION || !Array.isArray(parsed.jobs)) {
      const fresh = seed();
      save(fresh);
      return fresh;
    }
    return parsed;
  } catch {
    const fresh = seed();
    save(fresh);
    return fresh;
  }
}

function save(db: DemoDb) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function customerOf(db: DemoDb, id: string) {
  return db.customers.find((item) => item.id === id) ?? emptyCustomer(id);
}

function locationOf(db: DemoDb, id: string, customerId: string) {
  return db.locations.find((item) => item.id === id) ?? emptyLocation(id, customerId);
}

function hydrate(db: DemoDb, job: LocalJob): LocalJob {
  const invoices = db.invoices.filter((item) => item.jobId === job.id);
  return {
    ...job,
    customer: customerOf(db, job.customerId),
    location: locationOf(db, job.locationId, job.customerId),
    assignedTechnician: userById(job.assignedTechnicianId),
    invoices,
  };
}

function saveJob(db: DemoDb, job: LocalJob) {
  const index = db.jobs.findIndex((item) => item.id === job.id);
  if (index === -1) {
    db.jobs.unshift(job);
  } else {
    db.jobs[index] = job;
  }
  save(db);
  return hydrate(db, job);
}

function parse(path: string, options: RequestInit) {
  const url = new URL(path, "https://fsm.local");
  return {
    method: (options.method ?? "GET").toUpperCase(),
    pathname: url.pathname.replace(/\/$/, "") || "/",
    query: url.searchParams,
    body: options.body ? (JSON.parse(String(options.body)) as Record<string, unknown>) : {},
  };
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function fail(status: number, message: string): never {
  throw new ApiError(message, status);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function invoiceAmount(job: LocalJob) {
  const parts = job.partsUsed.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  return Math.round((parts + (job.laborHours ?? 0) * LABOR_RATE) * 100) / 100;
}

function serializePortal(db: DemoDb, job: LocalJob): PortalJob {
  const live = hydrate(db, job);
  const publicInvoices = live.invoices
    .filter((item) => item.status === "sent" || item.status === "paid")
    .map((item) => ({ id: item.id, amount: item.amount, status: item.status }));
  const computed = live.status === "completed" || live.status === "invoiced" ? invoiceAmount(live) : null;
  const sale = live.relatedSaleId ? db.sales.find((item) => item.id === live.relatedSaleId) : null;
  const fb = db.feedback.find((item) => item.jobId === live.id);
  return {
    id: live.id,
    title: live.title,
    description: live.description,
    kind: live.kind,
    status: live.status,
    orderRef: live.orderRef,
    submittedByCustomer: Boolean(live.submittedByCustomer),
    scheduledDate: live.scheduledDate,
    scheduledTimeStart: live.scheduledTimeStart,
    scheduledTimeEnd: live.scheduledTimeEnd,
    createdAt: live.createdAt,
    completedAt: live.completedAt,
    location: { id: live.location.id, address: live.location.address, city: live.location.city },
    technicianName: live.assignedTechnician?.name.split(/\s+/)[0] ?? null,
    relatedSale: sale ? { id: sale.id, productName: sale.productName } : null,
    notes: live.notes.filter((item) => item.visibleToCustomer).map((item) => ({ id: item.id, noteText: item.noteText, createdAt: item.createdAt })),
    payment:
      publicInvoices[0] ??
      (computed != null ? { id: null, amount: computed, status: live.status === "invoiced" ? "paid" : "draft" } : null),
    feedback: fb ? { id: fb.id, rating: fb.rating, comment: fb.comment, createdAt: fb.createdAt } : null,
  };
}

export function handleStaffApi(path: string, options: RequestInit = {}): unknown {
  const { method, pathname, query, body } = parse(path, options);
  const db = load();
  const actor = readStoredUser();

  if (pathname === "/customers" && method === "GET") {
    const q = query.get("q")?.trim().toLowerCase() ?? "";
    const customers = db.customers
      .filter((item) => !q || item.name.toLowerCase().includes(q) || (item.phone ?? "").includes(q) || (item.email ?? "").toLowerCase().includes(q))
      .map((item) => ({
        ...item,
        locations: db.locations.filter((loc) => loc.customerId === item.id),
        _count: { jobs: db.jobs.filter((job) => job.customerId === item.id).length },
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { customers };
  }

  const customerMatch = pathname.match(/^\/customers\/([^/]+)$/);
  if (customerMatch && method === "GET") {
    const customer = db.customers.find((item) => item.id === customerMatch[1]);
    if (!customer) fail(404, "Customer not found");
    return {
      customer: {
        ...customer,
        locations: db.locations.filter((loc) => loc.customerId === customer.id),
        jobs: db.jobs
          .filter((job) => job.customerId === customer.id)
          .map((job) => {
            const live = hydrate(db, job);
            return { id: live.id, title: live.title, status: live.status, kind: live.kind, createdAt: live.createdAt, location: live.location, assignedTechnician: live.assignedTechnician ? { id: live.assignedTechnician.id, name: live.assignedTechnician.name } : null };
          }),
      },
    };
  }
  if (pathname === "/customers" && method === "POST") {
    const name = asString(body.name).trim();
    if (!name) fail(400, "Invalid customer");
    const nextOn = asString(body.nextMaintenanceOn);
    const customer: Customer = {
      id: newId(),
      name,
      phone: asString(body.phone).trim() || null,
      email: asString(body.email).trim() || null,
      notes: asString(body.notes).trim() || null,
      maintenanceIntervalMonths: Number(body.maintenanceIntervalMonths || 3),
      nextMaintenanceOn: nextOn ? `${nextOn}T00:00:00.000Z` : null,
      createdAt: nowStamp(),
    };
    db.customers.unshift(customer);
    save(db);
    return { customer: { ...customer, locations: [], _count: { jobs: 0 } } };
  }
  if (customerMatch && method === "PATCH") {
    const customer = db.customers.find((item) => item.id === customerMatch[1]);
    if (!customer) fail(404, "Customer not found");
    if (body.name !== undefined) customer.name = asString(body.name).trim();
    if (body.phone !== undefined) customer.phone = asString(body.phone).trim() || null;
    if (body.email !== undefined) customer.email = asString(body.email).trim() || null;
    if (body.notes !== undefined) customer.notes = asString(body.notes).trim() || null;
    if (body.maintenanceIntervalMonths !== undefined) customer.maintenanceIntervalMonths = Number(body.maintenanceIntervalMonths);
    if (body.nextMaintenanceOn !== undefined) customer.nextMaintenanceOn = body.nextMaintenanceOn ? `${asString(body.nextMaintenanceOn)}T00:00:00.000Z` : null;
    save(db);
    return { customer: { ...customer, locations: db.locations.filter((loc) => loc.customerId === customer.id), _count: { jobs: db.jobs.filter((job) => job.customerId === customer.id).length } } };
  }
  if (customerMatch && method === "DELETE") {
    if (db.jobs.some((job) => job.customerId === customerMatch[1])) fail(400, "Cannot delete a customer with jobs");
    const before = db.customers.length;
    db.customers = db.customers.filter((item) => item.id !== customerMatch[1]);
    db.locations = db.locations.filter((item) => item.customerId !== customerMatch[1]);
    if (db.customers.length === before) fail(404, "Customer not found");
    save(db);
    return undefined;
  }
  const locMatch = pathname.match(/^\/customers\/([^/]+)\/locations$/);
  if (locMatch && method === "POST") {
    if (!db.customers.some((item) => item.id === locMatch[1])) fail(404, "Customer not found");
    const location: ServiceLocation = {
      id: newId(),
      customerId: locMatch[1],
      address: asString(body.address).trim(),
      city: asString(body.city).trim(),
      lat: typeof body.lat === "number" ? body.lat : null,
      lng: typeof body.lng === "number" ? body.lng : null,
      notes: asString(body.notes).trim() || null,
    };
    db.locations.push(location);
    save(db);
    return { location };
  }

  if (pathname === "/jobs" && method === "GET") {
    let jobs = db.jobs.map((job) => hydrate(db, job));
    if (query.get("mine") === "1" || actor?.role === "technician") {
      jobs = jobs.filter((job) => job.assignedTechnicianId === actor?.id);
    }
    const status = query.get("status");
    const priority = query.get("priority");
    const kind = query.get("kind");
    const technicianId = query.get("technicianId");
    const q = query.get("q")?.trim().toLowerCase() ?? "";
    if (status) jobs = jobs.filter((job) => job.status === status);
    if (priority) jobs = jobs.filter((job) => job.priority === priority);
    if (kind) jobs = jobs.filter((job) => job.kind === kind);
    if (technicianId) jobs = jobs.filter((job) => job.assignedTechnicianId === technicianId);
    if (q) {
      jobs = jobs.filter((job) => job.title.toLowerCase().includes(q) || job.customer.name.toLowerCase().includes(q) || job.location.address.toLowerCase().includes(q) || (job.orderRef ?? "").toLowerCase().includes(q));
    }
    jobs.sort((a, b) => (a.scheduledDate ?? "9").localeCompare(b.scheduledDate ?? "9") || b.createdAt.localeCompare(a.createdAt));
    return { jobs };
  }

  if (pathname === "/jobs" && method === "POST") {
    const customerId = asString(body.customerId);
    const locationId = asString(body.locationId);
    if (!customerId || !locationId) fail(400, "Invalid job");
    if (!db.locations.some((loc) => loc.id === locationId && loc.customerId === customerId)) fail(400, "Location does not belong to this customer");
    const assigned = asString(body.assignedTechnicianId) || null;
    const date = asString(body.scheduledDate) ? `${asString(body.scheduledDate)}T00:00:00.000Z` : null;
    const kind = (asString(body.kind) as JobKind) || "repair";
    const job = makeJob({
      id: newId(),
      title: asString(body.title).trim(),
      description: asString(body.description).trim() || null,
      kind,
      orderRef: kind === "installation" ? asString(body.orderRef).trim() || null : null,
      status: assigned && date ? "scheduled" : "new",
      priority: (asString(body.priority) as Priority) || "medium",
      customerId,
      locationId,
      assignedTechnicianId: assigned,
      scheduledDate: date,
      scheduledTimeStart: asString(body.scheduledTimeStart) || null,
      scheduledTimeEnd: asString(body.scheduledTimeEnd) || null,
    });
    return { job: saveJob(db, job) };
  }

  const jobMatch = pathname.match(/^\/jobs\/([^/]+)$/);
  if (jobMatch && method === "GET") {
    const job = db.jobs.find((item) => item.id === jobMatch[1]);
    if (!job) fail(404, "Job not found");
    if (actor?.role === "technician" && job.assignedTechnicianId !== actor.id) fail(403, "Forbidden");
    return { job: hydrate(db, job) };
  }
  if (jobMatch && method === "PATCH") {
    const job = db.jobs.find((item) => item.id === jobMatch[1]);
    if (!job) fail(404, "Job not found");
    if (job.status === "cancelled" || job.status === "invoiced") fail(400, "Job is closed");
    if (body.title !== undefined) job.title = asString(body.title).trim();
    if (body.description !== undefined) job.description = asString(body.description).trim() || null;
    if (body.priority !== undefined) job.priority = asString(body.priority) as Priority;
    if (body.kind !== undefined && body.kind !== job.kind) {
      job.kind = asString(body.kind) as JobKind;
      job.checklist = checklist(job.kind);
    }
    job.orderRef = job.kind === "installation" ? (body.orderRef !== undefined ? asString(body.orderRef).trim() || null : job.orderRef) : null;
    if (body.customerId !== undefined) job.customerId = asString(body.customerId);
    if (body.locationId !== undefined) job.locationId = asString(body.locationId);
    if (body.assignedTechnicianId !== undefined) job.assignedTechnicianId = asString(body.assignedTechnicianId) || null;
    if (body.scheduledDate !== undefined) job.scheduledDate = body.scheduledDate ? `${asString(body.scheduledDate).slice(0, 10)}T00:00:00.000Z` : null;
    if (body.scheduledTimeStart !== undefined) job.scheduledTimeStart = asString(body.scheduledTimeStart) || null;
    if (body.scheduledTimeEnd !== undefined) job.scheduledTimeEnd = asString(body.scheduledTimeEnd) || null;
    if (job.status === "new" && job.assignedTechnicianId && job.scheduledDate) job.status = "scheduled";
    if ((job.status === "scheduled" || job.status === "in_progress") && !job.assignedTechnicianId) job.status = "new";
    if (job.status === "scheduled" && !job.scheduledDate) job.status = "new";
    return { job: saveJob(db, job) };
  }

  const statusMatch = pathname.match(/^\/jobs\/([^/]+)\/status$/);
  if (statusMatch && method === "POST") {
    const job = db.jobs.find((item) => item.id === statusMatch[1]);
    if (!job) fail(404, "Job not found");
    if (actor?.role === "technician" && job.assignedTechnicianId !== actor.id) fail(403, "Forbidden");
    const next = asString(body.status) as JobStatus;
    if (!canMoveJob(job.status, next, actor?.role === "technician" ? "technician" : "dispatcher") && job.status !== next) {
      fail(actor?.role === "technician" ? 403 : 400, actor?.role === "technician" ? "Forbidden status change" : "Invalid status change");
    }
    if (next === "in_progress" && !job.startedAt) job.startedAt = nowStamp();
    if (next === "completed") {
      job.completedAt = nowStamp();
      if (job.laborHours == null) job.laborHours = 1;
    }
    if (next === "cancelled") job.completedAt = nowStamp();
    if (next === "new") job.assignedTechnicianId = null;
    job.status = next;
    return { job: saveJob(db, job) };
  }

  const noteMatch = pathname.match(/^\/jobs\/([^/]+)\/notes$/);
  if (noteMatch && method === "POST") {
    const job = db.jobs.find((item) => item.id === noteMatch[1]);
    if (!job) fail(404, "Job not found");
    const text = asString(body.noteText).trim();
    if (!text) fail(400, "Note is required");
    job.notes.unshift(note(job.id, actor ?? DEMO_STAFF.dispatcher, text, Boolean(body.visibleToCustomer)));
    job.notes[0].id = newId();
    return { job: saveJob(db, job) };
  }
  const checkMatch = pathname.match(/^\/jobs\/([^/]+)\/checklist$/);
  if (checkMatch && method === "POST") {
    const job = db.jobs.find((item) => item.id === checkMatch[1]);
    if (!job) fail(404, "Job not found");
    job.checklist = job.checklist.map((item) => (item.id === asString(body.id) ? { ...item, done: Boolean(body.done) } : item));
    return { job: saveJob(db, job) };
  }
  const photoMatch = pathname.match(/^\/jobs\/([^/]+)\/photos$/);
  if (photoMatch && method === "POST") {
    const job = db.jobs.find((item) => item.id === photoMatch[1]);
    if (!job) fail(404, "Job not found");
    job.photos.unshift({ id: newId(), jobId: job.id, photoUrl: asString(body.photoUrl), uploadedBy: actor?.id ?? "demo-dispatcher", createdAt: nowStamp() });
    return { job: saveJob(db, job) };
  }
  const partMatch = pathname.match(/^\/jobs\/([^/]+)\/parts$/);
  if (partMatch && method === "POST") {
    const job = db.jobs.find((item) => item.id === partMatch[1]);
    if (!job) fail(404, "Job not found");
    job.partsUsed.push({ id: newId(), jobId: job.id, partName: asString(body.partName).trim(), quantity: Math.round(Number(body.quantity)), unitCost: Number(body.unitCost) });
    return { job: saveJob(db, job) };
  }

  if (pathname === "/dispatch/technicians" && method === "GET") {
    return { technicians: USERS.filter((user) => user.role === "technician") };
  }
  if (pathname === "/dispatch" && method === "GET") {
    const date = query.get("date") || calendarDate();
    const day = `${date}T00:00:00.000Z`;
    const jobs = db.jobs
      .map((job) => hydrate(db, job))
      .filter((job) => ["new", "scheduled", "in_progress"].includes(job.status) && (job.scheduledDate === day || (!job.scheduledDate && job.status === "new")));
    return { date, technicians: USERS.filter((user) => user.role === "technician"), jobs };
  }
  if (pathname === "/dispatch/auto-plan" && method === "POST") {
    const date = asString(body.date);
    if (!date) fail(400, "Invalid date");
    const day = `${date}T00:00:00.000Z`;
    const techs = USERS.filter((user) => user.role === "technician");
    const rank: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
    const load = new Map(techs.map((tech) => [tech.id, db.jobs.filter((job) => job.scheduledDate === day && job.assignedTechnicianId === tech.id && job.status !== "cancelled").length]));
    const open = db.jobs
      .filter((job) => !job.assignedTechnicianId && (job.status === "new" || job.status === "scheduled") && (job.scheduledDate === day || !job.scheduledDate))
      .sort((a, b) => rank[b.priority] - rank[a.priority]);
    const updated = open.map((job) => {
      let best = techs[0];
      for (const tech of techs) {
        if ((load.get(tech.id) ?? 0) < (load.get(best.id) ?? 0)) best = tech;
      }
      job.assignedTechnicianId = best.id;
      job.scheduledDate = day;
      job.status = "scheduled";
      load.set(best.id, (load.get(best.id) ?? 0) + 1);
      return hydrate(db, job);
    });
    save(db);
    return { assigned: updated.length, jobs: updated };
  }

  if (pathname === "/invoices" && method === "GET") {
    const status = query.get("status");
    const invoices = db.invoices
      .filter((item) => !status || item.status === status)
      .map((item) => {
        const job = db.jobs.find((row) => row.id === item.jobId);
        return { ...item, job: job ? hydrate(db, job) : null };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { invoices };
  }
  if (pathname === "/invoices" && method === "POST") {
    const job = db.jobs.find((item) => item.id === asString(body.jobId));
    if (!job) fail(404, "Job not found");
    if (job.status !== "completed") fail(400, "Invoice only from completed jobs");
    if (db.invoices.some((item) => item.jobId === job.id)) fail(400, "Invoice already exists");
    const invoice: Invoice = { id: newId(), jobId: job.id, amount: invoiceAmount(job), status: "draft", createdAt: nowStamp() };
    db.invoices.unshift(invoice);
    job.status = "invoiced";
    save(db);
    return { invoice };
  }
  const invMatch = pathname.match(/^\/invoices\/([^/]+)$/);
  if (invMatch && method === "GET") {
    const invoice = db.invoices.find((item) => item.id === invMatch[1]);
    if (!invoice) fail(404, "Invoice not found");
    const job = db.jobs.find((item) => item.id === invoice.jobId);
    return { invoice: { ...invoice, job: job ? hydrate(db, job) : null } };
  }
  if (invMatch && method === "PATCH") {
    const invoice = db.invoices.find((item) => item.id === invMatch[1]);
    if (!invoice) fail(404, "Invoice not found");
    invoice.status = asString(body.status) as InvoiceStatus;
    save(db);
    return { invoice };
  }

  if (pathname === "/dashboard" && method === "GET") {
    const today = dayStamp(0);
    const open = db.jobs.filter((job) => ["new", "scheduled", "in_progress"].includes(job.status));
    const due = db.invoices.filter((item) => item.status === "draft" || item.status === "sent");
    const shops = db.customers
      .filter((item) => item.nextMaintenanceOn && item.nextMaintenanceOn <= today)
      .sort((a, b) => (a.nextMaintenanceOn ?? "").localeCompare(b.nextMaintenanceOn ?? ""))
      .slice(0, 8)
      .map((item) => ({ id: item.id, name: item.name, phone: item.phone, nextMaintenanceOn: item.nextMaintenanceOn, maintenanceIntervalMonths: item.maintenanceIntervalMonths }));
    return {
      stats: {
        openJobs: open.length,
        invoicesDue: due.length,
        overdue: db.jobs.filter((job) => ["new", "scheduled"].includes(job.status) && job.scheduledDate && job.scheduledDate < today).length,
        unassigned: db.jobs.filter((job) => !job.assignedTechnicianId && ["new", "scheduled"].includes(job.status)).length,
        urgent: open.filter((job) => job.priority === "urgent").length,
        todayJobs: db.jobs.filter((job) => job.scheduledDate === today && job.status !== "cancelled").length,
        completedToday: db.jobs.filter((job) => ["completed", "invoiced"].includes(job.status) && job.completedAt && job.completedAt >= today).length,
        dueAmount: due.reduce((sum, item) => sum + item.amount, 0),
        installationsOpen: open.filter((job) => job.kind === "installation").length,
        maintenanceOpen: open.filter((job) => job.kind === "maintenance").length,
        maintenanceDue: shops.length,
      },
      maintenanceDueShops: shops,
      recentJobs: db.jobs.filter((job) => job.status !== "cancelled").slice(0, 6).map((job) => hydrate(db, job)),
    };
  }

  if (pathname === "/feedback" && method === "GET") {
    const items = db.feedback.map((item) => {
      const job = db.jobs.find((row) => row.id === item.jobId);
      const live = job ? hydrate(db, job) : null;
      return {
        id: item.id,
        rating: item.rating,
        comment: item.comment,
        createdAt: item.createdAt,
        customerName: customerOf(db, item.customerId).name,
        jobId: item.jobId,
        jobTitle: live?.title ?? "",
        kind: live?.kind ?? "repair",
        technicianName: live?.assignedTechnician?.name ?? null,
        technicianId: live?.assignedTechnician?.id ?? null,
      };
    });
    const byTech = new Map<string, { id: string; name: string; ratings: number[] }>();
    for (const item of items) {
      if (!item.technicianId || !item.technicianName) continue;
      const row = byTech.get(item.technicianId) ?? { id: item.technicianId, name: item.technicianName, ratings: [] };
      row.ratings.push(item.rating);
      byTech.set(item.technicianId, row);
    }
    const overall = items.length ? Math.round((items.reduce((sum, item) => sum + item.rating, 0) / items.length) * 10) / 10 : 0;
    return {
      overall: { average: overall, count: items.length },
      technicians: [...byTech.values()].map((tech) => ({
        id: tech.id,
        name: tech.name,
        count: tech.ratings.length,
        average: Math.round((tech.ratings.reduce((sum, value) => sum + value, 0) / tech.ratings.length) * 10) / 10,
      })),
      feedback: items.map(({ technicianId: _id, ...item }) => item),
    };
  }

  fail(404, "Not found");
}

export function handlePortalApi(path: string, options: RequestInit = {}): unknown {
  const { method, pathname, query, body } = parse(path, options);
  const db = load();
  const customerId = "demo-portal";

  if (pathname === "/jobs" && method === "GET") {
    const group = query.get("status");
    const kind = query.get("kind");
    let jobs = db.jobs.filter((job) => job.customerId === customerId);
    if (group === "active") jobs = jobs.filter((job) => ["new", "scheduled", "in_progress"].includes(job.status));
    if (group === "completed") jobs = jobs.filter((job) => ["completed", "invoiced", "cancelled"].includes(job.status));
    if (kind) jobs = jobs.filter((job) => job.kind === kind);
    jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { jobs: jobs.map((job) => serializePortal(db, job)) };
  }
  if (pathname === "/jobs" && method === "POST") {
    const kind = asString(body.kind) as JobKind;
    const description = asString(body.description).trim();
    if ((kind !== "repair" && kind !== "maintenance") || description.length < 4) fail(400, "Invalid request");
    const locationId = asString(body.locationId) || "demo-baraka-1";
    const title = asString(body.title).trim() || (kind === "repair" ? "Ta’mir so‘rovi" : "Texnik xizmat so‘rovi");
    const job = makeJob({
      id: newId(),
      title,
      description,
      kind,
      status: "new",
      priority: kind === "repair" ? "high" : "medium",
      customerId,
      locationId,
      submittedByCustomer: true,
      relatedSaleId: asString(body.relatedSaleId) || null,
    });
    saveJob(db, job);
    return { job: serializePortal(db, job) };
  }
  const jobMatch = pathname.match(/^\/jobs\/([^/]+)$/);
  if (jobMatch && method === "GET") {
    const job = db.jobs.find((item) => item.id === jobMatch[1] && item.customerId === customerId);
    if (!job) fail(404, "Request not found");
    return { job: serializePortal(db, job) };
  }
  const rateMatch = pathname.match(/^\/jobs\/([^/]+)\/feedback$/);
  if (rateMatch && method === "POST") {
    const job = db.jobs.find((item) => item.id === rateMatch[1] && item.customerId === customerId);
    if (!job) fail(404, "Request not found");
    if (job.status !== "completed" && job.status !== "invoiced") fail(400, "You can rate after the visit is finished");
    if (db.feedback.some((item) => item.jobId === job.id)) fail(400, "This visit is already rated");
    const rating = Number(body.rating);
    const row: FeedbackRow = { id: newId(), jobId: job.id, customerId, rating, comment: asString(body.comment).trim() || null, createdAt: nowStamp() };
    db.feedback.unshift(row);
    save(db);
    return { feedback: row };
  }
  if (pathname === "/sales" && method === "GET") {
    return { sales: db.sales.filter((item) => item.customerId === customerId) };
  }
  fail(404, "Not found");
}
