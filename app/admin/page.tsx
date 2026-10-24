"use client";

import { useEffect, useState } from "react";
import type { z } from "zod";
import type { AdminStats, Feeder, LoginResponse } from "@/lib/contract/schemas";

// The dashboard is a client page over the same public API as the owner app; the admin's token lives in sessionStorage.
const API = "/api/v1";
const POLL_MS = 5_000;
const TOKEN_KEY = "catfeeder-admin-token";

// sessionStorage can throw (blocked site data); the dashboard then just asks to sign in again.
const store = {
  get: () => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {}
  },
};

/** "2026-10-24T10:39:33+07:00" → "2026-10-24 10:39": read straight from the server's Thai time, never the browser's zone. */
const thaiTime = (at: string | null) => (at ? `${at.slice(0, 10)} ${at.slice(11, 16)}` : "never");

async function api<T>(path: string, token: string): Promise<T> {
  const res = await fetch(API + path, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

function SignIn({ onToken }: { onToken: (token: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData) {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    if (!res.ok) return setError("Wrong email or password.");
    const { token, user } = (await res.json()) as z.infer<typeof LoginResponse>;
    if (user.role !== "admin") return setError("This dashboard is for the admin only. Owners use the phone app.");
    onToken(token);
  }

  return (
    <form action={submit}>
      <h1>Cat Feeder admin</h1>
      <label>
        Email <input name="email" type="email" required />
      </label>
      <label>
        Password <input name="password" type="password" required />
      </label>
      <button type="submit">Sign in</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function FeederCard({ feeder }: { feeder: z.infer<typeof Feeder> }) {
  return (
    <article aria-label={feeder.name}>
      <h3>{feeder.name}</h3>
      <p>{feeder.id}</p>
      <dl>
        <dt>State</dt>
        <dd>{feeder.status.state}</dd>
        <dt>Schedules</dt>
        <dd>{feeder.status.synced ? "Synced ✓" : "Waiting for feeder…"}</dd>
        <dt>Last seen</dt>
        <dd>{thaiTime(feeder.status.last_seen)}</dd>
        <dt>Firmware</dt>
        <dd>{feeder.status.fw ?? "–"}</dd>
      </dl>
    </article>
  );
}

function Tile({ name, value }: { name: string; value: number | undefined }) {
  return (
    <section aria-label={name}>
      <dl>
        <dt>{name}</dt>
        <dd>{value ?? "…"}</dd>
      </dl>
    </section>
  );
}

function Overview({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [feeders, setFeeders] = useState<z.infer<typeof Feeder>[]>([]);
  const [stats, setStats] = useState<z.infer<typeof AdminStats>>();

  useEffect(() => {
    const load = () => {
      api<{ feeders: z.infer<typeof Feeder>[] }>("/feeders", token).then((body) => setFeeders(body.feeders));
      api<z.infer<typeof AdminStats>>("/admin/stats", token).then(setStats);
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [token]);

  return (
    <main>
      <h1>Overview</h1>
      <button type="button" onClick={onSignOut}>
        Sign out
      </button>
      <Tile name="Events stored" value={stats?.events_total} />
      <Tile name="Duplicates rejected" value={stats?.duplicates_rejected} />
      <Tile name="Jams" value={stats?.failed.jam} />
      <Tile name="Missed" value={stats?.failed.missed} />
      <Tile name="Errors" value={stats?.failed.error} />
      <h2>Feeders</h2>
      {feeders.map((feeder) => (
        <FeederCard key={feeder.id} feeder={feeder} />
      ))}
    </main>
  );
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => setToken(store.get()), []);

  const signedIn = (next: string | null) => {
    store.set(next);
    setToken(next);
  };
  return token ? <Overview token={token} onSignOut={() => signedIn(null)} /> : <SignIn onToken={signedIn} />;
}
