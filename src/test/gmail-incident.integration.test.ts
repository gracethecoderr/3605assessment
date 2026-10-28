// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@/db/schema";

let db: ReturnType<typeof drizzle<typeof schema>>;
vi.mock("@/lib/db.server", () => ({ getDb: async () => db }));

const b64u = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const hoursAgo = (n: number) => String(Date.now() - n * 3600 * 1000);
const msg = (
  id: string,
  from: string,
  to: string,
  subject: string,
  body: string,
  at: string,
  labels: string[],
) => ({
  id,
  threadId: `thread-${id}`,
  snippet: body.slice(0, 80),
  internalDate: at,
  labelIds: labels,
  payload: {
    mimeType: "text/plain",
    headers: [
      { name: "From", value: from },
      { name: "To", value: to },
      { name: "Subject", value: subject },
    ],
    body: { data: b64u(body) },
  },
});

const mailbox = [
  msg(
    "m1",
    "Mia Russo <Mia.Russo@tenant.test>",
    "pm@agency.test",
    "Leaking tap",
    "Tap is dripping",
    hoursAgo(72),
    ["INBOX"],
  ),
  msg(
    "m2",
    "Sarah <pm@agency.test>",
    "Inner West Plumbing <jobs@iwp.test>",
    "Quote request",
    "Can you quote?",
    hoursAgo(48),
    ["SENT"],
  ),
  msg(
    "m3",
    "Inner West Plumbing <jobs@iwp.test>",
    "pm@agency.test",
    "Re: Quote request",
    "$320 incl GST",
    hoursAgo(24),
    ["INBOX"],
  ),
  msg(
    "m4",
    "David Chen <david@owner.test>",
    "pm@agency.test",
    "Re: Tap",
    "Please go ahead",
    hoursAgo(3),
    ["INBOX", "UNREAD"],
  ),
  msg(
    "m5",
    "Council <noreply@council.test>",
    "pm@agency.test",
    "Rates notice",
    "Your notice is ready",
    hoursAgo(30),
    ["INBOX"],
  ),
];

const sentBodies: { raw: string; threadId?: string }[] = [];
let sendStatus = 200;

beforeAll(async () => {
  process.env["GOOGLE_CLIENT_ID"] = "cid";
  process.env["GOOGLE_CLIENT_SECRET"] = "secret";
  process.env["TOKEN_ENCRYPTION_KEY"] = Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("base64");
  process.env["GOOGLE_TOKEN_URL"] = "https://google.test/token";
  process.env["GOOGLE_USERINFO_URL"] = "https://google.test/userinfo";
  process.env["GMAIL_API_BASE"] = "https://gmail.test";

  const { getPlatformProxy } = await import("wrangler");
  const proxy = await getPlatformProxy<{ DB: import("drizzle-orm/d1").AnyD1Database }>({
    persist: { path: mkdtempSync(join(tmpdir(), "banjg-d1-")) },
  });
  afterAll(() => proxy.dispose());
  const raw = proxy.env.DB as unknown as { prepare(q: string): { run(): Promise<unknown> } };
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const stmt of readFileSync(join("drizzle", file), "utf8").split(
      "--> statement-breakpoint",
    )) {
      if (stmt.trim()) await raw.prepare(stmt).run();
    }
  }
  db = drizzle(proxy.env.DB, { schema });
});

beforeEach(() => {
  sentBodies.length = 0;
  sendStatus = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (o: unknown, status = 200) =>
        new Response(JSON.stringify(o), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (url === "https://google.test/token") {
        const grant = new URLSearchParams(String(init?.body)).get("grant_type");
        return json(
          grant === "authorization_code"
            ? { access_token: "at", refresh_token: "rt-secret" }
            : { access_token: "at2" },
        );
      }
      if (url === "https://google.test/userinfo") return json({ email: "PM@agency.test" });
      if (url.startsWith("https://gmail.test/gmail/v1/users/me/messages?")) {
        expect(decodeURIComponent(url)).toContain("in:sent");
        return json({ messages: mailbox.map((m) => ({ id: m.id })) });
      }
      if (url.endsWith("/messages/send")) {
        sentBodies.push(JSON.parse(String(init?.body)));
        return sendStatus === 200
          ? json({ id: "sent-1", threadId: "thread-m1" })
          : json({}, sendStatus);
      }
      if (/\/messages\/m1\/(trash|untrash)$/.test(url)) {
        return json({ labelIds: url.endsWith("/untrash") ? ["INBOX"] : ["TRASH"] });
      }
      const m = /messages\/([^?]+)\?format=full/.exec(url);
      const found = mailbox.find((x) => x.id === m?.[1]);
      return found ? json(found) : json({}, 404);
    }),
  );
});

const USER = "user_test";

async function seedRequest() {
  await db
    .insert(schema.repairRequests)
    .values({
      userId: USER,
      id: "REQ-1",
      title: "Leaking tap",
      address: "3/22 Oxford St",
      priority: "High",
      boardColumn: "New",
      status: "Awaiting triage",
      waitingOn: "Property Manager",
      nextAction: "Triage",
      waiting: "1 day",
      lastUpdate: "Today",
      sortOrder: 1,
    })
    .onConflictDoNothing();
  await db
    .insert(schema.requestParticipants)
    .values([
      {
        userId: USER,
        requestId: "REQ-1",
        role: "Tenant",
        name: "Mia Russo",
        email: "mia.russo@tenant.test",
      },
      {
        userId: USER,
        requestId: "REQ-1",
        role: "Repair Team",
        name: "Inner West Plumbing",
        email: "jobs@iwp.test",
      },
      {
        userId: USER,
        requestId: "REQ-1",
        role: "Landlord",
        name: "David Chen",
        email: "david@owner.test",
      },
    ])
    .onConflictDoNothing();
}

describe("Gmail sync, linking and sending", () => {
  it("connects, stores the refresh token encrypted, syncs inbox and sent mail, and links by participant", async () => {
    const gmail = await import("@/lib/gmail.server");
    await seedRequest();
    await gmail.connectAccount(USER, "code", "https://app.test");

    const [account] = await db
      .select()
      .from(schema.gmailAccounts)
      .where(eq(schema.gmailAccounts.userId, USER));
    expect(account?.email).toBe("PM@agency.test");
    expect(account?.refreshToken).not.toContain("rt-secret");

    expect(await gmail.syncInbox(USER, "https://app.test")).toBe(5);
    const rows = await db
      .select()
      .from(schema.emailMessages)
      .where(eq(schema.emailMessages.userId, USER));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    expect(byId["m1"]?.requestId).toBe("REQ-1"); // tenant, mixed-case address
    expect(byId["m2"]?.requestId).toBe("REQ-1"); // sent to repair team
    expect(byId["m3"]?.requestId).toBe("REQ-1"); // from repair team
    expect(byId["m4"]?.requestId).toBe("REQ-1"); // from landlord
    expect(byId["m5"]?.requestId).toBeNull(); // unknown sender stays unlinked
    expect(byId["m1"]?.fromEmail).toBe("mia.russo@tenant.test");
    expect(byId["m2"]?.toEmails).toBe("jobs@iwp.test");
    expect(byId["m4"]?.unread).toBe(true);
    expect(byId["m1"]?.body).toBe("Tap is dripping");
  });

  it("moves mail to Gmail trash and restores it without losing request links", async () => {
    const gmail = await import("@/lib/gmail.server");
    await gmail.moveMail(USER, "https://app.test", "m1", true);
    const read = async () =>
      (
        await db
          .select()
          .from(schema.emailMessages)
          .where(and(eq(schema.emailMessages.userId, USER), eq(schema.emailMessages.id, "m1")))
      )[0];
    expect((await read())?.trashed).toBe(true);
    expect((await read())?.requestId).toBe("REQ-1");
    await gmail.moveMail(USER, "https://app.test", "m1", false);
    expect((await read())?.trashed).toBe(false);
    expect((await read())?.inInbox).toBe(true);
  });

  it("does not link emails to a request when the sender is not a participant", async () => {
    const rows = await db
      .select()
      .from(schema.emailMessages)
      .where(and(eq(schema.emailMessages.userId, USER), eq(schema.emailMessages.id, "m5")));
    expect(rows[0]?.requestId).toBeNull();
  });

  it("sends a UTF-8 email in the right thread and records it against the request", async () => {
    const gmail = await import("@/lib/gmail.server");
    await gmail.sendMail(USER, "https://app.test", {
      to: "mia.russo@tenant.test\r\nBcc: attacker@evil.test",
      subject: "Plumber booked ✔ Thursday",
      body: "Hi Mia,\nThe plumber attends Thursday 5:30pm.\n— Sarah",
      requestId: "REQ-1",
      threadId: "thread-m1",
    });
    const payload = sentBodies[0]!;
    expect(payload.threadId).toBe("thread-m1");
    const mime = Buffer.from(payload.raw, "base64url").toString("utf8");
    expect(mime).toContain("To: mia.russo@tenant.test Bcc: attacker@evil.test"); // CRLF stripped, no header injection
    expect(mime).not.toMatch(/\r\nBcc:/);
    expect(mime).toMatch(/Subject: =\?UTF-8\?B\?/);
    const body = mime.split("\r\n\r\n")[1]!.replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toContain("— Sarah");

    const [stored] = await db
      .select()
      .from(schema.emailMessages)
      .where(eq(schema.emailMessages.id, "sent-1"));
    expect(stored?.requestId).toBe("REQ-1");
    expect(stored?.fromEmail).toBe("pm@agency.test");
  });

  it("asks the user to reconnect when Gmail rejects sending permission", async () => {
    const gmail = await import("@/lib/gmail.server");
    sendStatus = 403;
    await expect(
      gmail.sendMail(USER, "https://app.test", {
        to: "a@b.test",
        subject: "x",
        body: "y",
        requestId: null,
      }),
    ).rejects.toBeInstanceOf(gmail.ReconnectRequired);
  });
});

describe("Demo account", () => {
  const DEMO = "user_demoaccount1";

  it("seeds a complete, linked data set and can be re-seeded without duplicates", async () => {
    const seed = () =>
      execFileSync("node", ["scripts/seed-demo.mjs", DEMO], { encoding: "utf8" })
        .split(/;\n(?=INSERT|DELETE|--)/)
        .filter((stmt) => stmt.trim() && !stmt.trim().startsWith("--"));
    const run = async () => {
      const raw = (
        db as unknown as { $client: { prepare(q: string): { run(): Promise<unknown> } } }
      ).$client;
      for (const stmt of seed()) await raw.prepare(stmt.trim().replace(/;$/, "")).run();
    };
    await run();
    await run();

    const requests = await db
      .select()
      .from(schema.repairRequests)
      .where(eq(schema.repairRequests.userId, DEMO));
    expect(requests).toHaveLength(8);
    expect(new Set(requests.map((r) => r.boardColumn))).toEqual(
      new Set(["New", "Waiting", "Action Needed", "Scheduled", "Completed"]),
    );
    const mail = await db
      .select()
      .from(schema.emailMessages)
      .where(eq(schema.emailMessages.userId, DEMO));
    expect(mail.filter((m) => m.requestId === null)).toHaveLength(2);
    expect(
      mail.every((m) => !/@(gmail|outlook|yahoo|hotmail)\./.test(m.fromEmail + m.toEmails)),
    ).toBe(true);
  });

  it("syncs and sends without ever calling Google", async () => {
    const gmail = await import("@/lib/gmail.server");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();

    expect(await gmail.syncInbox(DEMO, "https://app.test")).toBeGreaterThan(20);
    await gmail.sendMail(DEMO, "https://app.test", {
      to: "david.chen@example.com",
      subject: "Reminder: air conditioning quote",
      body: "Hi David, just checking in on the $680 quote.",
      requestId: "REQ-101",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    const [row] = await db
      .select()
      .from(schema.emailMessages)
      .where(
        and(
          eq(schema.emailMessages.userId, DEMO),
          eq(schema.emailMessages.subject, "Reminder: air conditioning quote"),
        ),
      );
    expect(row?.requestId).toBe("REQ-101");
    expect(row?.fromEmail).toBe("sarah.miller@harbourrealty.example");
    expect(row?.sent).toBe(true);
    expect(row?.inInbox).toBe(false);
    await gmail.moveMail(DEMO, "https://app.test", row!.id, true);
    const [trashed] = await db
      .select()
      .from(schema.emailMessages)
      .where(and(eq(schema.emailMessages.userId, DEMO), eq(schema.emailMessages.id, row!.id)));
    expect(trashed?.trashed).toBe(true);
    await gmail.moveMail(DEMO, "https://app.test", row!.id, false);
    const [restored] = await db
      .select()
      .from(schema.emailMessages)
      .where(and(eq(schema.emailMessages.userId, DEMO), eq(schema.emailMessages.id, row!.id)));
    expect(restored?.trashed).toBe(false);
    await expect(gmail.moveMail(USER, "https://app.test", row!.id, true)).rejects.toThrow(
      "Email not found",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
