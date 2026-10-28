import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Home,
  Inbox,
  ClipboardList,
  Building2,
  Users,
  CalendarDays,
  BarChart3,
  Settings,
  Search,
  Bell,
  MessageSquareText,
  Menu,
  X,
  Check,
  LogOut,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { AssistantPanel } from "./AssistantPanel";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { getInbox } from "@/lib/gmail.functions";

const nav = [
  { label: "Home", icon: Home, to: "/" as const },
  { label: "Unified Inbox", icon: Inbox, to: "/inbox" as const },
  { label: "Requests", icon: ClipboardList, to: "/" as const, view: "list" as const },
  {
    label: "Properties",
    icon: Building2,
    to: "/workspace/$section" as const,
    section: "properties",
  },
  { label: "Contacts", icon: Users, to: "/workspace/$section" as const, section: "contacts" },
  {
    label: "Calendar",
    icon: CalendarDays,
    to: "/workspace/$section" as const,
    section: "calendar",
  },
  { label: "Analytics", icon: BarChart3, to: "/workspace/$section" as const, section: "analytics" },
  { label: "Settings", icon: Settings, to: "/workspace/$section" as const, section: "settings" },
];

export function AppShell({
  children,
  onOpenAI,
  openAssistantSignal = 0,
}: {
  children: ReactNode;
  onOpenAI?: () => void;
  openAssistantSignal?: number;
}) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [profile, setProfile] = useState(false);
  const { requests, toasts, dismissToast } = useWorkspace();
  const { user, ready, isSignedIn, signOut } = useAuth();
  const { data: inbox } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => getInbox(),
    staleTime: Infinity,
    enabled: isSignedIn,
  });
  const unreadCount = inbox?.connected
    ? inbox.emails.filter((m) => m.unread && m.inInbox && !m.trashed).length
    : 0;
  const navigate = useNavigate();
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ready && !isSignedIn) void navigate({ to: "/login", replace: true });
  }, [navigate, ready, isSignedIn]);

  useEffect(() => {
    if (openAssistantSignal > 0) setAssistantOpen(true);
  }, [openAssistantSignal]);

  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  useEffect(() => {
    if (!profile) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfile(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profile]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? requests
          .filter((item) =>
            [item.id, item.title, item.address, item.status, item.waitingOn].some((value) =>
              value.toLowerCase().includes(q),
            ),
          )
          .slice(0, 6)
      : [];
  }, [requests, search]);

  const notifItems = useMemo(
    () =>
      requests
        .filter(
          (r) =>
            r.column === "Action Needed" || (r.column === "Waiting" && r.waiting.includes("day")),
        )
        .slice(0, 5),
    [requests],
  );

  const openAI = () => {
    setAssistantOpen(true);
    onOpenAI?.();
  };

  if (!ready || !isSignedIn) {
    return (
      <div
        className="grid min-h-screen place-items-center bg-background"
        aria-label="Loading workspace"
      />
    );
  }

  const sidebar = (
    <aside className="h-full w-56 shrink-0 border-r bg-sidebar p-3">
      <nav className="space-y-0.5" aria-label="Main navigation">
        {nav.map((n) => {
          const inner = (
            <>
              <n.icon className="h-4 w-4" />
              <span className="flex-1">{n.label}</span>
              {n.to === "/inbox" && unreadCount > 0 ? (
                <span className="rounded bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {unreadCount}
                </span>
              ) : null}
            </>
          );
          const cls =
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
          return n.to ? (
            <Link
              key={n.label}
              to={n.to}
              {...("section" in n ? { params: { section: n.section } } : {})}
              {...("view" in n ? { search: { view: n.view } } : {})}
              onClick={() => setMobileNav(false)}
              className={cls}
              activeOptions={{ exact: n.to === "/", includeSearch: n.to === "/" }}
              activeProps={{ className: "bg-sidebar-accent font-medium text-primary" }}
            >
              {inner}
            </Link>
          ) : null;
        })}
      </nav>
    </aside>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3 sm:px-4">
        <button
          onClick={() => setMobileNav(true)}
          className="rounded-md p-2 hover:bg-muted md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/" className="flex items-center gap-2 md:w-52">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            B
          </div>
          <span className="hidden font-semibold tracking-tight sm:inline">
            Banjg <span className="font-normal text-muted-foreground">Property</span>
          </span>
        </Link>
        <div className="relative mx-auto flex-1 md:max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search requests, properties or people…"
            aria-label="Global search"
            className="h-9 w-full rounded-md border bg-muted pl-9 pr-8 text-sm outline-none focus:border-ring focus:bg-card"
          />
          {search ? (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-card"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {search ? (
            <div className="absolute left-0 right-0 top-11 z-50 max-h-80 overflow-auto rounded-lg border bg-card p-2 shadow-float">
              {results.length ? (
                results.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSearch("");
                      navigate({ to: "/requests/$id", params: { id: item.id } });
                    }}
                    className="flex w-full items-start gap-3 rounded-md p-3 text-left hover:bg-muted"
                  >
                    <span className="font-mono text-xs text-primary">{item.id}</span>
                    <span>
                      <span className="block text-sm font-medium">{item.title}</span>
                      <span className="block text-xs text-muted-foreground">{item.address}</span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No results for "{search}"
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative rounded-md p-2 text-muted-foreground hover:bg-muted"
              aria-label="Notifications"
              aria-expanded={notifOpen}
            >
              <Bell className="h-5 w-5" />
              {notifItems.length > 0 ? (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-attention" />
              ) : null}
            </button>
            {notifOpen ? (
              <div className="absolute right-0 top-10 z-50 w-72 rounded-lg border bg-card shadow-float">
                <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                  Needs attention
                </div>
                {notifItems.length > 0 ? (
                  notifItems.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setNotifOpen(false);
                        void navigate({ to: "/requests/$id", params: { id: r.id } });
                      }}
                      className="flex w-full items-start gap-3 rounded-md p-3 text-left hover:bg-muted"
                    >
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-attention" />
                      <span>
                        <span className="block text-xs font-medium">{r.title}</span>
                        <span className="block text-xs text-muted-foreground">{r.nextAction}</span>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-muted-foreground">All caught up</div>
                )}
              </div>
            ) : null}
          </div>
          <div ref={profileRef} className="relative">
            <button
              onClick={() => setProfile((v) => !v)}
              className="flex items-center gap-2 rounded-md p-1 hover:bg-muted"
              aria-expanded={profile}
            >
              <div className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                {(user?.name ?? "?")
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="hidden text-left text-xs leading-tight lg:block">
                <div className="font-medium">{user?.name ?? ""}</div>
                <div className="text-muted-foreground">Property Manager</div>
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground lg:block" />
            </button>
            {profile ? (
              <div className="absolute right-0 top-10 w-56 rounded-lg border bg-card p-2 shadow-float">
                <div className="border-b px-3 py-2 text-xs text-muted-foreground">
                  Signed in as {user?.email ?? ""}
                </div>
                <button
                  onClick={() => {
                    setProfile(false);
                    void navigate({ to: "/workspace/$section", params: { section: "settings" } });
                  }}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-muted"
                >
                  <Settings className="h-4 w-4" />
                  Workspace settings
                </button>
                <button
                  onClick={() => {
                    setProfile(false);
                    signOut();
                    void navigate({ to: "/login", replace: true });
                  }}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="hidden md:block">{sidebar}</div>
        {mobileNav ? (
          <>
            <button
              onClick={() => setMobileNav(false)}
              className="fixed inset-0 z-40 bg-black/30 md:hidden"
              aria-label="Close navigation"
            />
            <div className="fixed inset-y-0 left-0 z-50 bg-sidebar pt-2 shadow-float md:hidden">
              <div className="flex items-center justify-between px-4 pb-2">
                <span className="font-semibold">Banjg Property</span>
                <button onClick={() => setMobileNav(false)} className="p-2">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {sidebar}
            </div>
          </>
        ) : null}
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        {assistantOpen ? <AssistantPanel onClose={() => setAssistantOpen(false)} /> : null}
      </div>
      {!assistantOpen ? (
        <button
          onClick={openAI}
          className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-float hover:opacity-95"
        >
          <MessageSquareText className="h-4 w-4" />
          <span className="hidden sm:inline">Ask Banjg AI</span>
        </button>
      ) : null}
      <div
        className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <button
            key={toast.id}
            onClick={() => dismissToast(toast.id)}
            className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm text-background shadow-float"
          >
            <Check className="h-4 w-4 text-done" />
            {toast.message}
          </button>
        ))}
      </div>
    </div>
  );
}
