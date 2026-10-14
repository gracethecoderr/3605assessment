import { createServerFn } from "@tanstack/react-start";
import { auth } from "@clerk/tanstack-react-start/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { repairRequests, requestEvents } from "@/db/schema";
import { requests as seedRequests, type RepairRequest } from "@/lib/data";

const priority = z.enum(["Urgent", "High", "Medium", "Low"]);
const column = z.enum(["New", "Waiting", "Action Needed", "Scheduled", "Completed"]);

const requestInput = z.object({
  id: z.string().regex(/^REQ-\d+$/),
  title: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(300),
  priority,
  column,
  status: z.string().max(200),
  waitingOn: z.string().max(200),
  nextAction: z.string().max(300),
  waiting: z.string().max(100),
  lastUpdate: z.string().max(100),
});

const requestPatch = requestInput.omit({ id: true }).partial();

async function requireUserId() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

type Row = typeof repairRequests.$inferSelect;

function toRequest(row: Row): RepairRequest {
  return {
    id: row.id,
    title: row.title,
    address: row.address,
    priority: row.priority,
    column: row.boardColumn,
    status: row.status,
    waitingOn: row.waitingOn,
    nextAction: row.nextAction,
    waiting: row.waiting,
    lastUpdate: row.lastUpdate,
  };
}

function toRow(userId: string, r: RepairRequest, sortOrder: number): Row {
  return {
    userId,
    id: r.id,
    title: r.title,
    address: r.address,
    priority: r.priority,
    boardColumn: r.column,
    status: r.status,
    waitingOn: r.waitingOn,
    nextAction: r.nextAction,
    waiting: r.waiting,
    lastUpdate: r.lastUpdate,
    sortOrder,
    aiSummary: null,
    aiNextStep: null,
    aiColumn: null,
    aiWaitingOn: null,
    aiUpdatedAt: null,
  };
}

export const listRequests = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireUserId();
  const { getDb } = await import("./db.server");
  const db = await getDb();

  const existing = await db
    .select()
    .from(repairRequests)
    .where(eq(repairRequests.userId, userId))
    .orderBy(asc(repairRequests.sortOrder));
  if (existing.length > 0) return existing.map(toRequest);

  // First sign-in: give the account the demo board so it isn't empty.
  // D1 allows at most 100 bound values per query, and each row has 17 columns,
  // so insert in batches of 5 (85 values) instead of all rows at once.
  const rows = seedRequests.map((r, i) => toRow(userId, r, i + 1));
  for (let i = 0; i < rows.length; i += 5) {
    await db
      .insert(repairRequests)
      .values(rows.slice(i, i + 5))
      .onConflictDoNothing();
  }
  return seedRequests;
});

export const createRequest = createServerFn({ method: "POST" })
  .validator(requestInput)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { getDb } = await import("./db.server");
    const db = await getDb();
    const existing = await db
      .select({ sortOrder: repairRequests.sortOrder })
      .from(repairRequests)
      .where(eq(repairRequests.userId, userId));
    // New requests go to the top of the list, matching the in-memory behaviour.
    const top = Math.min(0, ...existing.map((r) => r.sortOrder));
    await db.insert(repairRequests).values(toRow(userId, data, top - 1));
    await db.insert(requestEvents).values({
      userId,
      requestId: data.id,
      at: Date.now(),
      kind: "created",
      text: `Request created: ${data.title}`,
      actor: "Property Manager",
    });
    return { ok: true as const };
  });

export const patchRequest = createServerFn({ method: "POST" })
  .validator(z.object({ id: requestInput.shape.id, patch: requestPatch }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { getDb } = await import("./db.server");
    const db = await getDb();
    const { column: boardColumn, ...rest } = data.patch;
    const set = { ...rest, ...(boardColumn ? { boardColumn } : {}) };
    if (Object.keys(set).length > 0) {
      const [before] = boardColumn
        ? await db
            .select({ column: repairRequests.boardColumn })
            .from(repairRequests)
            .where(and(eq(repairRequests.userId, userId), eq(repairRequests.id, data.id)))
        : [];
      await db
        .update(repairRequests)
        .set(set)
        .where(and(eq(repairRequests.userId, userId), eq(repairRequests.id, data.id)));
      if (boardColumn && before && before.column !== boardColumn) {
        await db.insert(requestEvents).values({
          userId,
          requestId: data.id,
          at: Date.now(),
          kind: "status",
          text: `Status changed from ${before.column} to ${boardColumn}`,
          actor: "Property Manager",
        });
      }
    }
    return { ok: true as const };
  });
