// Shared (client + server) helpers for turning an incoming email into a repair request.

import type { Priority } from "./data";

export const reporterRoles = ["Tenant", "Landlord", "Repair Team", "Unknown"] as const;
export type ReporterRole = (typeof reporterRoles)[number];

/** What the AI (or the keyword fallback) proposes. The property manager edits it before saving. */
export type IntakeDraft = {
  title: string;
  address: string;
  priority: Priority;
  summary: string;
  nextAction: string;
  waitingOn: string;
  missingInfo: string[];
  reporterName: string;
  reporterRole: ReporterRole;
  safetyReasons: string[];
};

export type IntakeEmail = {
  /** Gmail message id when the email came from the synced inbox; null for a pasted email. */
  emailId: string | null;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
};

/**
 * Keyword safety net that runs alongside the AI, so a dangerous issue is never missed
 * just because the model misread it. Based on the kinds of "urgent repairs" listed by
 * NSW Fair Trading (gas leaks, dangerous electrical faults, flooding, failure of an
 * essential service, serious damage, security). A match never triggers anything
 * automatically: it marks the request Urgent and tells the property manager to act personally.
 */
const safetyRules: { reason: string; pattern: RegExp }[] = [
  {
    reason: "Possible gas leak",
    pattern: /\bgas (leak|leaking|smell)|\bsmell(s|ing)? (of |like )?gas\b|rotten egg/i,
  },
  {
    reason: "Dangerous electrical fault",
    pattern:
      /\bspark(s|ing|ed)?\b|exposed wir|electric(al)? shock|\bgot a shock|burning smell|smell of burning|power ?point.*(hot|melt|scorch)/i,
  },
  { reason: "Fire, smoke or smoke alarm fault", pattern: /\bfire\b|\bsmoke\b|smoke alarm/i },
  {
    reason: "Flooding or burst pipe",
    pattern: /\bflood(ing|ed)?\b|burst (pipe|water|main)|water (is )?(pouring|gushing)/i,
  },
  {
    reason: "Essential service not working",
    pattern: /\bno (hot water|power|electricity|running water|water)\b|\bblackout\b/i,
  },
  {
    reason: "Possible structural damage",
    pattern: /ceiling (has )?(collapsed|caved|is sagging|sagging|falling)|\bcollapsed\b/i,
  },
  {
    reason: "Property cannot be secured",
    pattern: /\b(can'?t|cannot|won'?t) (be )?lock|broken (front |back )?door lock|break[- ]?in\b/i,
  },
];

export function detectSafetyRisks(text: string): string[] {
  return safetyRules.filter((r) => r.pattern.test(text)).map((r) => r.reason);
}

/** Draft used when the AI is unavailable, so the flow still works end to end. */
export function fallbackDraft(email: IntakeEmail): IntakeDraft {
  const safetyReasons = detectSafetyRisks(`${email.subject}\n${email.body}`);
  return {
    title: email.subject.trim().slice(0, 120) || "Repair request from email",
    address: "",
    priority: safetyReasons.length ? "Urgent" : "Medium",
    summary: email.body.replace(/\s+/g, " ").trim().slice(0, 400),
    nextAction: safetyReasons.length
      ? "Call the tenant now and arrange an emergency trade"
      : "Review the email and assign a trade",
    waitingOn: "Property Manager",
    missingInfo: ["Property address"],
    reporterName: email.fromName,
    reporterRole: "Unknown",
    safetyReasons,
  };
}

export const sampleEmails: (IntakeEmail & { label: string })[] = [
  {
    label: "Gas smell (safety)",
    emailId: null,
    fromName: "Priya Nair",
    fromEmail: "priya.nair@example.com",
    subject: "Gas smell in the kitchen",
    body: "Hi,\n\nI'm the tenant at Unit 4, 18 Coogee Bay Rd, Coogee. Since this morning there's been a strong smell of gas near the cooktop, even with all the knobs off. I've opened the windows. Can someone come out today?\n\nThanks,\nPriya\n0412 555 018",
  },
  {
    label: "Oven not heating",
    emailId: null,
    fromName: "James Walker",
    fromEmail: "j.walker@example.com",
    subject: "Oven stopped working",
    body: "Hello,\n\nThe oven at 12 Stanmore Rd, Enmore stopped heating on the weekend. The cooktop still works. I'm home Tuesday and Thursday afternoons if a technician needs access.\n\nCheers,\nJames (tenant)",
  },
  {
    label: "Missing details",
    emailId: null,
    fromName: "Kate M",
    fromEmail: "kate.m@example.com",
    subject: "bathroom fan",
    body: "hey the bathroom fan is making a loud rattling noise and now it won't turn on at all. can you send someone?",
  },
];
