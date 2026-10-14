import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  MessageSquare,
  Users,
  MessageCircle,
  Bot,
  Reply,
  Search,
  X,
  Send,
  ArrowLeft,
  ClipboardPaste,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { disconnectGmail, getInbox, syncGmail, type InboxEmail } from "@/lib/gmail.functions";
import { EmailIntakePanel } from "@/components/EmailIntakePanel";
import { sampleEmails, type IntakeEmail } from "@/lib/intake";

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Unified Inbox — Banjg Property" },
      {
        name: "description",
        content: "Email, SMS, Teams and chat messages organised around repair requests.",
      },
    ],
  }),
  component: InboxPage,
});
const channels = [
  { k: "All", icon: null },
  { k: "Email", icon: Mail },
  { k: "SMS", icon: MessageSquare },
  { k: "Teams", icon: Users },
  { k: "Chat", icon: MessageCircle },
] as const;
const seedMessages = [
  {
    id: 1,
    from: "David Chen",
    ch: "Email",
    subj: "Re: Air conditioning quote",
    prev: "$680 is fine. Please go ahead.",
    body: "$680 is fine. Please go ahead.",
    req: "REQ-101",
    time: "8:02 AM",
    unread: true,
    role: "Landlord · 14 King Street, Unit 7",
  },
  {
    id: 2,
    from: "Mia Russo",
    ch: "SMS",
    subj: "Inspection access",
    prev: "Thursday after 2pm works for me",
    body: "Hi, Thursday after 2pm works for me. Please let the inspector know to buzz Unit 2.",
    req: "REQ-099",
    time: "7:48 AM",
    unread: true,
    role: "Tenant · 2/7 Bay St, Coogee",
  },
  {
    id: 3,
    from: "Sparkie Bros",
    ch: "Email",
    subj: "Cancellation — 88 Park Rd",
    prev: "Sorry, our electrician is unwell today…",
    body: "Sorry, our electrician is unwell today and we need to cancel. We can offer tomorrow at 9am instead.",
    req: "REQ-106",
    time: "7:41 AM",
    unread: true,
    role: "Trade · 88 Park Rd, Alexandria",
  },
  {
    id: 4,
    from: "Tom (Maintenance)",
    ch: "Teams",
    subj: "Hill St leak",
    prev: "Photos look like a cracked trap",
    body: "Photos look like a cracked trap. I recommend a plumber attends today before it worsens.",
    req: "REQ-093",
    time: "7:10 AM",
    unread: false,
    role: "Maintenance coordinator",
  },
  {
    id: 5,
    from: "Lena Ortiz",
    ch: "Chat",
    subj: "Kitchen tap",
    prev: "It's dripping constantly now",
    body: "It's dripping constantly now. I've turned the isolation valve down but it hasn't stopped.",
    req: "REQ-108",
    time: "6:55 AM",
    unread: false,
    role: "Tenant · 3/22 Oxford St, Paddington",
  },
  {
    id: 6,
    from: "Inner West Plumbing",
    ch: "Email",
    subj: "Booking confirmed",
    prev: "We'll attend at 1:30pm today",
    body: "We'll attend at 1:30pm today. The tenant has confirmed access.",
    req: "REQ-090",
    time: "Yesterday",
    unread: false,
    role: "Trade · 17 Elm Pl, Leichhardt",
  },
];
type Msg = {
  id: string;
  from: string;
  ch: string;
  subj: string;
  prev: string;
  body: string;
  req: string;
  time: string;
  unread: boolean;
  role: string;
  gmail?: { fromEmail: string };
};

const demoMessages: Msg[] = seedMessages.map((m) => ({ ...m, id: String(m.id) }));

function formatTime(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function emailToMsg(e: InboxEmail, read: Set<string>): Msg {
  return {
    id: e.id,
    from: e.fromName,
    ch: "Email",
    subj: e.subject,
    prev: e.snippet,
    body: e.body,
    req: "",
    time: formatTime(e.receivedAt),
    unread: e.unread && !read.has(e.id),
    role: `Email · ${e.fromEmail}`,
    gmail: { fromEmail: e.fromEmail },
  };
}

function getActionsForMessage(msg: Msg): string[] {
  const base: string[] = [];
  if (msg.role.startsWith("Landlord")) {
    base.push("Mark landlord approval as received", "Move request to Ready to Schedule");
  } else if (msg.role.startsWith("Trade")) {
    base.push("Update appointment in calendar", "Notify tenant of schedule change");
  } else if (msg.role.startsWith("Tenant") || msg.role.startsWith("Maintenance")) {
    base.push("Review and action the update", "Draft a tenant status update");
  }
  base.push(`Draft a reply to ${msg.from}`);
  if (msg.req) base.push(`Link message to ${msg.req}`);
  return base.slice(0, 4);
}

function InboxPage() {
  const { user } = useAuth();
  const managerName = user?.name || "Property Manager";
  const [ch, setCh] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [demo, setDemo] = useState<Msg[]>(demoMessages);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState("1");
  const [checked, setChecked] = useState<boolean[]>([]);
  const [approved, setApproved] = useState(false);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [paste, setPaste] = useState<IntakeEmail | null>(null);
  const { updateRequest, notify } = useWorkspace();
  const queryClient = useQueryClient();
  const inbox = useQuery({ queryKey: ["inbox"], queryFn: () => getInbox(), staleTime: Infinity });
  const connected = inbox.data?.connected === true;
  const messages = useMemo<Msg[]>(
    () => (inbox.data?.connected ? inbox.data.emails.map((e) => emailToMsg(e, readIds)) : demo),
    [inbox.data, demo, readIds],
  );
  const selected = messages.find((m) => m.id === selectedId);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await syncGmail();
      if (result.ok) {
        await queryClient.invalidateQueries({ queryKey: ["inbox"] });
        notify(`Synced ${result.count} emails from Gmail`);
      } else if (result.code === "RECONNECT") {
        notify("Gmail authorization expired. Please reconnect.");
      } else {
        notify("Gmail sync failed. Please try again.");
      }
    } finally {
      setSyncing(false);
    }
  };

  const autoSynced = useRef(false);
  useEffect(() => {
    if (connected && !autoSynced.current) {
      autoSynced.current = true;
      void sync();
    }
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("gmail");
    if (!status) return;
    if (status === "connected") notify("Gmail connected");
    else if (status === "denied") notify("Gmail connection was cancelled");
    else notify("Gmail connection failed. Please try again.");
    window.history.replaceState(null, "", "/inbox");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const actions = useMemo(
    () => (selected && !selected.gmail ? getActionsForMessage(selected) : []),
    [selectedId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    setChecked(actions.map(() => true));
    setApproved(false);
    setReplying(false);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(
    () =>
      messages.filter(
        (m) =>
          (ch === "All" || m.ch === ch) &&
          [m.from, m.subj, m.prev, m.req].some((v) =>
            v.toLowerCase().includes(query.toLowerCase()),
          ),
      ),
    [messages, ch, query],
  );
  const choose = (id: string) => {
    setPaste(null);
    setSelectedId(id);
    setApproved(false);
    if (connected) setReadIds((ids) => new Set(ids).add(id));
    else setDemo((items) => items.map((m) => (m.id === id ? { ...m, unread: false } : m)));
  };
  const ChannelIcon =
    selected?.ch === "SMS"
      ? MessageSquare
      : selected?.ch === "Teams"
        ? Users
        : selected?.ch === "Chat"
          ? MessageCircle
          : Mail;
  return (
    <AppShell>
      <div className="flex h-full min-h-[calc(100vh-3.5rem)] flex-col xl:flex-row">
        <div
          className={`${selected || paste ? "hidden xl:flex" : "flex"} w-full shrink-0 flex-col border-r bg-card xl:flex xl:w-80`}
        >
          <div className="border-b p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h1 className="font-semibold">Unified Inbox</h1>
              <button
                onClick={() =>
                  setPaste({ emailId: null, fromName: "", fromEmail: "", subject: "", body: "" })
                }
                className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                Paste an email
              </button>
            </div>
            {inbox.isSuccess ? (
              connected ? (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate">Gmail: {inbox.data.email}</span>
                  <span className="flex shrink-0 gap-2">
                    <button disabled={syncing} onClick={() => void sync()} className="text-primary">
                      {syncing ? "Syncing…" : "Sync"}
                    </button>
                    <button
                      onClick={() => {
                        void disconnectGmail().then(() => {
                          setSelectedId("");
                          return queryClient.invalidateQueries({ queryKey: ["inbox"] });
                        });
                      }}
                    >
                      Disconnect
                    </button>
                  </span>
                </div>
              ) : (
                <div className="mb-2 rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
                  Showing demo messages.{" "}
                  <a href="/api/gmail/connect" className="font-medium text-primary">
                    Connect Gmail
                  </a>{" "}
                  to see your real inbox.
                </div>
              )
            ) : null}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search messages…"
                className="h-8 w-full rounded-md border bg-muted pl-8 pr-3 text-xs outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {channels.map((c) => (
                <button
                  key={c.k}
                  onClick={() => setCh(c.k)}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${ch === c.k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                >
                  {c.icon ? <c.icon className="h-3 w-3" /> : null}
                  {c.k}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.map((m) => (
              <button
                key={m.id}
                onClick={() => choose(m.id)}
                className={`w-full border-b px-4 py-3 text-left ${m.id === selected?.id ? "border-l-2 border-l-primary bg-primary-soft" : "hover:bg-muted"}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${m.unread ? "font-semibold" : ""}`}>{m.from}</span>
                  <span className="text-[11px] text-muted-foreground">{m.time}</span>
                </div>
                <div className="truncate text-xs font-medium">{m.subj}</div>
                <div className="truncate text-xs text-muted-foreground">{m.prev}</div>
                <div className="mt-1.5 flex gap-1.5">
                  <span className="rounded bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
                    {m.req}
                  </span>
                  <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                    {m.ch}
                  </span>
                </div>
              </button>
            ))}
            {list.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No messages match this filter.
              </div>
            ) : null}
          </div>
        </div>
        {paste ? (
          <PasteEmail paste={paste} setPaste={setPaste} />
        ) : selected ? (
          <>
            <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
              <button
                onClick={() => setSelectedId("")}
                className="mb-3 flex items-center gap-1 text-sm text-muted-foreground xl:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to messages
              </button>
              <div className="rounded-lg border bg-card p-5 shadow-card sm:p-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ChannelIcon className="h-3.5 w-3.5" />
                  {selected.ch} · {selected.time}
                </div>
                <h2 className="mt-2 text-xl font-semibold">{selected.subj}</h2>
                <div className="mt-3 flex items-center gap-3 border-b pb-4">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-xs font-semibold">
                    {selected.from
                      .split(" ")
                      .map((x) => x[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                  <div className="text-sm">
                    <div className="font-medium">{selected.from}</div>
                    <div className="text-xs text-muted-foreground">
                      {selected.gmail ? selected.role : `${selected.role} · to ${managerName}`}
                    </div>
                  </div>
                </div>
                <p className="whitespace-pre-wrap break-words py-6 text-[15px]">{selected.body}</p>
                {selected.gmail ? (
                  <a
                    href={`mailto:${selected.gmail.fromEmail}?subject=${encodeURIComponent(/^re:/i.test(selected.subj) ? selected.subj : `Re: ${selected.subj}`)}`}
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    <Reply className="h-4 w-4" />
                    Reply in your email app
                  </a>
                ) : replying ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!reply.trim()) return;
                      notify(`Reply sent to ${selected.from}`);
                      setReplying(false);
                      setReply("");
                    }}
                  >
                    <textarea
                      autoFocus
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={`Reply to ${selected.from}…`}
                      className="min-h-28 w-full rounded-md border p-3 text-sm outline-none focus:border-ring"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReplying(false)}
                        className="rounded-md border px-3 py-2 text-sm"
                      >
                        Cancel
                      </button>
                      <button className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                        <Send className="h-4 w-4" />
                        Send reply
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setReplying(true)}
                    className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    <Reply className="h-4 w-4" />
                    Reply
                  </button>
                )}
              </div>
            </div>
            <aside className="w-full shrink-0 border-l bg-card p-5 pb-24 xl:w-96">
              {selected.gmail ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-md bg-ai-soft text-ai">
                      <Mail className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-semibold">From your Gmail inbox</span>
                  </div>
                  <div className="mt-5 border-t pt-5">
                    <EmailIntakePanel
                      email={{
                        emailId: selected.id,
                        fromName: selected.from,
                        fromEmail: selected.gmail.fromEmail,
                        subject: selected.subj,
                        body: selected.body,
                      }}
                    />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Gmail access is read-only. Nothing is sent or changed in your mailbox.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-md bg-ai-soft text-ai">
                      <Bot className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-semibold">Suggested actions</span>
                  </div>
                  <div className="mt-4 space-y-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Related request</div>
                      <Link
                        to="/requests/$id"
                        params={{ id: selected.req }}
                        className="font-medium text-primary hover:underline"
                      >
                        {selected.req} — {selected.subj}
                      </Link>
                    </div>
                  </div>
                  <div className="mt-5">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Next steps
                    </div>
                    <div className="space-y-2">
                      {actions.map((a, i) => (
                        <label
                          key={a}
                          className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            checked={checked[i] ?? false}
                            disabled={approved}
                            onChange={() =>
                              setChecked((items) => items.map((v, j) => (j === i ? !v : v)))
                            }
                            className="mt-0.5 accent-primary"
                          />
                          <span>
                            <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                            {a}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {approved ? (
                    <div className="mt-4 rounded-md bg-done-soft p-3 text-sm text-done">
                      {checked.filter(Boolean).length} actions approved. Drafts are ready for
                      review.
                    </div>
                  ) : (
                    <button
                      disabled={!checked.some(Boolean)}
                      onClick={() => {
                        setApproved(true);
                        updateRequest(selected.req, {
                          column: "Scheduled",
                          status: "Ready to schedule",
                          lastUpdate: "Just now",
                        });
                        notify(`${checked.filter(Boolean).length} workflow actions applied`);
                      }}
                      className="mt-4 w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      Review & Approve Actions
                    </button>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Nothing is sent or changed until you approve.
                  </p>
                </>
              )}
            </aside>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a message to read it.
          </div>
        )}
      </div>
    </AppShell>
  );
}

const pasteField =
  "mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:border-ring";

/** Paste any email (or load a sample) and run it through AI intake — works without Gmail. */
function PasteEmail({
  paste,
  setPaste,
}: {
  paste: IntakeEmail;
  setPaste: (e: IntakeEmail | null) => void;
}) {
  const update = (k: keyof IntakeEmail, v: string) => setPaste({ ...paste, [k]: v });
  return (
    <>
      <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <button
          onClick={() => setPaste(null)}
          className="mb-3 flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to messages
        </button>
        <div className="rounded-lg border bg-card p-5 shadow-card sm:p-6">
          <h2 className="text-xl font-semibold">Paste an email</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste a maintenance email from any inbox, or load an example, then let Banjg AI draft
            the request.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sampleEmails.map(({ label, ...sample }) => (
              <button
                key={label}
                onClick={() => setPaste(sample)}
                className="rounded-md bg-muted px-2.5 py-1 text-xs hover:bg-primary-soft"
              >
                Example: {label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted-foreground">
              Sender name
              <input
                value={paste.fromName}
                onChange={(e) => update("fromName", e.target.value)}
                className={pasteField}
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Sender email
              <input
                value={paste.fromEmail}
                onChange={(e) => update("fromEmail", e.target.value)}
                className={pasteField}
              />
            </label>
          </div>
          <label className="mt-3 block text-xs font-medium text-muted-foreground">
            Subject
            <input
              value={paste.subject}
              onChange={(e) => update("subject", e.target.value)}
              className={pasteField}
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-muted-foreground">
            Email text
            <textarea
              value={paste.body}
              onChange={(e) => update("body", e.target.value)}
              className={`${pasteField} min-h-48`}
            />
          </label>
        </div>
      </div>
      <aside className="w-full shrink-0 border-l bg-card p-5 pb-24 xl:w-96">
        {paste.body.trim() ? (
          <EmailIntakePanel email={paste} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Paste the email text (or load an example) to draft a request.
          </p>
        )}
      </aside>
    </>
  );
}
