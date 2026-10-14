export type Column = "New" | "Waiting" | "Action Needed" | "Scheduled" | "Completed";
export type Priority = "Urgent" | "High" | "Medium" | "Low";

export interface RepairRequest {
  id: string;
  title: string;
  address: string;
  priority: Priority;
  column: Column;
  status: string;
  waitingOn: string;
  nextAction: string;
  waiting: string;
  lastUpdate: string;
}

export const requests: RepairRequest[] = [
  {
    id: "REQ-108",
    title: "Dripping kitchen tap",
    address: "3/22 Oxford St, Paddington",
    priority: "Low",
    column: "New",
    status: "Awaiting triage",
    waitingOn: "Property Manager",
    nextAction: "Review tenant report & assign trade",
    waiting: "40 min",
    lastUpdate: "Today 8:31 AM",
  },
  {
    id: "REQ-107",
    title: "Broken window latch",
    address: "9 Ferry Rd, Glebe",
    priority: "Medium",
    column: "New",
    status: "Awaiting triage",
    waitingOn: "Property Manager",
    nextAction: "Request photos from tenant",
    waiting: "2 hours",
    lastUpdate: "Today 7:02 AM",
  },
  {
    id: "REQ-101",
    title: "Air Conditioning Not Working",
    address: "14 King Street, Unit 7",
    priority: "Medium",
    column: "Waiting",
    status: "Waiting for Landlord",
    waitingOn: "Landlord · David Chen",
    nextAction: "Approve $680 CoolAir quote",
    waiting: "18 hours",
    lastUpdate: "Yesterday 3:42 PM",
  },
  {
    id: "REQ-087",
    title: "Garage Door Jammed",
    address: "41 Wattle Ave, Marrickville",
    priority: "High",
    column: "Waiting",
    status: "Waiting for Landlord",
    waitingOn: "Landlord · Helen Park",
    nextAction: "Approve $340 quote",
    waiting: "2 days",
    lastUpdate: "Mon 11:20 AM",
  },
  {
    id: "REQ-076",
    title: "Hot Water System Failure",
    address: "5/118 Crown St, Surry Hills",
    priority: "Urgent",
    column: "Waiting",
    status: "Waiting for Landlord",
    waitingOn: "Landlord · Raj Mehta",
    nextAction: "Approve $1,200 replacement",
    waiting: "4 hours",
    lastUpdate: "Today 5:10 AM",
  },
  {
    id: "REQ-099",
    title: "Mould in bathroom",
    address: "2/7 Bay St, Coogee",
    priority: "Medium",
    column: "Waiting",
    status: "Waiting for Tenant",
    waitingOn: "Tenant · Mia Russo",
    nextAction: "Confirm access for inspection",
    waiting: "1 day",
    lastUpdate: "Yesterday 9:15 AM",
  },
  {
    id: "REQ-093",
    title: "Water Leak Under Sink",
    address: "12 Hill St, Newtown",
    priority: "High",
    column: "Action Needed",
    status: "Photos received",
    waitingOn: "Property Manager",
    nextAction: "Review tenant photos",
    waiting: "3 hours",
    lastUpdate: "Today 6:48 AM",
  },
  {
    id: "REQ-106",
    title: "Electrical Issue — Power Points",
    address: "88 Park Rd, Alexandria",
    priority: "Urgent",
    column: "Action Needed",
    status: "Appointment cancelled",
    waitingOn: "Property Manager",
    nextAction: "Rebook electrician",
    waiting: "1 hour",
    lastUpdate: "Today 7:55 AM",
  },
  {
    id: "REQ-095",
    title: "Smoke alarm service",
    address: "6 Lyons Rd, Drummoyne",
    priority: "Medium",
    column: "Scheduled",
    status: "Booked",
    waitingOn: "Tradie · SafeHome Alarms",
    nextAction: "Attend 10:00 AM today",
    waiting: "—",
    lastUpdate: "Yesterday 4:01 PM",
  },
  {
    id: "REQ-090",
    title: "Blocked stormwater drain",
    address: "17 Elm Pl, Leichhardt",
    priority: "High",
    column: "Scheduled",
    status: "Booked",
    waitingOn: "Tradie · Inner West Plumbing",
    nextAction: "Attend 1:30 PM today",
    waiting: "—",
    lastUpdate: "Yesterday 2:12 PM",
  },
  {
    id: "REQ-084",
    title: "Oven element replacement",
    address: "4/30 Cleveland St, Redfern",
    priority: "Low",
    column: "Completed",
    status: "Invoice received",
    waitingOn: "No one",
    nextAction: "Close request",
    waiting: "—",
    lastUpdate: "Mon 3:30 PM",
  },
];

export const columns: { name: Column; tone: string; dot: string }[] = [
  { name: "New", tone: "bg-new-soft text-new", dot: "bg-new" },
  { name: "Waiting", tone: "bg-waiting-soft text-waiting", dot: "bg-waiting" },
  { name: "Action Needed", tone: "bg-attention-soft text-attention", dot: "bg-attention" },
  { name: "Scheduled", tone: "bg-scheduled-soft text-scheduled", dot: "bg-scheduled" },
  { name: "Completed", tone: "bg-done-soft text-done", dot: "bg-done" },
];

export const priorityTone: Record<Priority, string> = {
  Urgent: "bg-attention-soft text-attention border-attention/20",
  High: "bg-waiting-soft text-waiting border-waiting/20",
  Medium: "bg-scheduled-soft text-scheduled border-scheduled/20",
  Low: "bg-new-soft text-new border-new/20",
};
