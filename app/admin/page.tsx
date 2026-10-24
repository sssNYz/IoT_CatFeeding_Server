"use client";

import Link from "next/link";
import { useState } from "react";
import type { z } from "zod";
import type { AdminStats, Feeder } from "@/lib/contract/schemas";
import { thaiTime, useAdmin, usePoll } from "./shell";

function FeederCard({ feeder }: { feeder: z.infer<typeof Feeder> }) {
  const { state, synced, last_seen, fw } = feeder.status;
  return (
    <article aria-label={feeder.name} className="card">
      <h3>
        <Link href={`/admin/feeders/${feeder.id}`}>{feeder.name}</Link>
      </h3>
      <p className="muted">{feeder.id}</p>
      <dl className="facts">
        <dt>State</dt>
        <dd>
          <span className={`pill ${state}`}>{state}</span>
        </dd>
        <dt>Schedules</dt>
        <dd>{synced ? "Synced ✓" : "Waiting for feeder…"}</dd>
        <dt>Last seen</dt>
        <dd>{thaiTime(last_seen)}</dd>
        <dt>Firmware</dt>
        <dd>{fw ?? "–"}</dd>
      </dl>
    </article>
  );
}

function Tile({ name, value }: { name: string; value: number | undefined }) {
  return (
    <section aria-label={name} className="tile">
      <dl>
        <dt>{name}</dt>
        <dd>{value ?? "…"}</dd>
      </dl>
    </section>
  );
}

export default function Overview() {
  const admin = useAdmin();
  const [feeders, setFeeders] = useState<z.infer<typeof Feeder>[]>([]);
  const [stats, setStats] = useState<z.infer<typeof AdminStats>>();

  usePoll(
    () =>
      Promise.all([
        admin.json<{ feeders: z.infer<typeof Feeder>[] }>("/feeders").then((body) => setFeeders(body.feeders)),
        admin.json<z.infer<typeof AdminStats>>("/admin/stats").then(setStats),
      ]),
    [admin],
  );

  return (
    <main>
      <h1>Overview</h1>
      <div className="tiles">
        <Tile name="Events stored" value={stats?.events_total} />
        <Tile name="Duplicates rejected" value={stats?.duplicates_rejected} />
        <Tile name="Jams" value={stats?.failed.jam} />
        <Tile name="Missed" value={stats?.failed.missed} />
        <Tile name="Errors" value={stats?.failed.error} />
      </div>
      <h2>Feeders</h2>
      <div className="cards">
        {feeders.map((feeder) => (
          <FeederCard key={feeder.id} feeder={feeder} />
        ))}
      </div>
    </main>
  );
}
