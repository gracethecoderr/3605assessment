import { and, desc, eq, isNull } from "drizzle-orm";
import { emailMessages, gmailAccounts, repairRequests, requestParticipants } from "@/db/schema";
import { getDb } from "./db.server";

export const GMAIL_SCOPES = "openid email https://www.googleapis.com/auth/gmail.modify";

// Endpoints can be redirected (for example to a local fake Google server in tests).
const GOOGLE_TOKEN_URL = () =>
  process.env["GOOGLE_TOKEN_URL"] ?? "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = () =>
  process.env["GOOGLE_USERINFO_URL"] ?? "https://openidconnect.googleapis.com/v1/userinfo";
const GMAIL_API = () => process.env["GMAIL_API_BASE"] ?? "https://gmail.googleapis.com";
export const GOOGLE_AUTH_URL = () =>
  process.env["GOOGLE_AUTH_URL"] ?? "https://accounts.google.com/o/oauth2/v2/auth";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function googleConfig(origin: string) {
  return {
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    redirectUri: `${origin}/api/gmail/callback`,
  };
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function cryptoKey() {
  return crypto.subtle.importKey("raw", unb64(env("TOKEN_ENCRYPTION_KEY")), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encrypt(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await cryptoKey(),
    new TextEncoder().encode(plain),
  );
  return `${b64(iv)}.${b64(new Uint8Array(ct))}`;
}

async function decrypt(value: string) {
  const [iv, ct] = value.split(".");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv ?? "") },
    await cryptoKey(),
    unb64(ct ?? ""),
  );
  return new TextDecoder().decode(plain);
}

export async function connectAccount(userId: string, code: string, origin: string) {
  const cfg = googleConfig(origin);
  const res = await fetch(GOOGLE_TOKEN_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const tokens = (await res.json()) as { access_token: string; refresh_token?: string };
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token");

  const info = await fetch(GOOGLE_USERINFO_URL(), {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!info.ok) throw new Error(`Google userinfo failed (${info.status})`);
  const { email } = (await info.json()) as { email: string };

  const db = await getDb();
  const refreshToken = await encrypt(tokens.refresh_token);
  await db
    .insert(gmailAccounts)
    .values({ userId, email, refreshToken })
    .onConflictDoUpdate({ target: gmailAccounts.userId, set: { email, refreshToken } });
}

export class ReconnectRequired extends Error {}

// The seeded demo account has no real mailbox: it never calls Google and never sends email.
export const DEMO_REFRESH_TOKEN = "demo-account";

async function isDemoAccount(userId: string) {
  const db = await getDb();
  const [account] = await db.select().from(gmailAccounts).where(eq(gmailAccounts.userId, userId));
  return account?.refreshToken === DEMO_REFRESH_TOKEN;
}

async function accessToken(userId: string, origin: string) {
  const db = await getDb();
  const [account] = await db.select().from(gmailAccounts).where(eq(gmailAccounts.userId, userId));
  if (!account) throw new ReconnectRequired("Gmail is not connected");
  const cfg = googleConfig(origin);
  const res = await fetch(GOOGLE_TOKEN_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: await decrypt(account.refreshToken),
      grant_type: "refresh_token",
    }),
  });
  if (res.status === 400 || res.status === 401) {
    throw new ReconnectRequired("Google authorization expired");
  }
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

type Part = {
  mimeType?: string;
  body?: { data?: string };
  parts?: Part[];
  headers?: { name: string; value: string }[];
};
type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: Part;
};

function decodeBase64Url(data: string) {
  const bytes = unb64(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(bytes);
}

function findPart(part: Part | undefined, mime: string): string | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const found = findPart(child, mime);
    if (found) return found;
  }
  return null;
}

function decodeEntities(s: string) {
  return s
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>|<\/(p|div|tr|li)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

function parseMessage(userId: string, m: GmailMessage) {
  const header = (name: string) =>
    m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  const from = header("from");
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const fromEmail = (match?.[2] ?? from).trim();
  const fromName = (match?.[1] ?? "").trim() || fromEmail;
  const toEmails = (header("to").match(/[^\s<>,"]+@[^\s<>,"]+/g) ?? [])
    .map((e) => e.toLowerCase())
    .join(",");
  const text = findPart(m.payload, "text/plain");
  const html = findPart(m.payload, "text/html");
  const body = (text ?? (html ? htmlToText(html) : decodeEntities(m.snippet ?? ""))).slice(
    0,
    20000,
  );
  return {
    userId,
    id: m.id,
    threadId: m.threadId,
    fromName,
    fromEmail: fromEmail.toLowerCase(),
    toEmails,
    subject: header("subject") || "(no subject)",
    snippet: decodeEntities(m.snippet ?? "").slice(0, 300),
    body,
    receivedAt: Number(m.internalDate ?? Date.now()),
    unread: m.labelIds?.includes("UNREAD") ?? false,
    inInbox: m.labelIds?.includes("INBOX") ?? false,
    sent: m.labelIds?.includes("SENT") ?? false,
    trashed: m.labelIds?.includes("TRASH") ?? false,
  };
}

export async function syncInbox(userId: string, origin: string) {
  if (await isDemoAccount(userId)) {
    const db = await getDb();
    const stored = await db.select().from(emailMessages).where(eq(emailMessages.userId, userId));
    await db
      .update(gmailAccounts)
      .set({ lastSyncAt: Date.now() })
      .where(eq(gmailAccounts.userId, userId));
    await autoLinkEmails(userId);
    return stored.length;
  }
  const token = await accessToken(userId, origin);
  const headers = { Authorization: `Bearer ${token}` };
  const list = await fetch(
    `${GMAIL_API()}/gmail/v1/users/me/messages?maxResults=100&includeSpamTrash=true&q=` +
      encodeURIComponent("(in:inbox OR in:sent OR in:trash) newer_than:30d"),
    { headers },
  );
  if (!list.ok) throw new Error(`Gmail list failed (${list.status})`);
  const ids = ((await list.json()) as { messages?: { id: string }[] }).messages ?? [];

  const messages = await Promise.all(
    ids.map(async ({ id }) => {
      const res = await fetch(`${GMAIL_API()}/gmail/v1/users/me/messages/${id}?format=full`, {
        headers,
      });
      return res.ok ? ((await res.json()) as GmailMessage) : null;
    }),
  );

  const db = await getDb();
  for (const m of messages) {
    if (!m) continue;
    const row = parseMessage(userId, m);
    await db
      .insert(emailMessages)
      .values(row)
      .onConflictDoUpdate({
        target: [emailMessages.userId, emailMessages.id],
        set: { unread: row.unread, inInbox: row.inInbox, sent: row.sent, trashed: row.trashed },
      });
  }
  await db
    .update(gmailAccounts)
    .set({ lastSyncAt: Date.now() })
    .where(eq(gmailAccounts.userId, userId));
  await autoLinkEmails(userId);
  return messages.filter(Boolean).length;
}

// Links unlinked emails to the request whose participant is the other party in the conversation.
export async function autoLinkEmails(userId: string) {
  const db = await getDb();
  const [account] = await db.select().from(gmailAccounts).where(eq(gmailAccounts.userId, userId));
  const own = account?.email.toLowerCase() ?? "";
  const people = await db
    .select()
    .from(requestParticipants)
    .where(eq(requestParticipants.userId, userId));
  if (people.length === 0) return;
  const requests = await db
    .select({ id: repairRequests.id, column: repairRequests.boardColumn })
    .from(repairRequests)
    .where(eq(repairRequests.userId, userId))
    .orderBy(desc(repairRequests.sortOrder));
  const open = new Set(requests.filter((r) => r.column !== "Completed").map((r) => r.id));

  const unlinked = await db
    .select()
    .from(emailMessages)
    .where(and(eq(emailMessages.userId, userId), isNull(emailMessages.requestId)));
  for (const mail of unlinked) {
    const addresses = [mail.fromEmail, ...mail.toEmails.split(",")]
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a && a !== own);
    const matches = people.filter((p) => addresses.includes(p.email.toLowerCase()));
    const target = matches.find((p) => open.has(p.requestId)) ?? matches[0];
    if (!target) continue;
    await db
      .update(emailMessages)
      .set({ requestId: target.requestId })
      .where(and(eq(emailMessages.userId, userId), eq(emailMessages.id, mail.id)));
  }
}

export async function disconnectAccount(userId: string) {
  const db = await getDb();
  await db.delete(emailMessages).where(eq(emailMessages.userId, userId));
  await db.delete(gmailAccounts).where(eq(gmailAccounts.userId, userId));
}

const cleanHeader = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

export async function sendMail(
  userId: string,
  origin: string,
  input: { to: string; subject: string; body: string; requestId: string | null; threadId?: string },
) {
  const demo = await isDemoAccount(userId);
  const token = demo ? "" : await accessToken(userId, origin);
  const db = await getDb();
  const [account] = await db.select().from(gmailAccounts).where(eq(gmailAccounts.userId, userId));
  if (!account) throw new ReconnectRequired("Gmail is not connected");

  if (input.requestId) {
    const [request] = await db
      .select({ id: repairRequests.id })
      .from(repairRequests)
      .where(and(eq(repairRequests.userId, userId), eq(repairRequests.id, input.requestId)));
    if (!request) throw new Error("Repair request not found");
  }

  const to = cleanHeader(input.to);
  const subject = cleanHeader(input.subject);
  const encodedSubject = /^[\x20-\x7e]*$/.test(subject)
    ? subject
    : `=?UTF-8?B?${b64(new TextEncoder().encode(subject))}?=`;
  const bodyB64 = (b64(new TextEncoder().encode(input.body)).match(/.{1,76}/g) ?? []).join("\r\n");
  const mime = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    bodyB64,
  ].join("\r\n");
  const raw = b64(new TextEncoder().encode(mime))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  let sent: { id: string; threadId?: string };
  if (demo) {
    sent = {
      id: `demo-sent-${Date.now()}`,
      ...(input.threadId ? { threadId: input.threadId } : {}),
    };
  } else {
    const res = await fetch(`${GMAIL_API()}/gmail/v1/users/me/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw, ...(input.threadId ? { threadId: input.threadId } : {}) }),
    });
    if (res.status === 403) throw new ReconnectRequired("Gmail send permission is missing");
    if (!res.ok) throw new Error(`Gmail send failed (${res.status})`);
    sent = (await res.json()) as { id: string; threadId?: string };
  }

  await db
    .insert(emailMessages)
    .values({
      userId,
      id: sent.id,
      threadId: sent.threadId ?? sent.id,
      fromName: "You",
      fromEmail: account.email.toLowerCase(),
      toEmails: to.toLowerCase(),
      subject,
      snippet: input.body.slice(0, 300),
      body: input.body.slice(0, 20000),
      receivedAt: Date.now(),
      unread: false,
      inInbox: false,
      sent: true,
      trashed: false,
      requestId: input.requestId,
    })
    .onConflictDoNothing();
  if (!input.requestId) await autoLinkEmails(userId);
}

export async function moveMail(userId: string, origin: string, id: string, trash: boolean) {
  const db = await getDb();
  const condition = and(eq(emailMessages.userId, userId), eq(emailMessages.id, id));
  const [mail] = await db.select().from(emailMessages).where(condition);
  if (!mail) throw new Error("Email not found");
  let labels: string[] | undefined;
  if (!(await isDemoAccount(userId))) {
    const token = await accessToken(userId, origin);
    const response = await fetch(
      `${GMAIL_API()}/gmail/v1/users/me/messages/${encodeURIComponent(id)}/${trash ? "trash" : "untrash"}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (response.status === 403 || response.status === 401)
      throw new ReconnectRequired("Reconnect Gmail to allow moving emails");
    if (!response.ok) throw new Error(`Gmail move failed (${response.status})`);
    labels = ((await response.json()) as { labelIds?: string[] }).labelIds;
  }
  await db
    .update(emailMessages)
    .set({
      trashed: trash,
      ...(labels
        ? {
            inInbox: labels.includes("INBOX"),
            sent: labels.includes("SENT"),
            unread: labels.includes("UNREAD"),
          }
        : {}),
    })
    .where(condition);
}
