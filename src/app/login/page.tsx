"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <section className="hidden md:flex bg-[#101e36] text-white p-16 flex-col justify-between">
        <div className="flex gap-3 items-center text-xl font-bold">
          <Package /> ParcelOps
        </div>
        <div>
          <p className="text-blue-400 text-xs tracking-widest uppercase">
            Shipment control center
          </p>
          <h1 className="text-5xl font-semibold leading-tight">
            Every shipment.
            <br />
            One clear view.
          </h1>
          <p className="text-slate-400 max-w-sm leading-7">
            Your daily workspace for deliveries, exceptions, and everything in
            between.
          </p>
        </div>
        <p className="text-slate-500 text-xs">
          Amazon US & Canada · Private operations
        </p>
      </section>
      <main className="flex items-center justify-center p-8">
        <form
          className="w-full max-w-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              const r = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(Object.fromEntries(f)),
              });
              const data = await r.json();
              if (!r.ok) throw new Error(data.error);
              window.location.href = "/dashboard";
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          <Package className="text-blue-600 mb-8" size={36} />
          <h1 className="text-3xl font-semibold mb-2">Welcome back</h1>
          <p className="text-slate-500 text-sm mb-8">
            Sign in to your shipment workspace.
          </p>
          <label className="field mb-5">
            Email address
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="field mb-6">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p role="alert" className="text-red-600 text-sm">
              {error}
            </p>
          )}
          <Button className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in →"}
          </Button>
          <p className="text-xs text-slate-400 text-center mt-6">
            Administrator access only
          </p>
        </form>
      </main>
    </div>
  );
}
