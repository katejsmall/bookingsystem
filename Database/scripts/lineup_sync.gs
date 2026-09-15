/**
 * One-way sync: Lineup Google Sheet -> Supabase `lineup` table.
 *
 * Setup (one-time):
 * 1. Open the lineup Google Sheet -> Extensions > Apps Script.
 * 2. Paste this file's contents in as a script file.
 * 3. Project Settings (gear icon) > Script Properties > add a property
 *    named DB_PASSWORD with the Supabase database password.
 *    (Reset/find it in the Supabase dashboard: Project Settings > Database.
 *    Do NOT hardcode it in this file.)
 * 4. Update SHEET_NAME below if the tab isn't literally called "Lineup".
 * 5. Make sure the sheet's header row has columns named exactly:
 *    title_no, format, confirmed, first_available_release_date
 *    and optionally: notes
 *    Add one more column header named "Sync Status" - the script writes
 *    per-row feedback there (blank = synced OK, ERROR: ... = skipped).
 * 6. Run syncLineupToSupabase() once manually to trigger the Google
 *    authorization prompt (it needs the external-request permission for
 *    JDBC). Approve it.
 * 7. Triggers (clock icon) > Add Trigger > function: syncLineupToSupabase,
 *    event source: Time-driven, e.g. every 5 minutes.
 *
 * This only writes Sheet -> Postgres. It never reads back lineup rows
 * that were edited directly in Postgres/NocoDB, by design (the Sheet is
 * the source of truth for lineup while this bridge is in place).
 */

const DB_URL = 'jdbc:postgresql://aws-1-eu-central-1.pooler.supabase.com:5432/postgres';
const DB_USER = 'postgres.cvershkiffvpbnuxfaxk';
const SHEET_NAME = 'Lineup';
const STATUS_COLUMN_HEADER = 'Sync Status';

function syncLineupToSupabase() {
  const password = PropertiesService.getScriptProperties().getProperty('DB_PASSWORD');
  if (!password) {
    throw new Error('DB_PASSWORD script property not set (Project Settings > Script Properties).');
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No sheet tab named "' + SHEET_NAME + '" found.');

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const col = {};
  headers.forEach((h, i) => { col[h] = i; });

  ['title_no', 'format', 'confirmed', 'first_available_release_date', STATUS_COLUMN_HEADER]
    .forEach(name => {
      if (!(name in col)) throw new Error('Missing required column header: ' + name);
    });

  const conn = Jdbc.getConnection(DB_URL, DB_USER, password);
  try {
    const validTitleNos = loadValidTitleNos(conn);
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const status = syncRow(conn, row, col, validTitleNos);
      sheet.getRange(i + 1, col[STATUS_COLUMN_HEADER] + 1).setValue(status);
    }
  } finally {
    conn.close();
  }
}

function loadValidTitleNos(conn) {
  const stmt = conn.createStatement();
  const rs = stmt.executeQuery('select title_no from "Title_master"');
  const set = {};
  while (rs.next()) set[rs.getString(1)] = true;
  rs.close();
  stmt.close();
  return set;
}

function syncRow(conn, row, col, validTitleNos) {
  const titleNo = String(row[col['title_no']] || '').trim();
  if (!titleNo) return ''; // blank row, ignore

  const format = String(row[col['format']] || '').trim();
  if (format !== '4DX' && format !== 'ScreenX') {
    return 'ERROR: format must be "4DX" or "ScreenX", got "' + format + '"';
  }

  if (!validTitleNos[titleNo]) {
    return 'ERROR: title_no "' + titleNo + '" not found in Title_master';
  }

  const confirmedRaw = row[col['confirmed']];
  const confirmed = confirmedRaw === true || String(confirmedRaw).trim().toUpperCase() === 'TRUE';

  const releaseDateRaw = row[col['first_available_release_date']];
  let releaseDate = null;
  if (releaseDateRaw !== '' && releaseDateRaw !== null) {
    const d = (releaseDateRaw instanceof Date) ? releaseDateRaw : new Date(releaseDateRaw);
    if (isNaN(d.getTime())) {
      return 'ERROR: invalid release date "' + releaseDateRaw + '"';
    }
    releaseDate = d;
  }

  const notes = ('notes' in col) ? String(row[col['notes']] || '') : '';

  const sql = 'insert into lineup ' +
    '(title_no, format, confirmed, first_available_release_date, notes, updated_at) ' +
    'values (?, ?, ?, ?, ?, now()) ' +
    'on conflict (title_no, format) do update set ' +
    'confirmed = excluded.confirmed, ' +
    'first_available_release_date = excluded.first_available_release_date, ' +
    'notes = excluded.notes, ' +
    'updated_at = now()';

  const stmt = conn.prepareStatement(sql);
  try {
    stmt.setString(1, titleNo);
    stmt.setString(2, format);
    stmt.setBoolean(3, confirmed);
    if (releaseDate) {
      stmt.setDate(4, Jdbc.newDate(releaseDate));
    } else {
      stmt.setNull(4, Jdbc.Types.DATE);
    }
    stmt.setString(5, notes);
    stmt.execute();
    return '';
  } catch (e) {
    return 'ERROR: ' + e.message;
  } finally {
    stmt.close();
  }
}
