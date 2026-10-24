"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import type { LoginResponse } from "@/lib/contract/schemas";

// The dashboard is client pages over the same public API as the owner app; the admin's token lives in sessionStorage.
const API = "/api/v1";
const TOKEN_KEY = "catfeeder-admin-token";
export const POLL_MS = 5_000;

/** "2026-10-24T10:39:33+07:00" → "2026-10-24 10:39": read straight from the server's Thai time, never the browser's zone. */
export const thaiTime = (at: string | null) => (at ? `${at.slice(0, 10)} ${at.slice(11, 16)}` : "never");

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

export class SignedOut extends Error {}

type Admin = {
  /** Call the API as the admin. A 401 (expired token) signs out and rejects with SignedOut. */
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  json: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const AdminContext = createContext<Admin | null>(null);

export function useAdmin() {
  const admin = useContext(AdminContext);
  if (!admin) throw new Error("useAdmin outside AdminShell");
  return admin;
}

/** Run `load` now and every POLL_MS while the page is open. */
export function usePoll(load: () => Promise<unknown>, deps: unknown[]) {
  useEffect(() => {
    const run = () =>
      load().catch((e) => {
        if (!(e instanceof SignedOut)) console.error(e);
      });
    run();
    const timer = setInterval(run, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
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
    <main className="signin">
      <form action={submit} className="card">
        <h1>Cat Feeder admin</h1>
        <label>
          Email <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit">Sign in</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/events", label: "Events" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const path = usePathname();

  useEffect(() => {
    setToken(store.get());
    setReady(true);
  }, []);

  const signedIn = useCallback((next: string | null) => {
    store.set(next);
    setToken(next);
  }, []);

  const call = useCallback(
    async (p: string, init: RequestInit = {}) => {
      const res = await fetch(API + p, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        signedIn(null);
        throw new SignedOut();
      }
      return res;
    },
    [token, signedIn],
  );

  const json = useCallback(
    async <T,>(p: string, init?: RequestInit) => {
      const res = await call(p, init);
      if (!res.ok) throw new Error(`${p}: ${res.status}`);
      return (await res.json()) as T;
    },
    [call],
  );

  // One object per token, so pages polling on [admin] do not restart on every render.
  const admin = useMemo(() => ({ fetch: call, json }), [call, json]);

  if (!ready) return null;
  if (!token) return <SignIn onToken={signedIn} />;

  return (
    <AdminContext.Provider value={admin}>
      <header className="bar">
        <strong>Cat Feeder admin</strong>
        <nav>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <button type="button" className="quiet" onClick={() => signedIn(null)}>
          Sign out
        </button>
      </header>
      {children}
    </AdminContext.Provider>
  );
}
