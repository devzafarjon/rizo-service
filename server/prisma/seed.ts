import { PrismaClient, type JobKind, type Priority, type JobStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { defaultChecklist } from "../src/lib/checklists.ts";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "password123";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const dispatcher = await prisma.user.upsert({
    where: { email: "dispatcher@rizo.local" },
    update: { name: "Bekzod Tursunov", role: "dispatcher", phone: "+998 90 222 22 22", passwordHash },
    create: { name: "Bekzod Tursunov", email: "dispatcher@rizo.local", role: "dispatcher", phone: "+998 90 222 22 22", passwordHash },
  });
  const tech1 = await prisma.user.upsert({
    where: { email: "tech@rizo.local" },
    update: { name: "Javlon Rahimov", role: "technician", phone: "+998 90 333 33 33", passwordHash },
    create: { name: "Javlon Rahimov", email: "tech@rizo.local", role: "technician", phone: "+998 90 333 33 33", passwordHash },
  });
  const tech2 = await prisma.user.upsert({
    where: { email: "tech2@rizo.local" },
    update: { name: "Dilnoza Saidova", role: "technician", phone: "+998 90 444 44 44", passwordHash },
    create: { name: "Dilnoza Saidova", email: "tech2@rizo.local", role: "technician", phone: "+998 90 444 44 44", passwordHash },
  });

  await prisma.invoice.deleteMany();
  await prisma.partUsed.deleteMany();
  await prisma.jobPhoto.deleteMany();
  await prisma.jobNote.deleteMany();
  await prisma.job.deleteMany();
  await prisma.serviceLocation.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany({ where: { email: "admin@rizo.local" } });

  const today = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date())}T00:00:00.000Z`);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const baraka = await prisma.customer.create({
    data: {
      name: "Baraka Market",
      phone: "+998 71 200 10 10",
      email: "baraka@shop.uz",
      notes: "3 ta filial. RIZO kassa va tovar hisobi.",
      maintenanceIntervalMonths: 3,
      nextMaintenanceOn: tomorrow,
      locations: {
        create: [
          { address: "Amir Temur 12", city: "Toshkent", lat: 41.3111, lng: 69.2797, notes: "Asosiy do‘kon" },
          { address: "Chilonzor 9-kvartal 4", city: "Toshkent", lat: 41.285, lng: 69.204, notes: "2-filial" },
        ],
      },
    },
    include: { locations: true },
  });
  const nur = await prisma.customer.create({
    data: {
      name: "Nur Electronics",
      phone: "+998 90 555 01 01",
      email: "nur@electro.uz",
      notes: "Katta ombor + vitrina. Skanner va chek printer.",
      maintenanceIntervalMonths: 2,
      nextMaintenanceOn: yesterday,
      locations: {
        create: [{ address: "Bobur 88", city: "Toshkent", lat: 41.2995, lng: 69.2401, notes: "Savdo zali" }],
      },
    },
    include: { locations: true },
  });
  const fashion = await prisma.customer.create({
    data: {
      name: "Chorsu Fashion",
      phone: "+998 93 700 22 33",
      notes: "Kiyim do‘koni. Mijozlar sodiqlik dasturi kerak.",
      maintenanceIntervalMonths: 3,
      nextMaintenanceOn: today,
      locations: {
        create: [{ address: "Chorsu bozori, 2-qavat", city: "Toshkent", lat: 41.326, lng: 69.235 }],
      },
    },
    include: { locations: true },
  });
  const fresh = await prisma.customer.create({
    data: {
      name: "Green Fresh",
      phone: "+998 97 111 45 45",
      email: "hello@greenfresh.uz",
      notes: "Oziq-ovqat. Tarozi va tezkor kassa.",
      maintenanceIntervalMonths: 3,
      nextMaintenanceOn: tomorrow,
      locations: {
        create: [{ address: "Yunusobod 19", city: "Toshkent", lat: 41.364, lng: 69.289 }],
      },
    },
    include: { locations: true },
  });

  async function job(data: {
    title: string;
    description: string;
    kind?: JobKind;
    orderRef?: string;
    status: JobStatus;
    priority: Priority;
    customerId: string;
    locationId: string;
    assignedTechnicianId?: string;
    scheduledDate?: Date;
    scheduledTimeStart?: string;
    scheduledTimeEnd?: string;
    startedAt?: Date;
    completedAt?: Date;
    laborHours?: number;
  }) {
    const kind = data.kind ?? "repair";
    const { kind: _kind, orderRef, ...rest } = data;
    return prisma.job.create({
      data: {
        ...rest,
        kind,
        orderRef: orderRef ?? null,
        checklist: defaultChecklist(kind),
      },
    });
  }

  const j1 = await job({
    title: "RIZO kassa o‘rnatish",
    description: "Yangi buyurtma ORD-1042: terminal, chek printer va xodimlarni o‘qitish.",
    kind: "installation",
    orderRef: "ORD-1042",
    status: "scheduled",
    priority: "high",
    customerId: baraka.id,
    locationId: baraka.locations[0].id,
    assignedTechnicianId: tech1.id,
    scheduledDate: today,
    scheduledTimeStart: "09:00",
    scheduledTimeEnd: "11:00",
  });
  const j2 = await job({
    title: "Kassa qutisi ta’miri",
    description: "Chek chiqmayapti. Printerni tekshirish.",
    kind: "repair",
    status: "in_progress",
    priority: "urgent",
    customerId: nur.id,
    locationId: nur.locations[0].id,
    assignedTechnicianId: tech1.id,
    scheduledDate: today,
    scheduledTimeStart: "12:00",
    scheduledTimeEnd: "13:30",
    startedAt: new Date("2026-09-10T07:05:00.000Z"),
  });
  await job({
    title: "Skanner sozlash",
    description: "Shtrix-kod o‘qimayapti. Ombor tomoni.",
    kind: "repair",
    status: "scheduled",
    priority: "medium",
    customerId: nur.id,
    locationId: nur.locations[0].id,
    assignedTechnicianId: tech2.id,
    scheduledDate: today,
    scheduledTimeStart: "10:00",
    scheduledTimeEnd: "11:00",
  });
  await job({
    title: "Sodiqlik dasturi sozlash",
    description: "Yangi buyurtma: mijoz kartalari va keshbek qoidalari.",
    kind: "installation",
    orderRef: "ORD-1108",
    status: "new",
    priority: "medium",
    customerId: fashion.id,
    locationId: fashion.locations[0].id,
  });
  await job({
    title: "2-filialga RIZO ulash",
    description: "Yangi buyurtma ORD-1055: Chilonzor filiali. Tarmoq va kassa.",
    kind: "installation",
    orderRef: "ORD-1055",
    status: "scheduled",
    priority: "high",
    customerId: baraka.id,
    locationId: baraka.locations[1].id,
    assignedTechnicianId: tech2.id,
    scheduledDate: tomorrow,
    scheduledTimeStart: "09:30",
    scheduledTimeEnd: "12:00",
  });
  const completed = await job({
    title: "Kassirlarni o‘qitish",
    description: "Smena ochish, qaytarish, hisobot — o‘rnatishdan keyingi o‘qitish.",
    kind: "installation",
    orderRef: "ORD-980",
    status: "completed",
    priority: "low",
    customerId: fresh.id,
    locationId: fresh.locations[0].id,
    assignedTechnicianId: tech2.id,
    scheduledDate: yesterday,
    scheduledTimeStart: "14:00",
    scheduledTimeEnd: "16:00",
    startedAt: new Date("2026-09-09T09:00:00.000Z"),
    completedAt: new Date("2026-09-09T11:10:00.000Z"),
    laborHours: 2,
  });
  const invoiced = await job({
    title: "Tarozi integratsiyasi",
    description: "Yangi buyurtma: og‘irlikni kassaga uzatish.",
    kind: "installation",
    orderRef: "ORD-991",
    status: "invoiced",
    priority: "medium",
    customerId: fresh.id,
    locationId: fresh.locations[0].id,
    assignedTechnicianId: tech1.id,
    scheduledDate: yesterday,
    scheduledTimeStart: "10:00",
    scheduledTimeEnd: "12:00",
    startedAt: new Date("2026-09-09T05:00:00.000Z"),
    completedAt: new Date("2026-09-09T07:00:00.000Z"),
    laborHours: 2,
  });
  await job({
    title: "Rejali texnik xizmat",
    description: "Kassa, printer va skannerni tekshirish. Drajver va litsenziyani yangilash.",
    kind: "maintenance",
    status: "scheduled",
    priority: "medium",
    customerId: nur.id,
    locationId: nur.locations[0].id,
    assignedTechnicianId: tech2.id,
    scheduledDate: today,
    scheduledTimeStart: "16:00",
    scheduledTimeEnd: "17:30",
  });

  await prisma.jobNote.createMany({
    data: [
      { jobId: j2.id, userId: tech1.id, noteText: "Printer ulangan, drajver yangilanmoqda." },
      { jobId: j1.id, userId: dispatcher.id, noteText: "Mijoz ertalab ochilishidan oldin kelishni so‘radi." },
      { jobId: completed.id, userId: tech2.id, noteText: "3 kassir o‘qitildi. Hisobot Telegramga ulandi." },
    ],
  });

  await prisma.partUsed.createMany({
    data: [
      { jobId: j2.id, partName: "Chek lenti 80mm", quantity: 2, unitCost: 35000 },
      { jobId: completed.id, partName: "O‘quv qo‘llanma", quantity: 3, unitCost: 15000 },
      { jobId: invoiced.id, partName: "Tarozi kabeli", quantity: 1, unitCost: 120000 },
    ],
  });

  await prisma.invoice.create({
    data: { jobId: invoiced.id, amount: 420000, status: "sent" },
  });

  console.log("Seeded demo users, customers, jobs, and invoices");
  console.log("  password: password123");
  console.log("  dispatcher@rizo.local / tech@rizo.local / tech2@rizo.local");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
