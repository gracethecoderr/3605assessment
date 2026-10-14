import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building2, CalendarDays, Check, Link2, Search, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/workspace/$section")({
  head: ({ params }) => ({ meta: [{ title: `${title(params.section)} — Banjg Property` }] }),
  component: WorkspaceSection,
});

const properties = [
  ["14 King Street, Unit 7", "James Wong", "David Chen", "1 active request"],
  ["12 Hill St, Newtown", "Amelia Fox", "Olivia Martin", "1 urgent request"],
  ["2/7 Bay St, Coogee", "Mia Russo", "Anthony Costa", "Inspection due"],
  ["41 Wattle Ave, Marrickville", "Noah Lee", "Helen Park", "1 active request"],
];
const contacts = [
  ["James Wong", "Tenant", "14 King Street, Unit 7", "Email · WhatsApp"],
  ["David Chen", "Landlord", "3 properties", "Email"],
  ["CoolAir Services", "Trade · HVAC", "Licence 284019C", "Email · SMS"],
  ["Inner West Plumbing", "Trade · Plumbing", "4.8 rating", "Teams · SMS"],
];
const integrations = [
  ["DeepSeek", "AI assistant", "Needs API key"],
  ["Instagram", "Meta messaging", "Not connected"],
  ["WhatsApp Business", "Tenant and trade messaging", "Not connected"],
  ["Microsoft Teams", "Internal collaboration", "Not connected"],
  ["Slack", "Internal collaboration", "Not connected"],
  ["Gmail / Outlook", "Shared inbox", "Not connected"],
  ["PropertyMe / Property Tree", "Property management", "Not connected"],
  ["AppFolio / Buildium", "Property management", "Not connected"],
];

const subtitles: Record<string, string> = {
  properties: "Every managed property, with its tenant and landlord.",
  contacts: "Tenants, landlords and trades you work with.",
  calendar: "Booked inspections and trade visits.",
  analytics: "How repair requests are tracking across your portfolio.",
  settings: "Connected channels and integrations.",
};

const listHeaders: Record<string, string[]> = {
  properties: ["Property", "Tenant", "Landlord", "Status"],
  contacts: ["Name", "Role", "Details", "Channels"],
};

function title(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function WorkspaceSection() {
  const { section } = Route.useParams();
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title(section)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {subtitles[section] ?? "Manage your property workspace."}
          </p>
        </div>
        {section === "properties" || section === "contacts" ? (
          <PropertiesOrContacts section={section} />
        ) : section === "calendar" ? (
          <CalendarSection />
        ) : section === "analytics" ? (
          <AnalyticsSection />
        ) : (
          <IntegrationsSection />
        )}
      </div>
    </AppShell>
  );
}

function PropertiesOrContacts({ section }: { section: string }) {
  const data = section === "contacts" ? contacts : properties;
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => data.filter((row) => row.join(" ").toLowerCase().includes(query.toLowerCase())),
    [data, query],
  );
  return (
    <>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${section}…`}
          className="h-10 w-full rounded-md border bg-card pl-9 pr-3 text-sm outline-none"
        />
      </div>
      <div className="overflow-hidden rounded-lg border bg-card shadow-card">
        <div className="hidden gap-2 border-b bg-muted px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[1.5fr_1fr_1fr_9rem]">
          {(listHeaders[section] ?? []).map((h, i) => (
            <div key={h} className={i === 3 ? "text-right" : i === 0 ? "pl-7" : ""}>
              {h}
            </div>
          ))}
        </div>
        {filtered.map((row) => (
          <div
            key={row[0]}
            className="grid gap-2 border-b p-4 last:border-0 sm:grid-cols-[1.5fr_1fr_1fr_9rem] sm:items-center"
          >
            <div className="flex items-center gap-3 font-medium">
              {section === "contacts" ? (
                <Users className="h-4 w-4 text-primary" />
              ) : (
                <Building2 className="h-4 w-4 text-primary" />
              )}
              {row[0]}
            </div>
            {row.slice(1).map((cell, i) => (
              <div
                key={cell}
                className={`text-sm text-muted-foreground ${i === 2 ? "sm:text-right" : ""}`}
              >
                {cell}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function CalendarSection() {
  const { notify } = useWorkspace();
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[
        "10:00 AM · Smoke alarm service",
        "1:30 PM · Stormwater inspection",
        "3:00 PM · Tenant access call",
      ].map((event, index) => (
        <button
          key={event}
          onClick={() => notify(`Opened appointment: ${event}`)}
          className="rounded-lg border bg-card p-5 text-left shadow-card hover:border-primary"
        >
          <CalendarDays className="mb-4 h-5 w-5 text-primary" />
          <div className="text-xs text-muted-foreground">Today · {index + 1}</div>
          <div className="mt-1 font-medium">{event}</div>
        </button>
      ))}
    </div>
  );
}

function AnalyticsSection() {
  const { requests } = useWorkspace();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Open requests", requests.filter((r) => r.column !== "Completed").length],
        ["Urgent", requests.filter((r) => r.priority === "Urgent").length],
        ["Scheduled", requests.filter((r) => r.column === "Scheduled").length],
        [
          "Completion rate",
          requests.length
            ? `${Math.round((requests.filter((r) => r.column === "Completed").length / requests.length) * 100)}%`
            : "—",
        ],
      ].map(([label, value]) => (
        <div key={label as string} className="rounded-lg border bg-card p-5 shadow-card">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 text-3xl font-semibold">{value}</div>
        </div>
      ))}
    </div>
  );
}

function IntegrationsSection() {
  const { notify } = useWorkspace();
  const [connected, setConnected] = useState<string[]>([]);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {integrations.map(([name = "", description = "", status = ""]) => {
        const active = connected.includes(name);
        return (
          <div
            key={name}
            className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-card"
          >
            <div className="grid h-10 w-10 place-items-center rounded-md bg-primary-soft text-primary">
              <Link2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{name}</div>
              <div className="text-xs text-muted-foreground">
                {description} · {active ? "Connected for demo" : status}
              </div>
            </div>
            <button
              onClick={() => {
                setConnected((items) =>
                  active ? items.filter((x) => x !== name) : [...items, name],
                );
                notify(`${name} ${active ? "disconnected" : "connected for demo"}`);
              }}
              className={`rounded-md px-3 py-2 text-xs font-medium ${active ? "bg-done-soft text-done" : "border hover:bg-muted"}`}
            >
              {active ? (
                <span className="flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" />
                  Connected
                </span>
              ) : (
                "Configure"
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
