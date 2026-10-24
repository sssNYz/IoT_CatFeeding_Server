"use client";

import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { AdminEvent, Feeder } from "@/lib/contract/schemas";
import { thaiTime, useAdmin, usePoll } from "../shell";

type Event = z.infer<typeof AdminEvent>;

/** Who ate: the registered cat, or why the server cannot say. */
function catOf({ rfid }: Event) {
  if (rfid.cat) return rfid.cat.name;
  if (rfid.result === "multiple") return "two cats";
  if (rfid.result === "tag") return `unregistered (${rfid.tag_id})`;
  return "unknown";
}

const grams = (g: number | null) => (g === null ? "–" : `${g}`);

const RESULTS = ["ok", "jam", "missed", "error"] as const;

/** The event's photo. GET /media needs the bearer token, so it is fetched and shown from a blob URL. */
function Thumb({ mediaId }: { mediaId: string }) {
  const admin = useAdmin();
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    let url: string | undefined;
    admin
      .fetch(`/media/${mediaId}`)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`media ${res.status}`))))
      .then((blob) => setSrc((url = URL.createObjectURL(blob))))
      .catch(() => {});
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [admin, mediaId]);

  return src ? <img className="thumb" src={src} alt="Feeding photo" /> : <span className="muted">…</span>;
}

/** The exact MQTT payload the feeder sent, in a modal. */
function RawJson({ event, onClose }: { event: Event; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={`Event ${event.event_id}`}>
      <div className="row">
        <h2>{event.event_id}</h2>
        <form method="dialog">
          <button type="submit" className="quiet">
            Close
          </button>
        </form>
      </div>
      <pre>{JSON.stringify(event.raw, null, 2)}</pre>
    </dialog>
  );
}

export default function EventsPage() {
  const admin = useAdmin();
  const [events, setEvents] = useState<Event[]>([]);
  const [feeders, setFeeders] = useState<z.infer<typeof Feeder>[]>([]);
  const [feeder, setFeeder] = useState("");
  const [result, setResult] = useState("");
  const [open, setOpen] = useState<Event | null>(null);

  useEffect(() => {
    admin.json<{ feeders: z.infer<typeof Feeder>[] }>("/feeders").then((body) => setFeeders(body.feeders), () => {});
  }, [admin]);

  /** GET events.csv needs the bearer token, so fetch it and save it through a temporary link. */
  async function downloadCsv() {
    const res = await admin.fetch(`/feeders/${feeder}/events.csv`);
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    const link = Object.assign(document.createElement("a"), { href: url, download: `${feeder}-events.csv` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000); // some browsers read the blob after click() returns
  }

  usePoll(() => {
    const query = new URLSearchParams({ limit: "100", ...(feeder && { feeder }), ...(result && { result }) });
    return admin.json<{ events: Event[] }>(`/admin/events?${query}`).then((body) => setEvents(body.events));
  }, [admin, feeder, result]);

  return (
    <main>
      <h1>Feeding events</h1>
      <div className="toolbar">
        <label>
          Feeder
          <select value={feeder} onChange={(e) => setFeeder(e.target.value)}>
            <option value="">All feeders</option>
            {feeders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.id})
              </option>
            ))}
          </select>
        </label>
        <label>
          Result
          <select value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="">All results</option>
            {RESULTS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={downloadCsv} disabled={!feeder} title={feeder ? "" : "Choose a feeder first"}>
          Download CSV
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Feeder</th>
              <th>Trigger</th>
              <th>Cat</th>
              <th>Target g</th>
              <th>Dispensed g</th>
              <th>Photo</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.event_id} onClick={() => setOpen(e)}>
                <td>{thaiTime(e.occurred_at)}</td>
                <td className="muted">{e.event_id}</td>
                <td>{e.feeder_id}</td>
                <td>{e.trigger}</td>
                <td>{catOf(e)}</td>
                <td>{grams(e.target_portion_g)}</td>
                <td>{grams(e.dispensed_g)}</td>
                <td>{e.image_media_id && <Thumb mediaId={e.image_media_id} />}</td>
                <td>
                  <span className={`pill ${e.result}`}>{e.result}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <RawJson event={open} onClose={() => setOpen(null)} />}
    </main>
  );
}
