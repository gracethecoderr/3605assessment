import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, Check, CircleCheck, LoaderCircle, Mail, Send, X } from "lucide-react";
import { sendEmail } from "@/lib/gmail.functions";
import { askDeepSeek, type AssistantEmailDraft } from "@/lib/deepseek";
import { useWorkspace } from "@/lib/workspace";

type SendState = "ready" | "sending" | "sent" | "cancelled" | "failed";
type Turn = {
  id: number;
  q: string;
  answer?: string;
  error?: string;
  emailDraft?: AssistantEmailDraft;
  sendState?: SendState;
  sendError?: string | null;
};

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const nextTurnId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { notify } = useWorkspace();

  const updateTurn = (id: number, patch: Partial<Turn>) => {
    setTurns((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const ask = async (q: string) => {
    if (!q.trim() || loading) return;
    setInput("");
    setLoading(true);
    const id = ++nextTurnId.current;
    try {
      const result = await askDeepSeek({ data: { question: q } });
      setTurns((items) => [
        ...items,
        result.ok
          ? {
              id,
              q,
              answer: result.answer,
              ...(result.emailDraft
                ? { emailDraft: result.emailDraft, sendState: "ready" as const }
                : {}),
            }
          : { id, q, error: result.message },
      ]);
    } catch {
      setTurns((items) => [
        ...items,
        { id, q, error: "The AI service is unavailable. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const confirmAndSend = async (turn: Turn) => {
    if (!turn.emailDraft || turn.sendState === "sending" || turn.sendState === "sent") return;
    updateTurn(turn.id, { sendState: "sending", sendError: null });
    try {
      const result = await sendEmail({
        data: {
          to: turn.emailDraft.to,
          subject: turn.emailDraft.subject,
          body: turn.emailDraft.body,
          requestId: turn.emailDraft.requestId,
          ...(turn.emailDraft.threadId ? { threadId: turn.emailDraft.threadId } : {}),
        },
      });
      if (result.ok) {
        updateTurn(turn.id, { sendState: "sent", sendError: null });
        notify(`Email sent to ${turn.emailDraft.toName}`);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["inbox"] }),
          queryClient.invalidateQueries({ queryKey: ["incident", turn.emailDraft.requestId] }),
        ]);
      } else {
        const message =
          result.code === "RECONNECT"
            ? "Reconnect Gmail in the Unified Inbox before sending."
            : "The email could not be sent. Please try again.";
        updateTurn(turn.id, { sendState: "failed", sendError: message });
      }
    } catch {
      updateTurn(turn.id, {
        sendState: "failed",
        sendError: "The email could not be sent. Please try again.",
      });
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-card shadow-float sm:w-[400px] md:static md:z-auto md:shadow-none">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-ai-soft text-ai">
          <Bot className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Banjg AI</div>
          <div className="text-[11px] text-muted-foreground">
            Drafts actions — nothing sends without your approval
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="Close AI assistant"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {turns.map((turn) => (
          <div key={turn.id} className="space-y-3">
            <div className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
              {turn.q}
            </div>
            <div
              className={`rounded-lg border p-3 text-sm ${turn.error ? "border-waiting/40 bg-waiting-soft" : "bg-ai-soft"}`}
            >
              <div
                className={`flex items-center gap-2 font-medium ${turn.error ? "text-waiting" : "text-ai"}`}
              >
                {turn.error ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {turn.error ? "AI setup required" : "Banjg AI"}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                {turn.error ?? turn.answer}
              </p>
            </div>

            {turn.emailDraft ? (
              <div className="overflow-hidden rounded-lg border bg-card text-sm shadow-card">
                <div className="flex items-center gap-2 border-b bg-muted px-3 py-2 font-medium">
                  <Mail className="h-4 w-4 text-primary" />
                  Email ready for approval
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {turn.emailDraft.requestId}
                  </span>
                </div>
                <dl className="grid grid-cols-[4rem_1fr] gap-x-2 gap-y-1 border-b px-3 py-2 text-xs">
                  <dt className="text-muted-foreground">To</dt>
                  <dd className="min-w-0 break-words font-medium">
                    {turn.emailDraft.toName} &lt;{turn.emailDraft.to}&gt;
                  </dd>
                  <dt className="text-muted-foreground">Subject</dt>
                  <dd className="min-w-0 break-words font-medium">{turn.emailDraft.subject}</dd>
                </dl>
                <div className="max-h-56 overflow-y-auto whitespace-pre-wrap px-3 py-3 text-muted-foreground">
                  {turn.emailDraft.body}
                </div>
                <div className="border-t bg-muted/50 p-3">
                  {turn.sendState === "sent" ? (
                    <div className="flex items-center gap-2 font-medium text-done" role="status">
                      <CircleCheck className="h-4 w-4" />
                      Email sent to {turn.emailDraft.toName}
                    </div>
                  ) : turn.sendState === "cancelled" ? (
                    <div className="text-muted-foreground" role="status">
                      Send cancelled. Ask me to revise the draft whenever you're ready.
                    </div>
                  ) : (
                    <>
                      {turn.sendError ? (
                        <p
                          className="mb-2 flex items-start gap-2 text-xs text-attention"
                          role="alert"
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {turn.sendError}
                        </p>
                      ) : (
                        <p className="mb-2 text-xs text-muted-foreground">
                          Review carefully. Nothing is sent until you confirm.
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={turn.sendState === "sending"}
                          onClick={() => updateTurn(turn.id, { sendState: "cancelled" })}
                          className="rounded-md border bg-card px-3 py-2 text-xs font-medium disabled:opacity-60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={turn.sendState === "sending"}
                          onClick={() => void confirmAndSend(turn)}
                          className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
                        >
                          {turn.sendState === "sending" ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          {turn.sendState === "sending" ? "Sending…" : "Confirm & send"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ))}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Reviewing requests and messages…
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <div className="border-t p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button
            onClick={() => void ask("What needs my attention today?")}
            className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
          >
            What needs my attention?
          </button>
          <button
            onClick={() => void ask("Which repairs are waiting for landlord approval?")}
            className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
          >
            Waiting on landlords
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask(input);
          }}
          className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about requests, people or draft an email…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <button
            disabled={!input.trim() || loading}
            className="text-primary disabled:text-muted-foreground"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
