import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestUrl } from "@tanstack/react-start/server";
import { auth } from "@clerk/tanstack-react-start/server";
import { desc, eq } from "drizzle-orm";
import { emailMessages, gmailAccounts } from "@/db/schema";

async function requireUserId() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

export type InboxEmail = {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: number;
  unread: boolean;
  requestId: string | null;
  threadId: string;
  toEmails: string;
  inInbox: boolean;
  sent: boolean;
  trashed: boolean;
};

export const getInbox = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireUserId();
  const { getDb } = await import("./db.server");
  const db = await getDb();
  const [account] = await db.select().from(gmailAccounts).where(eq(gmailAccounts.userId, userId));
  if (!account) return { connected: false as const };
  const rows = await db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.userId, userId))
    .orderBy(desc(emailMessages.receivedAt));
  const emails: InboxEmail[] = rows.map((r) => ({
    id: r.id,
    fromName: r.fromName,
    fromEmail: r.fromEmail,
    subject: r.subject,
    snippet: r.snippet,
    body: r.body,
    receivedAt: r.receivedAt,
    unread: r.unread,
    requestId: r.requestId,
    threadId: r.threadId,
    toEmails: r.toEmails,
    inInbox: r.inInbox,
    sent: r.sent,
    trashed: r.trashed,
  }));
  return {
    connected: true as const,
    email: account.email,
    lastSyncAt: account.lastSyncAt,
    emails,
  };
});

export const moveEmail = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1).max(200), trash: z.boolean() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const gmail = await import("./gmail.server");
    try {
      await gmail.moveMail(userId, getRequestUrl().origin, data.id, data.trash);
      return { ok: true as const };
    } catch (error) {
      if (error instanceof gmail.ReconnectRequired)
        return { ok: false as const, code: "RECONNECT" as const };
      console.error("Gmail move failed", error);
      return { ok: false as const, code: "ERROR" as const };
    }
  });

export const syncGmail = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await requireUserId();
  const gmail = await import("./gmail.server");
  try {
    const count = await gmail.syncInbox(userId, getRequestUrl().origin);
    return { ok: true as const, count };
  } catch (error) {
    if (error instanceof gmail.ReconnectRequired) {
      return { ok: false as const, code: "RECONNECT" as const };
    }
    console.error("Gmail sync failed", error);
    return { ok: false as const, code: "ERROR" as const };
  }
});

export const disconnectGmail = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await requireUserId();
  const gmail = await import("./gmail.server");
  await gmail.disconnectAccount(userId);
  return { ok: true as const };
});

export const sendEmail = createServerFn({ method: "POST" })
  .validator(
    z.object({
      to: z.string().trim().toLowerCase().email().max(200),
      subject: z.string().trim().min(1).max(300),
      body: z.string().trim().min(1).max(20000),
      requestId: z
        .string()
        .regex(/^REQ-\d+$/)
        .nullable(),
      threadId: z.string().max(100).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const gmail = await import("./gmail.server");
    try {
      await gmail.sendMail(userId, getRequestUrl().origin, {
        to: data.to,
        subject: data.subject,
        body: data.body,
        requestId: data.requestId,
        ...(data.threadId ? { threadId: data.threadId } : {}),
      });
      return { ok: true as const };
    } catch (error) {
      if (error instanceof gmail.ReconnectRequired) {
        return { ok: false as const, code: "RECONNECT" as const };
      }
      console.error("Gmail send failed", error);
      return { ok: false as const, code: "ERROR" as const };
    }
  });
