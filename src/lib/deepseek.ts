import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const deepSeekResponse = z.object({
  choices: z.array(
    z.object({
      message: z.object({ content: z.string() }),
    }),
  ),
});

const emailDraft = z.object({
  requestId: z.string().regex(/^REQ-\d+$/),
  to: z.string().trim().toLowerCase().email().max(200),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20_000),
});

const assistantResponse = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    message: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("email_draft"),
    message: z.string().trim().min(1),
    draft: emailDraft,
  }),
]);

export type AssistantEmailDraft = z.infer<typeof emailDraft> & {
  toName: string;
  threadId?: string;
};

function parseAssistantResponse(content: string) {
  const trimmed = content.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return assistantResponse.safeParse(JSON.parse(unfenced));
  } catch {
    return { success: false as const };
  }
}

export const askDeepSeek = createServerFn({ method: "POST" })
  .validator(z.object({ question: z.string().trim().min(1).max(2000) }))
  .handler(async ({ data }) => {
    const apiKey = process.env["DEEPSEEK_API_KEY"];
    if (!apiKey) {
      return {
        ok: false as const,
        code: "NOT_CONFIGURED" as const,
        message: "DeepSeek is not configured for this environment.",
      };
    }

    const [{ auth }, { and, desc, eq }, schema, { getDb }] = await Promise.all([
      import("@clerk/tanstack-react-start/server"),
      import("drizzle-orm"),
      import("@/db/schema"),
      import("./db.server"),
    ]);
    const { userId } = await auth();
    if (!userId) {
      return {
        ok: false as const,
        code: "UNAUTHORIZED" as const,
        message: "Please sign in before using Banjg AI.",
      };
    }

    const db = await getDb();
    const [requests, participants, emails, mailbox] = await Promise.all([
      db.select().from(schema.repairRequests).where(eq(schema.repairRequests.userId, userId)),
      db
        .select()
        .from(schema.requestParticipants)
        .where(eq(schema.requestParticipants.userId, userId)),
      db
        .select({
          requestId: schema.emailMessages.requestId,
          threadId: schema.emailMessages.threadId,
          fromName: schema.emailMessages.fromName,
          fromEmail: schema.emailMessages.fromEmail,
          toEmails: schema.emailMessages.toEmails,
          subject: schema.emailMessages.subject,
          snippet: schema.emailMessages.snippet,
          receivedAt: schema.emailMessages.receivedAt,
        })
        .from(schema.emailMessages)
        .where(eq(schema.emailMessages.userId, userId))
        .orderBy(desc(schema.emailMessages.receivedAt))
        .limit(40),
      db
        .select({ email: schema.gmailAccounts.email })
        .from(schema.gmailAccounts)
        .where(eq(schema.gmailAccounts.userId, userId))
        .limit(1),
    ]);

    const workspace = requests.map((request) => ({
      id: request.id,
      title: request.title,
      address: request.address,
      status: request.status,
      priority: request.priority,
      column: request.boardColumn,
      waitingOn: request.waitingOn,
      nextAction: request.nextAction,
      aiSummary: request.aiSummary,
      people: participants
        .filter((person) => person.requestId === request.id)
        .map(({ role, name, email }) => ({ role, name, email })),
      recentEmails: emails
        .filter((email) => email.requestId === request.id)
        .slice(0, 5)
        .map(({ fromName, fromEmail, subject, snippet, receivedAt }) => ({
          fromName,
          fromEmail,
          subject,
          snippet,
          receivedAt,
        })),
    }));

    const response = await fetch(
      process.env["DEEPSEEK_API_URL"] ?? "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          temperature: 0.2,
          max_tokens: 1200,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are Banjg AI, an assistant for Australian property managers.
Use only the supplied workspace data. Return one JSON object and no markdown.

For an ordinary question return:
{"type":"message","message":"concise answer"}

When the user asks to write, draft, email, notify, remind, or send an email, and one request and recipient are unambiguous, return:
{"type":"email_draft","message":"I drafted the email below. Would you like me to send it?","draft":{"requestId":"REQ-123","to":"exact participant email","subject":"subject","body":"complete email body"}}

Email rules:
- The recipient must be an exact email belonging to a participant on that request.
- Address the recipient by name and write concise, professional Australian English.
- Include the relevant facts and next step, but do not invent dates, prices, approvals or completed actions.
- Never claim an email has been sent. The user must confirm it in the interface.
- If the request or recipient is ambiguous, return type "message" and ask one specific clarifying question.
- If mailboxConnected is false, explain that Gmail must be connected before sending instead of returning an email draft.`,
            },
            {
              role: "user",
              content: JSON.stringify({
                question: data.question,
                mailboxConnected: mailbox.length > 0,
                requests: workspace,
              }),
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const requestId = response.headers.get("x-request-id");
      console.error("DeepSeek request failed", response.status, requestId);
      return {
        ok: false as const,
        code: "UPSTREAM_ERROR" as const,
        message: "DeepSeek could not answer right now. Please try again.",
      };
    }

    const parsed = deepSeekResponse.safeParse(await response.json());
    const content = parsed.success ? parsed.data.choices[0]?.message.content.trim() : "";
    if (!content) {
      return {
        ok: false as const,
        code: "INVALID_RESPONSE" as const,
        message: "DeepSeek returned an empty response. Please try again.",
      };
    }

    const result = parseAssistantResponse(content);
    if (!result.success) {
      return { ok: true as const, answer: content };
    }
    if (result.data.type === "message") {
      return { ok: true as const, answer: result.data.message };
    }

    if (mailbox.length === 0) {
      return {
        ok: true as const,
        answer: "Connect Gmail in the Unified Inbox before asking me to send an email.",
      };
    }

    const draft = result.data.draft;
    const recipient = participants.find(
      (person) =>
        person.requestId === draft.requestId &&
        person.email.toLowerCase() === draft.to.toLowerCase(),
    );
    if (!recipient) {
      return {
        ok: true as const,
        answer:
          "I couldn't match that recipient to the request. Tell me the request ID and whether you want the tenant, landlord or repair team.",
      };
    }

    const relatedEmail = emails.find(
      (email) =>
        email.requestId === draft.requestId &&
        (email.fromEmail.toLowerCase() === recipient.email.toLowerCase() ||
          email.toEmails
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .includes(recipient.email.toLowerCase())),
    );

    const safeDraft: AssistantEmailDraft = {
      ...draft,
      to: recipient.email.toLowerCase(),
      toName: recipient.name,
      ...(relatedEmail?.threadId ? { threadId: relatedEmail.threadId } : {}),
    };

    const [ownedRequest] = await db
      .select({ id: schema.repairRequests.id })
      .from(schema.repairRequests)
      .where(
        and(
          eq(schema.repairRequests.userId, userId),
          eq(schema.repairRequests.id, safeDraft.requestId),
        ),
      )
      .limit(1);
    if (!ownedRequest) {
      return {
        ok: true as const,
        answer: "I couldn't find that request in your workspace. Please check the request ID.",
      };
    }

    return {
      ok: true as const,
      answer: result.data.message,
      emailDraft: safeDraft,
    };
  });
