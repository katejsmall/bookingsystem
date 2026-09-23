export const FORMATS = ["4DX", "ScreenX", "Ultra4DX", "UltraScreenX"] as const;
export type Format = (typeof FORMATS)[number];

/** The two formats the lineup is actually programmed in. */
export const BASE_FORMATS = ["4DX", "ScreenX"] as const;
export type BaseFormat = (typeof BASE_FORMATS)[number];

/**
 * Ultra4DX / UltraScreenX are combo installs - one auditorium fitted with
 * both technologies - so they play the base format's lineup entry rather
 * than having lineup rows of their own. This mirrors the normalization in
 * the validate_booking() database trigger; keep the two in step.
 */
export function baseFormat(format: string): BaseFormat {
  return format.replace(/^Ultra/, "") === "ScreenX" ? "ScreenX" : "4DX";
}

/** True for the combo installs, which we surface as one screen, not two. */
export function isUltraFormat(format: string | null | undefined): boolean {
  return !!format && format.startsWith("Ultra");
}

export const STATUSES = ["requested", "confirmed", "rejected", "cancelled"] as const;
export type BookingStatus = (typeof STATUSES)[number];

export type Profile = {
  id: string;
  role: "team" | "exhibitor";
  exhibitor_unique: string | null;
  full_name: string | null;
  /** A team member's own patch; matches exhibitor_db.account_manager.
   * The portal opens on it unless they've picked something else. Null for
   * exhibitors, and for team leads who should see everything. */
  territory: string | null;
  /** Can provision and manage other user accounts. */
  is_admin: boolean;
  /** True while an admin-issued temporary password is still in use. */
  must_change_password: boolean;
  active: boolean;
};

export type Exhibitor = {
  exhibitor_unique: string;
  exhibitor_key: string | null;
  exhibitor_erp: string | null;
  entity_country: string | null;
  screenx: boolean | null;
  "4dx": boolean | null;
  ultra4dx: boolean | null;
  manager_email: string | null;
  logo_path: string | null;
  /** CJ team member who owns this exhibitor, for the team-side manager
   * filter - distinct from manager_email, which is the exhibitor's own
   * login contact. */
  account_manager: string | null;
};

export type Screen = {
  screen_unique: string;
  exhibitor_id: string | null;
  exhibitor_key: string | null;
  site_id: string | null;
  site_name: string | null;
  screen_name: string | null;
  screen_number: string | null;
  location_country: string | null;
  location_city: string | null;
  format: string | null;
  screen_format: string | null;
  seat_count: string | null;
  opening_date: string | null;
};

export type TitleMaster = {
  title_no: string;
  erp_title: string | null;
};

export type LineupRow = {
  lineup_id: number;
  title_no: string;
  format: Format;
  confirmed: boolean;
  first_available_release_date: string | null;
  notes: string | null;
  sync_status: string | null;
};

/** lineup joined to Title_master and its film_imdb_db metadata row. */
export type LineupWithTitle = LineupRow & {
  title: {
    title_no: string;
    erp_title: string | null;
    film_imdb_db: {
      Title: string | null;
      genre: string | null;
      poster_path: string | null;
      poster_path_4dx: string | null;
      poster_path_screenx: string | null;
    }[];
  } | null;
};

/** A lineup catalogue row with its poster resolved to a short-lived signed URL. */
export type LineupCatalogueItem = LineupWithTitle & { posterUrl: string | null };

/** A dashboard catalogue title, cross-referenced against the exhibitor's own
 * live bookings to drive the "Book now" / "Booked for DD/MM" affordance. */
export type DashboardTitle = LineupCatalogueItem & {
  name: string;
  bookedDate: string | null;
  bookedStatus: BookingStatus | null;
};

export type Booking = {
  booking_id: number;
  screen_unique: string;
  lineup_id: number;
  exhibitor_unique: string;
  requested_play_date: string;
  programming_weeks: number;
  status: BookingStatus;
  requested_by: string | null;
  requested_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  notes: string | null;
  decision_note: string | null;
  /** Non-null for rows created by the bulk sheet import rather than a real
   * exhibitor submission via the site (e.g. 'excel_import Bookings Data
   * 2026-07-23') - these are historical/reference status, not pending
   * action, so the team's request queue excludes them. */
  imported_from: string | null;
};

export type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  exhibitor_unique: string | null;
  relevant_formats: string[] | null;
  contact_screens: { screen_unique: string }[];
  contact_titles: { title_no: string }[];
};

export const PRODUCTION_FORMATS = ["4DX", "ScreenX"] as const;
export type ProductionFormat = (typeof PRODUCTION_FORMATS)[number];

export const PRODUCTION_REQUEST_STATUSES = ["under_review", "confirmed", "declined"] as const;
export type ProductionRequestStatus = (typeof PRODUCTION_REQUEST_STATUSES)[number];

export type ProductionRequest = {
  id: number;
  exhibitor_unique: string;
  title_text: string;
  imdb_link: string | null;
  first_release_date: string | null;
  format: ProductionFormat;
  notes: string | null;
  status: ProductionRequestStatus;
  requested_by: string | null;
  requested_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

/** Flat view-model, adds exhibitor display fields for the team queue. */
export type ProductionRequestVM = ProductionRequest & {
  exhibitorName: string;
  country: string;
  /** CJ team member who owns this exhibitor - see Exhibitor.account_manager. */
  accountManager: string | null;
};

export const TRAILER_FORMATS = ["4DX", "SX", "ULTRA"] as const;
export type TrailerFormat = (typeof TRAILER_FORMATS)[number];

export type TrailerAsset = {
  id: number;
  title: string;
  year: number | null;
  category: string;
  format: TrailerFormat;
  version: string | null;
  studio: string | null;
  duration: string | null;
  remark: string | null;
  label: string | null;
  included: boolean;
  is_new: boolean;
  trailer_link: string | null;
  note: string | null;
  title_no: string | null;
  created_at: string | null;
};

export const TRAILER_REQUEST_STATUSES = ["under_review", "confirmed", "declined"] as const;
export type TrailerRequestStatus = (typeof TRAILER_REQUEST_STATUSES)[number];

export type TrailerRequest = {
  id: number;
  exhibitor_unique: string;
  trailer_asset_id: number;
  notes: string | null;
  status: TrailerRequestStatus;
  requested_by: string | null;
  requested_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

/** An exhibitor's own trailer request, with the asset it's for attached. */
export type TrailerRequestWithAsset = TrailerRequest & { asset: TrailerAsset };

export const TBD_VOTES = ["yes", "no", "tbd"] as const;
export type TbdVote = (typeof TBD_VOTES)[number];

export type TbdTitle = {
  id: number;
  title_text: string;
  imdb_link: string | null;
  format: ProductionFormat;
  active: boolean;
  created_at: string | null;
};

export type TbdVoteRow = {
  tbd_title_id: number;
  exhibitor_unique: string;
  vote: TbdVote;
  voted_by: string | null;
  voted_at: string | null;
};

/** TBD title + every vote cast on it, for the team's collated view. */
export type TbdTitleWithVotes = TbdTitle & {
  votes: (TbdVoteRow & { exhibitorName: string; country: string })[];
};

/** Flat view-model for calendar pills and request lists. */
export type BookingVM = {
  id: number;
  date: string;
  programmingWeeks: number;
  status: BookingStatus;
  title: string;
  titleNo: string | null;
  genre: string | null;
  posterUrl: string | null;
  format: string;
  screenUnique: string;
  screenLabel: string;
  exhibitorId: string;
  exhibitorName: string;
  country: string;
  /** CJ team member who owns this exhibitor - see Exhibitor.account_manager. */
  accountManager: string | null;
  requestedBy: string | null;
  requestedAt: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  decisionNote: string | null;
  notes: string | null;
  /** Non-null for bulk-imported rows - see Booking.imported_from. */
  importedFrom: string | null;
};

/**
 * The subset of BookingVM the calendar grid actually reads. Serialising
 * full BookingVMs into the client payload for thousands of rows pushed
 * ~10MB of HTML per request; the audit//decision fields it never touches
 * (notes, decisionNote, requestedBy/At, confirmedBy/At, genre,
 * importedFrom, accountManager) are dropped here.
 */
export type CalendarBooking = Pick<
  BookingVM,
  | "id"
  | "date"
  | "programmingWeeks"
  | "status"
  | "title"
  | "titleNo"
  | "posterUrl"
  | "format"
  | "screenUnique"
  | "screenLabel"
  | "exhibitorId"
  | "exhibitorName"
  | "country"
>;

/** Narrows a BookingVM to what the calendar needs. */
export function toCalendarBooking(b: BookingVM): CalendarBooking {
  return {
    id: b.id,
    date: b.date,
    programmingWeeks: b.programmingWeeks,
    status: b.status,
    title: b.title,
    titleNo: b.titleNo,
    posterUrl: b.posterUrl,
    format: b.format,
    screenUnique: b.screenUnique,
    screenLabel: b.screenLabel,
    exhibitorId: b.exhibitorId,
    exhibitorName: b.exhibitorName,
    country: b.country,
  };
}
