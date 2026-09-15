export const OUTREACH_STATUSES = ["asked", "declined", "no_response"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const OUTREACH_LABELS: Record<OutreachStatus, string> = {
  asked: "Asked",
  declined: "Declined",
  no_response: "No reply",
};

export type OutreachRecord = {
  id: number;
  title_no: string;
  format: string;
  exhibitor_unique: string;
  status: OutreachStatus;
  note: string | null;
  actioned_by: string | null;
  actioned_at: string;
};

/** Keyed `${titleNo}|${format}|${exhibitorUnique}` for O(1) lookups from
 * the coverage rows. A missing key means nobody has asked yet. */
export type OutreachMap = Record<string, OutreachRecord | undefined>;

export function outreachKey(titleNo: string, format: string, exhibitorUnique: string): string {
  return `${titleNo}|${format}|${exhibitorUnique}`;
}
