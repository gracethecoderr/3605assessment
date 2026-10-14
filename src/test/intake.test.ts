import { describe, expect, it } from "vitest";
import { detectSafetyRisks, fallbackDraft, sampleEmails } from "@/lib/intake";

describe("detectSafetyRisks", () => {
  it.each([
    ["There's a strong smell of gas in the kitchen", "Possible gas leak"],
    ["The power point is sparking", "Dangerous electrical fault"],
    ["Smoke alarm keeps beeping", "Fire, smoke or smoke alarm fault"],
    ["A pipe burst and the laundry is flooded", "Flooding or burst pipe"],
    ["We've had no hot water since Monday", "Essential service not working"],
    ["Part of the ceiling has collapsed", "Possible structural damage"],
    ["The front door won't lock", "Property cannot be secured"],
  ])("flags %j", (text, reason) => {
    expect(detectSafetyRisks(text)).toContain(reason);
  });

  it.each([
    "The kitchen tap is dripping",
    "Oven stopped heating, the cooktop still works",
    "Can you fix the fireplace mantel paint?",
    "The bathroom fan is rattling",
  ])("does not flag routine repair %j", (text) => {
    expect(detectSafetyRisks(text)).toEqual([]);
  });
});

describe("fallbackDraft", () => {
  it("marks safety emails Urgent even without the AI", () => {
    const gas = sampleEmails.find((e) => e.label.startsWith("Gas"))!;
    const draft = fallbackDraft(gas);
    expect(draft.priority).toBe("Urgent");
    expect(draft.safetyReasons).toContain("Possible gas leak");
  });

  it("keeps routine emails at Medium and asks for the address", () => {
    const fan = sampleEmails.find((e) => e.label === "Missing details")!;
    const draft = fallbackDraft(fan);
    expect(draft.priority).toBe("Medium");
    expect(draft.safetyReasons).toEqual([]);
    expect(draft.missingInfo).toContain("Property address");
  });
});
