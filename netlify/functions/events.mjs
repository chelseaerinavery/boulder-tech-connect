// Serverless endpoint that returns upcoming Boulder Tech Connect events.
// It fetches Luma's public iCal feed server-side (no CORS limits server-to-server)
// and returns clean JSON, so the page can load events live on every visit without
// rebuilding the site. Netlify auto-deploys this from the repo — no dashboard setup.
//
// Route is set via `config.path` below: GET /api/events

const CAL_ID = "cal-uiQtr7zdMvN8Dr5";
const CAL_ICS = `https://api.lu.ma/ics/get?entity=calendar&id=${CAL_ID}`;
const MAX_EVENTS = 6;

// Join RFC 5545 folded lines (continuations start with a space or tab).
function unfold(ics) {
  const lines = [];
  for (const line of ics.split(/\r?\n/)) {
    if (lines.length && (line.startsWith(" ") || line.startsWith("\t"))) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeText(v) {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// Handles UTC (…Z), all-day (date only), and floating times. Luma emits UTC.
function parseICSDate(value) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh = "00", mm = "00", ss = "00"] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss));
}

function parseEvents(ics) {
  const events = [];
  let cur = null;
  for (const line of unfold(ics)) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
    } else if (line === "END:VEVENT") {
      const start = cur && parseICSDate(cur.DTSTART ?? "");
      if (cur && start) {
        const desc = unescapeText(cur.DESCRIPTION ?? "");
        const url = desc.match(/https?:\/\/luma\.com\/\S+/i);
        events.push({
          title: unescapeText(cur.SUMMARY ?? "Untitled event"),
          start,
          end: parseICSDate(cur.DTEND ?? ""),
          location: unescapeText(cur.LOCATION ?? ""),
          url: url ? url[0] : null,
        });
      }
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).split(";")[0];
      cur[key] = line.slice(idx + 1);
    }
  }
  return events;
}

export default async () => {
  try {
    const res = await fetch(CAL_ICS);
    if (!res.ok) throw new Error(`Luma ICS returned HTTP ${res.status}`);
    const now = Date.now();
    const events = parseEvents(await res.text())
      .filter((e) => (e.end ?? e.start).getTime() >= now)
      .sort((a, b) => a.start - b.start)
      .slice(0, MAX_EVENTS)
      .map((e) => ({
        title: e.title,
        start: e.start.toISOString(),
        end: e.end ? e.end.toISOString() : null,
        location: e.location,
        url: e.url,
      }));

    return new Response(JSON.stringify({ events }), {
      headers: {
        "Content-Type": "application/json",
        // Cache at the edge so we don't hit Luma on every visit, but stay fresh.
        "Cache-Control":
          "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ events: [], error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
};

export const config = { path: "/api/events" };
