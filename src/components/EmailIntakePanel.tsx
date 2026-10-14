import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import type { Priority } from "@/lib/data";
import { reporterRoles, type IntakeDraft, type IntakeEmail, type ReporterRole } from "@/lib/intake";
import { analyseEmail, createRequestFromEmail } from "@/lib/intake.functions";
import { useWorkspace } from "@/lib/workspace";

const priorities: Priority[] = ["Urgent", "High", "Medium", "Low"];
const field =
  "mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring";
const label = "block text-xs font-medium text-muted-foreground";

/**
 * AI intake: the AI reads the email and drafts a request, the property manager checks and
 * edits it, and only their approval saves anything.
 */
export function EmailIntakePanel({ email }: { email: IntakeEmail }) {
  const { notify } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"idle" | "reading" | "review" | "saving">("idle");
  const [draft, setDraft] = useState<IntakeDraft | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();
  const [newInfo, setNewInfo] = useState("");
  const [safetyAck, setSafetyAck] = useState(false);

  // Start over whenever a different email is selected.
  const key = `${email.emailId ?? ""}|${email.subject}|${email.body}`;
  useEffect(() => {
    setPhase("idle");
    setDraft(null);
    setNotice(undefined);
    setSafetyAck(false);
  }, [key]);

  const read = async () => {
    setPhase("reading");
    try {
      const result = await analyseEmail({ data: email });
      setDraft(result.draft);
      setAiUsed(result.aiUsed);
      setNotice(result.notice);
      setPhase("review");
    } catch {
      notify("Could not read this email. Please try again.");
      setPhase("idle");
    }
  };

  const save = async () => {
    if (!draft) return;
    setPhase("saving");
    try {
      const result = await createRequestFromEmail({ data: { email, draft, aiUsed } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requests"] }),
        queryClient.invalidateQueries({ queryKey: ["inbox"] }),
      ]);
      notify(`${result.id} created from email`);
      void navigate({ to: "/requests/$id", params: { id: result.id } });
    } catch {
      notify("Could not save the request. Please try again.");
      setPhase("review");
    }
  };

  const set = <K extends keyof IntakeDraft>(k: K, v: IntakeDraft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  if (phase === "idle" || phase === "reading" || !draft) {
    return (
      <div>
        <Header />
        <p className="mt-4 text-sm text-muted-foreground">
          Banjg AI can read this email and draft a repair request: the issue, address, priority, who
          needs to act, and what information is still missing. You check it before anything is
          saved.
        </p>
        <button
          onClick={() => void read()}
          disabled={phase === "reading"}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {phase === "reading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading email…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Draft repair request with AI
            </>
          )}
        </button>
      </div>
    );
  }

  const flagged = draft.safetyReasons.length > 0;
  const canSave = draft.title.trim() && draft.nextAction.trim() && (!flagged || safetyAck);

  return (
    <div>
      <Header />
      <p className="mt-2 text-xs text-muted-foreground">
        {aiUsed ? "Drafted by AI from the email. Check and edit before approving." : notice}
      </p>

      {flagged ? (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <div className="flex items-center gap-2 font-semibold text-destructive">
            <ShieldAlert className="h-4 w-4" />
            Possible safety risk
          </div>
          <ul className="mt-1 list-disc pl-5 text-destructive">
            {draft.safetyReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-foreground">
            This will be marked Urgent. Banjg won't automate anything here: contact the tenant
            yourself and arrange an emergency trade.
          </p>
          <label className="mt-2 flex items-start gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={safetyAck}
              onChange={(e) => setSafetyAck(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            I've read this and will handle it personally
          </label>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <label className={label}>
          Issue
          <input
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            className={field}
          />
        </label>
        <label className={label}>
          Property address
          <input
            value={draft.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="Not in the email — add it or leave blank"
            className={field}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>
            Priority
            <select
              value={draft.priority}
              onChange={(e) => set("priority", e.target.value as Priority)}
              className={field}
            >
              {priorities.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Sender is the
            <select
              value={draft.reporterRole}
              onChange={(e) => set("reporterRole", e.target.value as ReporterRole)}
              className={field}
            >
              {reporterRoles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
        <label className={label}>
          Summary
          <textarea
            value={draft.summary}
            onChange={(e) => set("summary", e.target.value)}
            className={`${field} min-h-16`}
          />
        </label>
        <label className={label}>
          Next action
          <input
            value={draft.nextAction}
            onChange={(e) => set("nextAction", e.target.value)}
            className={field}
          />
        </label>
        <label className={label}>
          Waiting on
          <input
            value={draft.waitingOn}
            onChange={(e) => set("waitingOn", e.target.value)}
            className={field}
          />
        </label>
        <div>
          <div className={label}>Still needed</div>
          {draft.missingInfo.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">Nothing missing.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {draft.missingInfo.map((m, i) => (
                <li
                  key={`${m}-${i}`}
                  className="flex items-center justify-between rounded bg-waiting-soft px-2 py-1 text-xs text-waiting"
                >
                  {m}
                  <button
                    aria-label={`Remove ${m}`}
                    onClick={() =>
                      set(
                        "missingInfo",
                        draft.missingInfo.filter((_, j) => j !== i),
                      )
                    }
                    className="ml-2 font-semibold"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-1 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newInfo.trim()) return;
              set("missingInfo", [...draft.missingInfo, newInfo.trim()]);
              setNewInfo("");
            }}
          >
            <input
              value={newInfo}
              onChange={(e) => setNewInfo(e.target.value)}
              placeholder="Add something you still need…"
              className="h-7 flex-1 rounded-md border bg-card px-2 text-xs outline-none"
            />
          </form>
        </div>
      </div>

      <button
        onClick={() => void save()}
        disabled={!canSave || phase === "saving"}
        className="mt-5 w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {phase === "saving" ? "Saving…" : "Approve & create request"}
      </button>
      <button
        onClick={() => setPhase("idle")}
        className="mt-2 w-full rounded-md border py-2 text-sm"
      >
        Discard draft
      </button>
      <p className="mt-3 text-xs text-muted-foreground">
        Nothing is saved or sent until you approve. Your edits are what gets saved.
      </p>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-7 w-7 place-items-center rounded-md bg-ai-soft text-ai">
        <Bot className="h-4 w-4" />
      </div>
      <span className="text-sm font-semibold">AI intake</span>
    </div>
  );
}
