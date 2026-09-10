import "dotenv/config";
import "./types.ts";
import http from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { authRouter } from "./routes/auth/index.ts";
import { customersRouter } from "./routes/customers.ts";
import { jobsRouter } from "./routes/jobs.ts";
import { dispatchRouter } from "./routes/dispatch.ts";
import { invoicesRouter } from "./routes/invoices.ts";
import { dashboardRouter } from "./routes/dashboard.ts";
import { prisma } from "./lib/prisma.ts";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "fsm-api" });
});

app.use("/api/auth", authRouter);
app.use("/api/customers", customersRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/dispatch", dispatchRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/dashboard", dashboardRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: clientOrigin, credentials: true },
});

io.on("connection", (socket) => {
  socket.on("disconnect", () => {
    /* connection tracking is added with the dispatch board */
  });
});

app.set("io", io);

server.listen(port, () => {
  console.log(`FSM API listening on http://localhost:${port}`);
});

async function shutdown() {
  await prisma.$disconnect();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
