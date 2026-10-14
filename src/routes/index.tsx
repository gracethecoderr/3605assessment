import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  Hourglass,
  AlertCircle,
  CalendarCheck,
  Bot,
  ChevronRight,
  Plus,
  Filter,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequestCard } from "@/components/RequestCard";
import { columns, priorityTone, type Priority, type RepairRequest } from "@/lib/data";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — Banjg Property" },
      {
        name: "description",
        content: "See every repair request, who it's waiting on and what happens next.",
      },
    ],
  }),
  component: Dashboard,
});
const priorityRank = { Urgent: 0, High: 1, Medium: 2, Low: 3 } as const;

/** The open requests most worth the property manager's attention, most pressing first. */
function pickBriefing(requests: RepairRequest[]) {
  const score = (r: RepairRequest) =>
    priorityRank[r.priority] * 2 + (r.column === "Action Needed" ? 0 : 1);
  return requests
    .filter(
      (r) =>
        r.column !== "Completed" &&
        r.column !== "Scheduled" &&
        (r.priority === "Urgent" || r.priority === "High" || r.column === "Action Needed"),
    )
    .sort((a, b) => score(a) - score(b))
    .slice(0, 3);
}

function Dashboard() {
  const { requests, addRequest, notify } = useWorkspace();
  const briefing = useMemo(() => pickBriefing(requests), [requests]);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<"board" | "list">("board");
  const [priority, setPriority] = useState<"All" | Priority>("All");
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const dateStr = `${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]}`;
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const [newOpen, setNewOpen] = useState(false);
  const [aiSeed, setAiSeed] = useState(0);
  const filtered = useMemo(
    () => (priority === "All" ? requests : requests.filter((item) => item.priority === priority)),
    [requests, priority],
  );
  const stats = [
    {
      label: "Active Requests",
      value: requests.filter((r) => r.column !== "Completed").length,
      icon: Activity,
      tone: "text-primary bg-primary-soft",
    },
    {
      label: "Waiting",
      value: requests.filter((r) => r.column === "Waiting").length,
      icon: Hourglass,
      tone: "text-waiting bg-waiting-soft",
    },
    {
      label: "Need Attention",
      value: requests.filter((r) => r.column === "Action Needed").length,
      icon: AlertCircle,
      tone: "text-attention bg-attention-soft",
    },
    {
      label: "Scheduled Today",
      value: requests.filter((r) => r.column === "Scheduled").length,
      icon: CalendarCheck,
      tone: "text-scheduled bg-scheduled-soft",
    },
  ];
  return (
    <AppShell openAssistantSignal={aiSeed}>
      <div className="space-y-6 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{dateStr}</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {greeting}, {user?.name ?? "there"}
            </h1>
          </div>
          <button
            onClick={() => setNewOpen(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            Create request
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-card sm:p-5"
            >
              <div className={`grid h-10 w-10 place-items-center rounded-md ${s.tone}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-semibold">{s.value}</div>
                <div className="text-xs text-muted-foreground sm:text-sm">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
        <section className="rounded-lg border bg-card p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-ai-soft text-ai">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-ai">
                  Morning briefing
                </div>
                <h2 className="font-semibold">
                  {briefing.length === 0
                    ? "Nothing urgent right now"
                    : `${briefing.length} ${briefing.length === 1 ? "request needs" : "requests need"} your attention`}
                </h2>
              </div>
            </div>
            <button
              onClick={() => setAiSeed((v) => v + 1)}
              className="rounded-md border border-ai/30 bg-ai-soft px-3 py-2 text-sm font-medium text-ai hover:opacity-90"
            >
              Ask AI to prioritise my day
            </button>
          </div>
          {briefing.length > 0 ? (
            <div className="mt-4 divide-y rounded-md border">
              {briefing.map((b) => (
                <Link
                  key={b.id}
                  to="/requests/$id"
                  params={{ id: b.id }}
                  className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-muted"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${b.priority === "Urgent" ? "bg-destructive" : "bg-attention"}`}
                  />
                  <span className="font-mono text-xs text-muted-foreground">{b.id}</span>
                  <span className="hidden w-56 truncate font-medium sm:block">{b.title}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {b.status} · {b.nextAction}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No urgent or high-priority requests are waiting on you.
            </p>
          )}
        </section>
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold">Repair workflow</h2>
              <div
                className="flex rounded-md border bg-card p-0.5 text-xs"
                role="group"
                aria-label="View"
              >
                {(
                  [
                    ["board", "Board"],
                    ["list", "All events"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setView(key)}
                    aria-pressed={view === key}
                    className={`rounded px-2.5 py-1 ${view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only sm:not-sr-only">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as "All" | Priority)}
                className="bg-transparent outline-none"
              >
                <option>All</option>
                <option>Urgent</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </label>
          </div>
          {view === "list" ? (
            <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Request</th>
                    <th className="px-4 py-2 font-medium">Priority</th>
                    <th className="px-4 py-2 font-medium">Stage</th>
                    <th className="px-4 py-2 font-medium">Waiting on</th>
                    <th className="px-4 py-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link
                          to="/requests/$id"
                          params={{ id: r.id }}
                          className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                          <span className="block font-medium">{r.title}</span>
                          <span className="block text-xs text-muted-foreground">{r.address}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded border px-2 py-0.5 text-xs ${priorityTone[r.priority]}`}
                        >
                          {r.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">{r.column}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.waitingOn}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.lastUpdate}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                        No matching requests
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
          <div
            className={`grid min-w-[900px] grid-cols-5 gap-4 overflow-x-auto pb-3 lg:min-w-0 ${view === "list" ? "hidden" : ""}`}
          >
            {columns.map((c) => {
              const items = filtered.filter((r) => r.column === c.name);
              return (
                <div key={c.name} className="min-h-36 rounded-lg bg-muted/70 p-2">
                  <div className="mb-2 flex items-center gap-2 px-1 py-1">
                    <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className={`ml-auto rounded px-1.5 text-xs font-medium ${c.tone}`}>
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.map((r) => (
                      <RequestCard key={r.id} r={r} />
                    ))}
                    {items.length === 0 ? (
                      <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                        No matching requests
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      {newOpen ? (
        <CreateRequest
          onClose={() => setNewOpen(false)}
          onSubmit={(input) => {
            const item = addRequest(input);
            setNewOpen(false);
            notify(`${item.id} created`);
            navigate({ to: "/requests/$id", params: { id: item.id } });
          }}
        />
      ) : null}
    </AppShell>
  );
}

function CreateRequest({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: { title: string; address: string; priority: Priority }) => void;
}) {
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ title, address, priority });
        }}
        className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-float"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Create repair request</h2>
            <p className="text-sm text-muted-foreground">Add a new issue to the triage queue.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium">
            Issue
            <input
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Leaking bathroom tap"
              className="mt-1 h-10 w-full rounded-md border px-3 font-normal outline-none focus:border-ring"
            />
          </label>
          <label className="block text-sm font-medium">
            Property address
            <input
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 12 Hill St, Newtown"
              className="mt-1 h-10 w-full rounded-md border px-3 font-normal outline-none focus:border-ring"
            />
          </label>
          <label className="block text-sm font-medium">
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="mt-1 h-10 w-full rounded-md border bg-card px-3 font-normal"
            >
              <option>Urgent</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm">
            Cancel
          </button>
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Create request
          </button>
        </div>
      </form>
    </div>
  );
}
