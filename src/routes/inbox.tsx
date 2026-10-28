import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Inbox as InboxIcon,
  Mail,
  Reply,
  Search,
  Send,
  Trash2,
  PenSquare,
  Undo2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useWorkspace } from "@/lib/workspace";
import { disconnectGmail, getInbox, moveEmail, sendEmail, syncGmail } from "@/lib/gmail.functions";
import { linkEmail } from "@/lib/incidents.functions";

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Unified Inbox — Banjg Property" },
      {
        name: "description",
        content: "Your Gmail inbox organised around repair requests.",
      },
    ],
  }),
  component: InboxPage,
});

function formatTime(ms: number) {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function InboxPage() {
  const [query, setQuery] = useState("");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState("");
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [folder, setFolder] = useState<"inbox" | "sent" | "trash">("inbox");
  const [composing, setComposing] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [requestId, setRequestId] = useState("");
  const [moving, setMoving] = useState(false);
  const [reconnect, setReconnect] = useState(false);
  const { requests, addRequest, notify } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const inbox = useQuery({ queryKey: ["inbox"], queryFn: () => getInbox(), staleTime: Infinity });
  const connected = inbox.data?.connected === true;
  const emails = useMemo(() => (inbox.data?.connected ? inbox.data.emails : []), [inbox.data]);
  const selected = emails.find((m) => m.id === selectedId);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await syncGmail();
      if (result.ok) {
        await queryClient.invalidateQueries({ queryKey: ["inbox"] });
        notify(`Synced ${result.count} emails from Gmail`);
      } else if (result.code === "RECONNECT") {
        setReconnect(true);
        notify("Please reconnect Gmail to update mailbox permissions.");
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

  useEffect(() => {
    setReplying(false);
    setReply("");
  }, [selectedId]);

  const list = useMemo(() => {
    const q = query.toLowerCase();
    return emails
      .filter((m) =>
        folder === "trash" ? m.trashed : !m.trashed && (folder === "sent" ? m.sent : m.inInbox),
      )
      .filter((m) =>
        [m.fromName, m.fromEmail, m.toEmails, m.subject, m.snippet].some((v) =>
          v.toLowerCase().includes(q),
        ),
      );
  }, [emails, query, folder]);

  const linkedRequest = selected?.requestId
    ? requests.find((r) => r.id === selected.requestId)
    : undefined;

  const choose = (id: string) => {
    setComposing(false);
    setSelectedId(id);
    setReadIds((ids) => new Set(ids).add(id));
  };

  const moveSelected = async () => {
    if (!selected || moving) return;
    setMoving(true);
    try {
      const result = await moveEmail({ data: { id: selected.id, trash: !selected.trashed } });
      if (result.ok) {
        notify(selected.trashed ? "Email restored" : "Email moved to Trash");
        setSelectedId("");
        await refreshLinks();
      } else {
        if (result.code === "RECONNECT") setReconnect(true);
        notify(
          result.code === "RECONNECT"
            ? "Reconnect Gmail to allow deleting and restoring emails."
            : "Could not move email. Please try again.",
        );
      }
    } catch {
      notify("Could not move email. Please try again.");
    } finally {
      setMoving(false);
    }
  };

  const submitCompose = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const result = await sendEmail({
        data: {
          to: to.trim(),
          subject: subject.trim(),
          body: body.trim(),
          requestId: requestId || null,
        },
      });
      if (result.ok) {
        notify("Email sent");
        setComposing(false);
        setTo("");
        setSubject("");
        setBody("");
        setRequestId("");
        setFolder("sent");
        setSelectedId("");
        await refreshLinks();
      } else {
        if (result.code === "RECONNECT") setReconnect(true);
        notify(
          result.code === "RECONNECT"
            ? "Reconnect Gmail before sending."
            : "Could not send email. Your draft is still here.",
        );
      }
    } catch {
      notify("Could not send email. Your draft is still here.");
    } finally {
      setSending(false);
    }
  };

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      const result = await sendEmail({
        data: {
          to: selected.fromEmail,
          subject: /^re:/i.test(selected.subject) ? selected.subject : `Re: ${selected.subject}`,
          body: reply.trim(),
          requestId: selected.requestId,
          threadId: selected.threadId,
        },
      });
      if (result.ok) {
        notify(`Reply sent to ${selected.fromName}`);
        setReplying(false);
        setReply("");
        await queryClient.invalidateQueries({ queryKey: ["inbox"] });
        await queryClient.invalidateQueries({ queryKey: ["incident"] });
      } else if (result.code === "RECONNECT") {
        notify("Gmail needs to be reconnected to send emails.");
      } else {
        notify("The reply could not be sent. Please try again.");
      }
    } finally {
      setSending(false);
    }
  };

  const refreshLinks = async () => {
    await queryClient.invalidateQueries({ queryKey: ["inbox"] });
    await queryClient.invalidateQueries({ queryKey: ["incident"] });
  };

  return (
    <AppShell>
      <div className="flex h-full min-h-[calc(100vh-3.5rem)] flex-col xl:flex-row">
        <div
          className={`${selected ? "hidden xl:flex" : "flex"} w-full shrink-0 flex-col border-r bg-card xl:flex xl:w-80`}
        >
          <div className="border-b p-3">
            <h1 className="mb-2 font-semibold">Unified Inbox</h1>
            {connected ? (
              <>
                <button
                  onClick={() => {
                    setSelectedId("");
                    setComposing(true);
                  }}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                >
                  <PenSquare className="h-4 w-4" />
                  Compose
                </button>
                <nav aria-label="Mail folders" className="mb-3 flex gap-1">
                  {(["inbox", "sent", "trash"] as const).map((value) => (
                    <button
                      key={value}
                      aria-pressed={folder === value}
                      onClick={() => {
                        setFolder(value);
                        setSelectedId("");
                        setComposing(false);
                      }}
                      className={`flex-1 rounded-md px-2 py-2 text-xs capitalize ${folder === value ? "bg-primary-soft font-semibold text-primary" : "hover:bg-muted"}`}
                    >
                      {value === "sent" ? "Sent" : value === "trash" ? "Trash" : "Inbox"}
                    </button>
                  ))}
                </nav>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Sync loads up to 100 recent emails from the last 30 days.
                </p>
                <a
                  href="/api/gmail/connect"
                  className={`mb-2 block text-xs text-primary ${reconnect ? "rounded border border-primary p-2 font-semibold" : ""}`}
                >
                  {reconnect
                    ? "Reconnect Gmail — mailbox permission required"
                    : "Update Gmail permissions"}
                </a>
              </>
            ) : null}
            {inbox.isSuccess && connected ? (
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
            ) : null}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search emails…"
                className="h-8 w-full rounded-md border bg-muted pl-8 pr-3 text-xs outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.map((m) => {
              const unread = m.unread && !readIds.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => choose(m.id)}
                  className={`w-full border-b px-4 py-3 text-left ${m.id === selected?.id ? "border-l-2 border-l-primary bg-primary-soft" : "hover:bg-muted"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${unread ? "font-semibold" : ""}`}>
                      {folder === "sent" ? `To: ${m.toEmails}` : m.fromName}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatTime(m.receivedAt)}
                    </span>
                  </div>
                  <div className="truncate text-xs font-medium">{m.subject}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.snippet}</div>
                  <div className="mt-1.5 flex gap-1.5">
                    <span className="rounded bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
                      {m.requestId ?? "Unlinked"}
                    </span>
                  </div>
                </button>
              );
            })}
            {inbox.isSuccess && !connected ? (
              <div className="p-6 text-center">
                <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No mailbox connected</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Connect your Gmail to bring tenant, landlord and repair team emails into your
                  requests.
                </p>
                <a
                  href="/api/gmail/connect"
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  <Mail className="h-4 w-4" />
                  Connect Gmail
                </a>
              </div>
            ) : null}
            {connected && list.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {emails.length === 0
                  ? syncing
                    ? "Fetching your emails…"
                    : "No emails in this folder. Press Sync to refresh."
                  : "No emails match your search."}
              </div>
            ) : null}
          </div>
        </div>
        {composing ? (
          <div className="min-w-0 flex-1 p-4 sm:p-6">
            <form
              onSubmit={(event) => void submitCompose(event)}
              className="mx-auto max-w-3xl space-y-4 rounded-lg border bg-card p-5"
            >
              <h2 className="text-xl font-semibold">New email</h2>
              <label className="block text-sm">
                To
                <input
                  type="email"
                  required
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="mt-1 block w-full rounded-md border bg-background p-2"
                />
              </label>
              <label className="block text-sm">
                Subject
                <input
                  required
                  maxLength={300}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="mt-1 block w-full rounded-md border bg-background p-2"
                />
              </label>
              <label className="block text-sm">
                Repair request (optional)
                <select
                  value={requestId}
                  onChange={(event) => setRequestId(event.target.value)}
                  className="mt-1 block w-full rounded-md border bg-background p-2"
                >
                  <option value="">No linked request</option>
                  {requests.map((request) => (
                    <option key={request.id} value={request.id}>
                      {request.id} — {request.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Message
                <textarea
                  required
                  maxLength={20000}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="mt-1 block min-h-64 w-full rounded-md border bg-background p-3"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => setComposing(false)}
                  className="rounded-md border px-4 py-2 text-sm"
                >
                  Close draft
                </button>
                <button
                  disabled={sending || !to.trim() || !subject.trim() || !body.trim()}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {sending ? "Sending…" : "Send email"}
                </button>
              </div>
            </form>
          </div>
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
                  <Mail className="h-3.5 w-3.5" />
                  Email · {new Date(selected.receivedAt).toLocaleString()}
                </div>
                <h2 className="mt-2 text-xl font-semibold">{selected.subject}</h2>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="break-all">To: {selected.toEmails}</span>
                  <button
                    disabled={moving}
                    onClick={() => void moveSelected()}
                    className="flex shrink-0 items-center gap-1 rounded-md border px-3 py-2 text-foreground disabled:opacity-50"
                  >
                    {selected.trashed ? (
                      <Undo2 className="h-4 w-4" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {moving ? "Moving…" : selected.trashed ? "Restore" : "Move to Trash"}
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-3 border-b pb-4">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-xs font-semibold">
                    {selected.fromName
                      .split(" ")
                      .map((x) => x[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="text-sm">
                    <div className="font-medium">{selected.fromName}</div>
                    <div className="text-xs text-muted-foreground">{selected.fromEmail}</div>
                  </div>
                </div>
                <p className="whitespace-pre-wrap break-words py-6 text-[15px]">{selected.body}</p>
                {selected.trashed || selected.sent ? null : replying ? (
                  <form onSubmit={(e) => void submitReply(e)}>
                    <textarea
                      autoFocus
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={`Reply to ${selected.fromName}…`}
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
                      <button
                        disabled={sending || !reply.trim()}
                        className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
                      >
                        <Send className="h-4 w-4" />
                        {sending ? "Sending…" : "Send reply"}
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
            <aside className="w-full shrink-0 border-l bg-card p-5 xl:w-96">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Repair request
              </div>
              {selected.requestId ? (
                <div className="mt-3 space-y-3 text-sm">
                  <Link
                    to="/requests/$id"
                    params={{ id: selected.requestId }}
                    className="font-medium text-primary hover:underline"
                  >
                    {selected.requestId}
                    {linkedRequest ? ` — ${linkedRequest.title}` : ""}
                  </Link>
                  {linkedRequest ? (
                    <>
                      <div>
                        <div className="text-xs text-muted-foreground">Stage</div>
                        {linkedRequest.column} · {linkedRequest.status}
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Next action</div>
                        {linkedRequest.nextAction}
                      </div>
                    </>
                  ) : null}
                  <button
                    onClick={() =>
                      void linkEmail({ data: { emailId: selected.id, requestId: null } })
                        .then(refreshLinks)
                        .then(() => notify("Email unlinked"))
                    }
                    className="rounded border px-2 py-1 text-xs hover:bg-muted"
                  >
                    Unlink from {selected.requestId}
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-4 text-sm">
                  <p className="text-muted-foreground">
                    This email is not linked to a request. Emails are linked automatically when the
                    sender has been added to a request.
                  </p>
                  <button
                    onClick={() => {
                      const created = addRequest({
                        title: selected.subject.slice(0, 200),
                        address: "Address to be confirmed",
                        priority: "Medium",
                      });
                      void linkEmail({ data: { emailId: selected.id, requestId: created.id } });
                      notify(`${created.id} created from email`);
                      void navigate({ to: "/requests/$id", params: { id: created.id } });
                    }}
                    className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground"
                  >
                    Create repair request from this email
                  </button>
                  {requests.some((r) => r.column !== "Completed") ? (
                    <label className="block text-xs text-muted-foreground">
                      Or link to an existing request
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const id = e.target.value;
                          if (!id) return;
                          void linkEmail({ data: { emailId: selected.id, requestId: id } })
                            .then(refreshLinks)
                            .then(() => notify(`Email linked to ${id}`));
                        }}
                        className="mt-1 block h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                      >
                        <option value="">Choose a request…</option>
                        {requests
                          .filter((r) => r.column !== "Completed")
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.id} — {r.title}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              )}
              <p className="mt-6 text-xs text-muted-foreground">
                Replies are sent from your Gmail account and appear in the request timeline.
              </p>
            </aside>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {connected ? "Select an email to read it." : "Connect Gmail to see your emails here."}
          </div>
        )}
      </div>
    </AppShell>
  );
}
