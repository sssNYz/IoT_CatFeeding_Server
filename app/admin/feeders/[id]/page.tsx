"use client";

import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import type { z } from "zod";
import type { FeedCommand, Feeder, Schedule, ScheduleList } from "@/lib/contract/schemas";
import { thaiTime, useAdmin, usePoll } from "../../shell";

type Schedules = z.infer<typeof ScheduleList>;

/** The server never expires a command (it stays `sent`), so the page gives up waiting after this long. */
const FEED_WAIT_MS = 60_000;
const FEED_POLL_MS = 2_000;

const FEED_TEXT = {
  idle: "",
  feeding: "Feeding…",
  done: "Done ✓",
  silent: "Feeder did not respond",
  failed: "Could not send the command",
};

function FeedNow({ feederId }: { feederId: string }) {
  const admin = useAdmin();
  const [state, setState] = useState<keyof typeof FEED_TEXT>("idle");

  // onSubmit, not a form action: React holds state set inside an action until it ends, which would hide "Feeding…".
  async function feed(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState("feeding");
    try {
      const cmd = await admin.json<z.infer<typeof FeedCommand>>(`/feeders/${feederId}/commands/feed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portion_g: Number(form.get("portion_g")) }),
      });
      const until = Date.now() + FEED_WAIT_MS;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, FEED_POLL_MS));
        const now = await admin.json<z.infer<typeof FeedCommand>>(`/feeders/${feederId}/commands/${cmd.command_id}`);
        if (now.status === "done") return setState("done");
      }
      setState("silent");
    } catch {
      setState("failed");
    }
  }

  return (
    <form onSubmit={feed} aria-label="Feed now" className="toolbar card">
      <label>
        Portion (g)
        <input name="portion_g" type="number" min={5} max={100} defaultValue={20} required />
      </label>
      <button type="submit" disabled={state === "feeding"}>
        Feed now
      </button>
      <span role="status" aria-label="Feed now result" className={state === "silent" || state === "failed" ? "bad" : ""}>
        {FEED_TEXT[state]}
      </span>
    </form>
  );
}

function ScheduleRow({
  schedule,
  onSave,
  onDelete,
}: {
  schedule: z.infer<typeof Schedule>;
  onSave: (body: object) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const { schedule_id, time, portion_g, sound_id, enabled } = schedule;

  if (editing)
    return (
      <tr>
        <td>
          <label>
            Time
            <input name="time" type="time" defaultValue={time} form={`edit-${schedule_id}`} required />
          </label>
        </td>
        <td>
          <label>
            Portion (g)
            <input
              name="portion_g"
              type="number"
              min={5}
              max={100}
              defaultValue={portion_g}
              form={`edit-${schedule_id}`}
              required
            />
          </label>
        </td>
        <td>{enabled ? "yes" : "no"}</td>
        <td className="muted">{schedule_id}</td>
        <td>
          <form
            id={`edit-${schedule_id}`}
            className="row"
            action={async (form) => {
              await onSave({ ...schedule, time: form.get("time"), portion_g: Number(form.get("portion_g")) });
              setEditing(false);
            }}
          >
            <button type="submit">Save</button>
            <button type="button" className="quiet" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        </td>
      </tr>
    );

  return (
    <tr>
      <td>{time}</td>
      <td>{portion_g}</td>
      <td>{enabled ? "yes" : "no"}</td>
      <td className="muted">{schedule_id}</td>
      <td>
        <div className="row">
          <button type="button" className="quiet" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" className="quiet" onClick={() => onSave({ schedule_id, time, portion_g, sound_id, enabled: !enabled })}>
            {enabled ? "Disable" : "Enable"}
          </button>
          <button type="button" className="quiet" onClick={onDelete}>
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function FeederPage() {
  const { id } = useParams<{ id: string }>();
  const admin = useAdmin();
  const [feeder, setFeeder] = useState<z.infer<typeof Feeder>>();
  const [list, setList] = useState<Schedules>();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        admin
          .json<{ feeders: z.infer<typeof Feeder>[] }>("/feeders")
          .then((body) => setFeeder(body.feeders.find((f) => f.id === id))),
        admin.json<Schedules>(`/feeders/${id}/schedules`).then(setList),
      ]),
    [admin, id],
  );
  usePoll(load, [load]);

  /** Save one schedule (new when schedule_id is absent) the same way the owner app does, then refresh. */
  async function save(body: object) {
    const res = await admin.fetch(`/feeders/${id}/schedules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const { error } = (await res.json()) as { error: { message: string } };
      return setError(error.message);
    }
    setError(null);
    await load();
  }

  async function remove(scheduleId: string) {
    const res = await admin.fetch(`/feeders/${id}/schedules/${scheduleId}`, { method: "DELETE" });
    if (!res.ok) return setError(`Could not delete ${scheduleId} (${res.status})`);
    setError(null);
    await load();
  }

  async function add(form: FormData) {
    await save({ time: form.get("time"), portion_g: Number(form.get("portion_g")), enabled: true });
  }

  if (!feeder) return <main className="muted">Loading…</main>;
  const { state, synced, last_seen, fw, schedule_version, applied_schedule_version } = feeder.status;

  return (
    <main>
      <h1>{feeder.name}</h1>
      <p className="muted">{feeder.id}</p>

      <section className="card">
        <dl className="facts">
          <dt>State</dt>
          <dd>
            <span className={`pill ${state}`}>{state}</span>
          </dd>
          <dt>Last seen</dt>
          <dd>{thaiTime(last_seen)}</dd>
          <dt>Firmware</dt>
          <dd>{fw ?? "–"}</dd>
          <dt>Schedules</dt>
          <dd role="status" aria-label="Schedule sync">
            {synced ? "Synced ✓" : "Waiting for feeder…"}{" "}
            <span className="muted">
              (server v{schedule_version}, feeder v{applied_schedule_version ?? "–"})
            </span>
          </dd>
        </dl>
      </section>

      <h2>Feed now</h2>
      <FeedNow feederId={feeder.id} />

      <h2>Schedules (Thai time)</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Portion g</th>
              <th>Enabled</th>
              <th>Id</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list?.schedules.map((s) => (
              <ScheduleRow
                key={s.schedule_id}
                schedule={s}
                onSave={save}
                onDelete={() => remove(s.schedule_id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <form action={add} aria-label="Add schedule" className="toolbar card" style={{ marginTop: 16 }}>
        <label>
          Time
          <input name="time" type="time" required />
        </label>
        <label>
          Portion (g)
          <input name="portion_g" type="number" min={5} max={100} required />
        </label>
        <button type="submit">Add</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
