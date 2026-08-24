"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "No se pudo entrar.");
        return;
      }

      // `refresh()` además de `push()`: la página del panel es un server
      // component y sin esto se sirve la versión cacheada, sin sesión.
      router.push("/admin");
      router.refresh();
    } catch {
      setError("No se pudo conectar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-[380px] rounded-xl border border-line bg-surface p-5 sm:p-7"
    >
      <h1 className="mb-1 font-display text-[22px] font-bold tracking-[-0.02em]">Panel</h1>
      <p className="mb-6 text-[13px] text-ink-4">Revisión de peticiones</p>

      <label className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-ink-4">
        USUARIO
      </label>
      <input
        value={user}
        onChange={(e) => setUser(e.target.value)}
        autoComplete="username"
        autoFocus
        className="mb-4 w-full rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 text-[14px] outline-none focus:border-accent"
      />

      <label className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-ink-4">
        CLAVE
      </label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        className="mb-5 w-full rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 text-[14px] outline-none focus:border-accent"
      />

      {error && (
        <p className="mb-4 rounded-lg border border-[#4a2320] bg-[#2a1614] px-3.5 py-2.5 text-[13px] text-neg">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !user || !password}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-[14px] font-semibold text-bg transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
