export type AvailabilityConfig = {
  dates: string[];
  timeZone: string;
  startMinute: number;
  endMinute: number;
  slotMinutes: 15 | 30 | 60;
  durationMinutes: number;
};

export type AvailabilityInterval = {
  start: string;
  end: string;
  type: "yes" | "ifNeedBe";
};

export type AvailabilitySlot = {
  start: string;
  end: string;
  date: string;
  minute: number;
};

export type AvailabilityParticipant = {
  id: string;
  name: string;
  intervals: AvailabilityInterval[];
};

export type AvailabilityPoll = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  status: "open" | "closed" | "scheduled" | "canceled";
  config: AvailabilityConfig;
  participants: AvailabilityParticipant[];
  currentParticipant: AvailabilityParticipant | null;
  canManage: boolean;
  finalized: { start: string; end: string } | null;
};
