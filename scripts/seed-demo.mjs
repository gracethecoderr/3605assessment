#!/usr/bin/env node
// Generates SQL that fills one account with clearly fictional demo data.
//
//   node scripts/seed-demo.mjs <clerk_user_id> > demo.sql
//   npx wrangler d1 execute DB --local  --file demo.sql   # local database
//   npx wrangler d1 execute DB --remote --file demo.sql   # Cloudflare database
//
// Re-running replaces everything that belongs to that user. Nothing else is touched.
// All people use @example.com / .example addresses; no real mail is ever sent for this account.

const userId = process.argv[2];
if (!userId || !/^user_[A-Za-z0-9]+$/.test(userId)) {
  console.error("Usage: node scripts/seed-demo.mjs <clerk_user_id>   (looks like user_2abc...)");
  process.exit(1);
}

const now = Date.now();
const hoursAgo = (h) => now - Math.round(h * 3600 * 1000);
const dayAt = (daysFromNow, hour, minute = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
};

const PM = { name: "Sarah Miller", email: "sarah.miller@harbourrealty.example" };

const q = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replaceAll("'", "''")}'`;
};
const insert = (table, rows) =>
  rows.length === 0
    ? ""
    : `INSERT INTO ${table} (${Object.keys(rows[0]).join(", ")}) VALUES\n${rows
        .map((r) => `(${Object.values(r).map(q).join(", ")})`)
        .join(",\n")};\n`;

// ---------------------------------------------------------------- requests
const requests = [
  {
    id: "REQ-108",
    title: "Dripping kitchen tap",
    address: "3/22 Oxford St, Paddington",
    priority: "Medium",
    column: "New",
    status: "Awaiting triage",
    waitingOn: "Property Manager · Sarah Miller",
    nextAction: "Review request and request a plumber quote",
    waiting: "5 hours",
    lastUpdate: "5 hours ago",
    created: 5,
    people: [
      ["Tenant", "Olivia Martin", "olivia.martin@example.com"],
      ["Landlord", "Mark Reilly", "mark.reilly@example.com"],
    ],
    ai: {
      summary:
        "Olivia reported a kitchen tap that has been dripping for about a week and is now leaving water under the sink. Nobody has been contacted yet and no quote has been requested.",
      next: "Reply to Olivia to confirm you have it, and ask Inner West Plumbing for a quote to replace the tap cartridge.",
      column: "New",
      waitingOn: "Property Manager · Sarah Miller",
    },
  },
  {
    id: "REQ-106",
    title: "Power point sparking in kitchen",
    address: "41 Wattle Ave, Marrickville",
    priority: "Urgent",
    column: "Action Needed",
    status: "Action required",
    waitingOn: "Property Manager · Sarah Miller",
    nextAction: "Rebook the electrician for tomorrow morning",
    waiting: "6 hours",
    lastUpdate: "6 hours ago",
    created: 30,
    people: [
      ["Tenant", "Noah Lee", "noah.lee@example.com"],
      ["Landlord", "Helen Park", "helen.park@example.com"],
      ["Repair Team", "Spark Electrical", "jobs@sparkelectrical.example"],
    ],
    ai: {
      summary:
        "Noah reported a sparking power point with a burning smell and has switched the circuit off. Spark Electrical agreed to attend yesterday afternoon but cancelled this morning because of an emergency, and offered 8am tomorrow instead.",
      next: "Confirm 8am tomorrow with Spark Electrical, tell Noah to keep the circuit off, and ask Helen Park to approve the $240 quote.",
      column: "Action Needed",
      waitingOn: "Property Manager · Sarah Miller",
    },
  },
  {
    id: "REQ-099",
    title: "Routine inspection access",
    address: "2/7 Bay St, Coogee",
    priority: "Medium",
    column: "Action Needed",
    status: "Action required",
    waitingOn: "Property Manager · Sarah Miller",
    nextAction: "Confirm Thursday 2:30pm with the inspector",
    waiting: "3 hours",
    lastUpdate: "3 hours ago",
    created: 52,
    people: [
      ["Tenant", "Mia Russo", "mia.russo@example.com"],
      ["Landlord", "Anthony Costa", "anthony.costa@example.com"],
      ["Repair Team", "Coastal Building Inspections", "bookings@coastalinspect.example"],
    ],
    ai: {
      summary:
        "Access for the routine inspection was requested two days ago. Mia replied this morning that Thursday after 2pm works and asked that the inspector buzz Unit 2. The inspection company has been asked for a slot but has not replied.",
      next: "Confirm Thursday 2:30pm with Coastal Building Inspections, book it in the calendar, and tell Mia the inspector will buzz Unit 2.",
      column: "Action Needed",
      waitingOn: "Property Manager · Sarah Miller",
    },
  },
  {
    id: "REQ-101",
    title: "Air conditioning not cooling",
    address: "14 King Street, Unit 7, Surry Hills",
    priority: "High",
    column: "Waiting",
    status: "Waiting for response",
    waitingOn: "Landlord · David Chen",
    nextAction: "Chase landlord approval for the $680 quote",
    waiting: "3 days",
    lastUpdate: "3 days ago",
    created: 120,
    people: [
      ["Tenant", "James Wong", "james.wong@example.com"],
      ["Landlord", "David Chen", "david.chen@example.com"],
      ["Repair Team", "CoolAir Services", "quotes@coolair.example"],
    ],
    ai: {
      summary:
        "James reported a failed air conditioner five days ago. CoolAir quoted $680 (regas and a new capacitor, 3-month warranty) and the quote went to the landlord for approval three days ago with no reply. James has now followed up because temperatures are high.",
      next: "Call David Chen today to chase approval of the $680 CoolAir quote, then update James.",
      column: "Waiting",
      waitingOn: "Landlord · David Chen",
    },
  },
  {
    id: "REQ-087",
    title: "Garage door remote not working",
    address: "8 Park Rd, Marrickville",
    priority: "Low",
    column: "Waiting",
    status: "Waiting for response",
    waitingOn: "Landlord · Jo Nguyen",
    nextAction: "Chase landlord approval for the $85 replacement remote",
    waiting: "2 days",
    lastUpdate: "2 days ago",
    created: 100,
    people: [
      ["Tenant", "Ben Ortiz", "ben.ortiz@example.com"],
      ["Landlord", "Jo Nguyen", "jo.nguyen@example.com"],
      ["Repair Team", "Garage Door Pros", "orders@garagedoorpros.example"],
    ],
    ai: {
      summary:
        "Ben's garage door remote stopped working. Garage Door Pros quoted $85 for a replacement and the approval request has been with the landlord for two days.",
      next: "Send Jo Nguyen a short reminder about the $85 replacement remote.",
      column: "Waiting",
      waitingOn: "Landlord · Jo Nguyen",
    },
  },
  {
    id: "REQ-093",
    title: "Water leak under bathroom sink",
    address: "12 Hill St, Newtown",
    priority: "High",
    column: "Scheduled",
    status: "Booked",
    waitingOn: "Repair Team · Inner West Plumbing",
    nextAction: "Plumber attends in two days at 5:30pm",
    waiting: "—",
    lastUpdate: "2 days ago",
    created: 96,
    people: [
      ["Tenant", "Amelia Fox", "amelia.fox@example.com"],
      ["Landlord", "Peter Lang", "peter.lang@example.com"],
      ["Repair Team", "Inner West Plumbing", "jobs@innerwestplumbing.example"],
    ],
    ai: {
      summary:
        "The leak was reported four days ago, quoted at $320 by Inner West Plumbing, approved by the landlord and booked. The plumber attends in two days at 5:30pm and Amelia has been told.",
      next: "Nothing to do until the visit. Afterwards ask for the invoice and move the request to Completed.",
      column: "Scheduled",
      waitingOn: "Repair Team · Inner West Plumbing",
    },
  },
  {
    id: "REQ-111",
    title: "Smoke alarm service",
    address: "5/30 Ocean St, Bondi",
    priority: "Medium",
    column: "Scheduled",
    status: "Booked",
    waitingOn: "Repair Team · Safe Home Services",
    nextAction: "Service today at 10:00",
    waiting: "—",
    lastUpdate: "Yesterday",
    created: 40,
    people: [
      ["Tenant", "Priya Shah", "priya.shah@example.com"],
      ["Landlord", "Wei Zhang", "wei.zhang@example.com"],
      ["Repair Team", "Safe Home Services", "bookings@safehome.example"],
    ],
    ai: {
      summary:
        "The annual smoke alarm service is booked for today at 10:00 and Priya has confirmed she will be home.",
      next: "After the visit, ask Safe Home Services for the compliance certificate and file it.",
      column: "Scheduled",
      waitingOn: "Repair Team · Safe Home Services",
    },
  },
  {
    id: "REQ-090",
    title: "Blocked stormwater drain",
    address: "17 Elm Pl, Leichhardt",
    priority: "Medium",
    column: "Completed",
    status: "Completed",
    waitingOn: "Property Manager · Sarah Miller",
    nextAction: "Closed",
    waiting: "—",
    lastUpdate: "1 week ago",
    created: 400,
    people: [
      ["Tenant", "Tom Brennan", "tom.brennan@example.com"],
      ["Landlord", "Grace Ho", "grace.ho@example.com"],
      ["Repair Team", "Inner West Plumbing", "jobs@innerwestplumbing.example"],
    ],
    ai: null,
  },
];

// ---------------------------------------------------------------- emails
// dir: "in" = from the other party, "out" = sent by the property manager.
const emails = [
  // REQ-108
  {
    id: "demo-108a",
    req: "REQ-108",
    dir: "in",
    who: ["Olivia Martin", "olivia.martin@example.com"],
    subject: "Dripping kitchen tap",
    h: 5,
    unread: true,
    body: "Hi Sarah,\n\nThe kitchen tap in my flat has been dripping for about a week and now there is water pooling under the sink. Could someone come and have a look? I'm home after 5pm most days.\n\nThanks,\nOlivia",
  },
  // REQ-106
  {
    id: "demo-106a",
    req: "REQ-106",
    dir: "in",
    who: ["Noah Lee", "noah.lee@example.com"],
    subject: "Power point in kitchen sparking",
    h: 30,
    unread: false,
    body: "Hi Sarah,\n\nThe double power point next to the kettle sparked when I plugged it in and there is a burning smell. I have turned that circuit off at the switchboard. Please send an electrician as soon as possible.\n\nNoah",
  },
  {
    id: "demo-106b",
    req: "REQ-106",
    dir: "out",
    who: ["Spark Electrical", "jobs@sparkelectrical.example"],
    subject: "URGENT: sparking power point, 41 Wattle Ave",
    h: 28,
    body: "Hi team,\n\nTenant reports a sparking double power point in the kitchen with a burning smell. Circuit is switched off. Can you attend today?\n\nSarah Miller\nHarbour Realty",
  },
  {
    id: "demo-106c",
    req: "REQ-106",
    dir: "in",
    who: ["Spark Electrical", "jobs@sparkelectrical.example"],
    subject: "Re: URGENT: sparking power point, 41 Wattle Ave",
    h: 26,
    unread: false,
    body: "Hi Sarah,\n\nWe can attend today at 3pm. Call-out and replacement of the double power point is $240 including GST.\n\nSpark Electrical",
  },
  {
    id: "demo-106d",
    req: "REQ-106",
    dir: "in",
    who: ["Spark Electrical", "jobs@sparkelectrical.example"],
    subject: "Need to reschedule - 41 Wattle Ave",
    h: 6,
    unread: true,
    body: "Hi Sarah,\n\nSorry, our electrician has been pulled onto an emergency and can't make 3pm. We can attend tomorrow at 8am instead. Apologies for the inconvenience.\n\nSpark Electrical",
  },
  // REQ-099
  {
    id: "demo-099a",
    req: "REQ-099",
    dir: "out",
    who: ["Mia Russo", "mia.russo@example.com"],
    subject: "Routine inspection access, 2/7 Bay St",
    h: 52,
    body: "Hi Mia,\n\nWe need to carry out the routine inspection at 2/7 Bay St this week. Could you let me know a day and time that suits you?\n\nKind regards,\nSarah Miller",
  },
  {
    id: "demo-099b",
    req: "REQ-099",
    dir: "out",
    who: ["Coastal Building Inspections", "bookings@coastalinspect.example"],
    subject: "Inspection booking request: 2/7 Bay St",
    h: 50,
    body: "Hi,\n\nCould you please hold a slot for a routine inspection at 2/7 Bay St, Coogee, later this week? I will confirm the time with the tenant shortly.\n\nSarah Miller",
  },
  {
    id: "demo-099c",
    req: "REQ-099",
    dir: "in",
    who: ["Mia Russo", "mia.russo@example.com"],
    subject: "Re: Routine inspection access, 2/7 Bay St",
    h: 3,
    unread: true,
    body: "Hi Sarah,\n\nThursday after 2pm works for me. Please let the inspector know to buzz Unit 2.\n\nThanks,\nMia",
  },
  // REQ-101
  {
    id: "demo-101a",
    req: "REQ-101",
    dir: "in",
    who: ["James Wong", "james.wong@example.com"],
    subject: "Air conditioner not cooling",
    h: 120,
    unread: false,
    body: "Hi Sarah,\n\nThe air conditioner in the living room stopped cooling two days ago. It blows air but it is warm, and it is getting hot in the afternoons. Can someone look at it? I'm home most days.\n\nThanks,\nJames",
  },
  {
    id: "demo-101b",
    req: "REQ-101",
    dir: "out",
    who: ["CoolAir Services", "quotes@coolair.example"],
    subject: "Quote request: split system not cooling, 14 King St Unit 7",
    h: 100,
    body: "Hi team,\n\nCould you quote on a split system that blows warm air at 14 King Street, Unit 7, Surry Hills? Tenant photos attached to the job. Tenant is home most days.\n\nSarah Miller",
  },
  {
    id: "demo-101c",
    req: "REQ-101",
    dir: "in",
    who: ["CoolAir Services", "quotes@coolair.example"],
    subject: "Re: Quote request: split system not cooling, 14 King St Unit 7",
    h: 76,
    unread: false,
    body: "Hi Sarah,\n\nFrom the photos it looks like a gas leak plus a failed capacitor. Quote is $680 including GST: regas, replace capacitor, 3-month warranty. We can attend within 2 business days of approval.\n\nCoolAir Services",
  },
  {
    id: "demo-101d",
    req: "REQ-101",
    dir: "out",
    who: ["David Chen", "david.chen@example.com"],
    subject: "Approval needed: air conditioning repair $680, 14 King St Unit 7",
    h: 72,
    body: "Hi David,\n\nThe tenant's air conditioner has failed. CoolAir Services quote $680 including GST (regas and capacitor, 3-month warranty). Could you please confirm you are happy to proceed?\n\nKind regards,\nSarah Miller",
  },
  {
    id: "demo-101e",
    req: "REQ-101",
    dir: "in",
    who: ["James Wong", "james.wong@example.com"],
    subject: "Re: Air conditioner not cooling",
    h: 20,
    unread: true,
    body: "Hi Sarah,\n\nAny update on the air conditioner? It was 34 degrees yesterday and the flat is very hot.\n\nJames",
  },
  // REQ-087
  {
    id: "demo-087a",
    req: "REQ-087",
    dir: "in",
    who: ["Ben Ortiz", "ben.ortiz@example.com"],
    subject: "Garage door remote stopped working",
    h: 100,
    unread: false,
    body: "Hi Sarah,\n\nThe garage door remote no longer opens the door. I tried new batteries. The wall button still works.\n\nBen",
  },
  {
    id: "demo-087b",
    req: "REQ-087",
    dir: "out",
    who: ["Jo Nguyen", "jo.nguyen@example.com"],
    subject: "Approval needed: replacement garage remote $85, 8 Park Rd",
    h: 50,
    body: "Hi Jo,\n\nThe tenant's garage remote has failed. Garage Door Pros can supply and program a replacement for $85 including GST. Could you please confirm you are happy to proceed?\n\nKind regards,\nSarah Miller",
  },
  // REQ-093
  {
    id: "demo-093a",
    req: "REQ-093",
    dir: "in",
    who: ["Amelia Fox", "amelia.fox@example.com"],
    subject: "Water leak under the bathroom sink",
    h: 96,
    unread: false,
    body: "Hi Sarah,\n\nThere is a steady leak under the bathroom sink and the cupboard floor is soaked. I've put a bucket underneath and turned the isolation valve most of the way off.\n\nAmelia",
  },
  {
    id: "demo-093b",
    req: "REQ-093",
    dir: "in",
    who: ["Inner West Plumbing", "jobs@innerwestplumbing.example"],
    subject: "Quote: bathroom sink leak, 12 Hill St",
    h: 70,
    unread: false,
    body: "Hi Sarah,\n\nQuote is $320 including GST to replace the trap and flexi hoses and test for leaks. Parts included, 12-month workmanship warranty.\n\nInner West Plumbing",
  },
  {
    id: "demo-093c",
    req: "REQ-093",
    dir: "in",
    who: ["Peter Lang", "peter.lang@example.com"],
    subject: "Re: Quote approval, 12 Hill St",
    h: 48,
    unread: false,
    body: "Hi Sarah,\n\nHappy to proceed with the $320 quote. Please go ahead and book it in.\n\nPeter",
  },
  {
    id: "demo-093d",
    req: "REQ-093",
    dir: "in",
    who: ["Inner West Plumbing", "jobs@innerwestplumbing.example"],
    subject: "Booking confirmed: 12 Hill St",
    h: 44,
    unread: false,
    body: "Hi Sarah,\n\nWe are booked in to attend in two days at 5:30pm. The tenant will need to be home to give access.\n\nInner West Plumbing",
  },
  {
    id: "demo-093e",
    req: "REQ-093",
    dir: "out",
    who: ["Amelia Fox", "amelia.fox@example.com"],
    subject: "Plumber booked for your sink leak",
    h: 40,
    body: "Hi Amelia,\n\nThe plumber from Inner West Plumbing will attend in two days at 5:30pm. Please keep the isolation valve off until then and let me know if the leak gets worse.\n\nKind regards,\nSarah Miller",
  },
  // REQ-111
  {
    id: "demo-111a",
    req: "REQ-111",
    dir: "out",
    who: ["Priya Shah", "priya.shah@example.com"],
    subject: "Smoke alarm service tomorrow at 10am",
    h: 40,
    body: "Hi Priya,\n\nSafe Home Services will service the smoke alarms at 5/30 Ocean St tomorrow at 10:00. It takes about 30 minutes. Please make sure someone is home.\n\nKind regards,\nSarah Miller",
  },
  {
    id: "demo-111b",
    req: "REQ-111",
    dir: "in",
    who: ["Priya Shah", "priya.shah@example.com"],
    subject: "Re: Smoke alarm service tomorrow at 10am",
    h: 26,
    unread: false,
    body: "Hi Sarah,\n\nThat's fine, I'll be home. Thanks for the notice.\n\nPriya",
  },
  // REQ-090
  {
    id: "demo-090a",
    req: "REQ-090",
    dir: "in",
    who: ["Inner West Plumbing", "jobs@innerwestplumbing.example"],
    subject: "Job complete + invoice: 17 Elm Pl",
    h: 170,
    unread: false,
    body: "Hi Sarah,\n\nThe stormwater drain at 17 Elm Pl has been cleared and flushed. Invoice for $450 attached.\n\nInner West Plumbing",
  },
  {
    id: "demo-090b",
    req: "REQ-090",
    dir: "out",
    who: ["Grace Ho", "grace.ho@example.com"],
    subject: "Stormwater drain cleared: invoice for your records",
    h: 168,
    body: "Hi Grace,\n\nThe blocked drain at 17 Elm Pl has been cleared. Invoice for $450 is attached and will be deducted from the next rent disbursement.\n\nKind regards,\nSarah Miller",
  },
  {
    id: "demo-090c",
    req: "REQ-090",
    dir: "in",
    who: ["Grace Ho", "grace.ho@example.com"],
    subject: "Re: Stormwater drain cleared",
    h: 160,
    unread: false,
    body: "Thanks Sarah, all good.\n\nGrace",
  },
  // not linked to any request
  {
    id: "demo-x1",
    req: null,
    dir: "in",
    who: ["Inner West Council", "noreply@innerwestcouncil.example"],
    subject: "Your rates notice is ready",
    h: 40,
    unread: false,
    body: "Your quarterly rates notice is now available to view online.\n\nInner West Council",
  },
  {
    id: "demo-x2",
    req: null,
    dir: "in",
    who: ["Bondi Strata", "admin@bondistrata.example"],
    subject: "Notice of annual general meeting",
    h: 90,
    unread: true,
    body: "Notice is given that the annual general meeting will be held next month. The agenda is attached.\n\nBondi Strata Management",
  },
];

// ---------------------------------------------------------------- events, quotes, appointments, properties
const events = [];
const ev = (req, h, kind, text, actor = PM.name) =>
  events.push({ user_id: userId, request_id: req, at: hoursAgo(h), kind, text, actor });
for (const r of requests) ev(r.id, r.created, "created", `Request created: ${r.title}`);
ev("REQ-101", 76, "quote", "Quote received from CoolAir Services: $680.00");
ev("REQ-101", 72, "status", "Status changed from New to Waiting");
ev(
  "REQ-101",
  71,
  "note",
  "Landlord prefers phone calls for anything over $500 - David on 0400 000 101.",
);
ev("REQ-106", 27, "note", "Told Noah to keep the circuit off and not use the kettle.");
ev("REQ-106", 26, "quote", "Quote received from Spark Electrical: $240.00");
ev("REQ-106", 6, "status", "Status changed from Waiting to Action Needed");
ev("REQ-099", 3, "status", "Status changed from Waiting to Action Needed");
ev("REQ-087", 50, "status", "Status changed from New to Waiting");
ev("REQ-093", 70, "quote", "Quote received from Inner West Plumbing: $320.00");
ev("REQ-093", 48, "quote", "Quote from Inner West Plumbing ($320.00) approved");
ev("REQ-093", 44, "status", "Status changed from Waiting to Scheduled");
ev("REQ-093", 44, "appointment", "Appointment booked: Inner West Plumbing attends");
ev("REQ-111", 30, "status", "Status changed from New to Scheduled");
ev("REQ-111", 30, "appointment", "Appointment booked: Smoke alarm service");
ev("REQ-090", 170, "quote", "Quote from Inner West Plumbing ($450.00) approved");
ev("REQ-090", 168, "status", "Status changed from Scheduled to Completed");

const quotes = [
  [
    "REQ-101",
    "CoolAir Services",
    68000,
    "Regas and replace capacitor, 3-month warranty",
    "Pending",
    76,
  ],
  [
    "REQ-106",
    "Spark Electrical",
    24000,
    "Replace double power point and test circuit",
    "Pending",
    26,
  ],
  ["REQ-087", "Garage Door Pros", 8500, "Supply and program replacement remote", "Pending", 50],
  [
    "REQ-093",
    "Inner West Plumbing",
    32000,
    "Replace trap and flexi hoses, test for leaks",
    "Approved",
    70,
  ],
  ["REQ-090", "Inner West Plumbing", 45000, "Clear and flush stormwater drain", "Approved", 200],
].map(([req, supplier, cents, description, status, h]) => ({
  user_id: userId,
  request_id: req,
  supplier,
  amount_cents: cents,
  description,
  status,
  created_at: hoursAgo(h),
}));

const appointments = [
  {
    request_id: "REQ-111",
    title: "Smoke alarm service (Safe Home Services)",
    starts_at: dayAt(0, 10, 0),
    location: "5/30 Ocean St, Bondi",
  },
  {
    request_id: "REQ-093",
    title: "Inner West Plumbing attends: bathroom sink leak",
    starts_at: dayAt(2, 17, 30),
    location: "12 Hill St, Newtown",
  },
  {
    request_id: null,
    title: "Quarterly inspections: Marrickville properties",
    starts_at: dayAt(5, 11, 0),
    location: "Marrickville",
  },
  {
    request_id: "REQ-090",
    title: "Drain cleared (Inner West Plumbing)",
    starts_at: dayAt(-3, 14, 0),
    location: "17 Elm Pl, Leichhardt",
  },
].map((a) => ({ user_id: userId, ...a }));

const properties = [
  [
    "14 King Street, Unit 7, Surry Hills",
    "David Chen",
    "david.chen@example.com",
    "Tenant James Wong. Lease ends 30 June. Prefers phone for approvals over $500.",
  ],
  [
    "41 Wattle Ave, Marrickville",
    "Helen Park",
    "helen.park@example.com",
    "Switchboard is in the laundry.",
  ],
  [
    "2/7 Bay St, Coogee",
    "Anthony Costa",
    "anthony.costa@example.com",
    "Buzz Unit 2 at the front gate.",
  ],
  ["3/22 Oxford St, Paddington", "Mark Reilly", "mark.reilly@example.com", ""],
  [
    "12 Hill St, Newtown",
    "Peter Lang",
    "peter.lang@example.com",
    "Isolation valve is under the bathroom sink.",
  ],
  ["17 Elm Pl, Leichhardt", "Grace Ho", "grace.ho@example.com", ""],
  [
    "8 Park Rd, Marrickville",
    "Jo Nguyen",
    "jo.nguyen@example.com",
    "Garage remote is the 433MHz type.",
  ],
  [
    "5/30 Ocean St, Bondi",
    "Wei Zhang",
    "wei.zhang@example.com",
    "Annual smoke alarm service due each October.",
  ],
].map(([address, owner_name, owner_email, notes]) => ({
  user_id: userId,
  address,
  owner_name,
  owner_email,
  notes,
}));

// ---------------------------------------------------------------- SQL
const own = PM.email;
let sql = "-- Banjg Property demo data (fictional)\n";
for (const t of [
  "request_events",
  "request_quotes",
  "request_participants",
  "appointments",
  "properties",
  "email_messages",
  "gmail_accounts",
  "repair_requests",
]) {
  sql += `DELETE FROM ${t} WHERE user_id = ${q(userId)};\n`;
}

sql += insert(
  "repair_requests",
  requests.map((r, i) => ({
    user_id: userId,
    id: r.id,
    title: r.title,
    address: r.address,
    priority: r.priority,
    board_column: r.column,
    status: r.status,
    waiting_on: r.waitingOn,
    next_action: r.nextAction,
    waiting: r.waiting,
    last_update: r.lastUpdate,
    sort_order: i + 1,
    ai_summary: r.ai?.summary ?? null,
    ai_next_step: r.ai?.next ?? null,
    ai_column: r.ai?.column ?? null,
    ai_waiting_on: r.ai?.waitingOn ?? null,
    ai_updated_at: r.ai ? now : null,
  })),
);
sql += insert(
  "request_participants",
  requests.flatMap((r) =>
    r.people.map(([role, name, email]) => ({
      user_id: userId,
      request_id: r.id,
      role,
      name,
      email,
    })),
  ),
);
sql += insert("request_events", events);
sql += insert("request_quotes", quotes);
sql += insert("appointments", appointments);
sql += insert("properties", properties);
sql += insert(
  "email_messages",
  emails.map((m) => {
    const out = m.dir === "out";
    const [name, email] = m.who;
    return {
      user_id: userId,
      id: m.id,
      thread_id: `thread-${m.req ?? m.id}`,
      from_name: out ? PM.name : name,
      from_email: out ? own : email,
      subject: m.subject,
      snippet: m.body.replace(/\s+/g, " ").slice(0, 120),
      body: m.body,
      to_emails: out ? email : own,
      in_inbox: out ? 0 : 1,
      sent: out ? 1 : 0,
      trashed: 0,
      received_at: hoursAgo(m.h),
      unread: out ? false : Boolean(m.unread),
      request_id: m.req,
    };
  }),
);
sql += insert("gmail_accounts", [
  { user_id: userId, email: own, refresh_token: "demo-account", last_sync_at: now },
]);

process.stdout.write(sql);
