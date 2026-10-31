"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Package,
  Truck,
  CheckCircle2,
  TriangleAlert,
  ArrowUpRight,
  Upload,
  Download,
  Search,
  ChevronRight,
  RefreshCw,
  Clock,
  ArrowRight,
  Check,
  MapPin,
  FileSpreadsheet,
  Plus,
} from "lucide-react";
import { Button } from "./ui/button";
import { label, statuses } from "@/lib/queries";
import { fields, type Mapping } from "@/lib/import-fields";
type Row = Record<string, any>;
async function api(path: string, body?: unknown) {
  const r = await fetch(
    "/api/" + path,
    body instanceof FormData
      ? { method: "POST", body }
      : body !== undefined
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : { cache: "no-store" },
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "Request failed");
  return d;
}
function useData(path: string) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setError("");
    api(path)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [path, version]);
  return { data, error, reload: () => setVersion((v) => v + 1) };
}
function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-4 text-sm mb-5"
    >
      {error}
    </div>
  ) : null;
}
function Loading() {
  return (
    <div className="panel p-12 text-center text-slate-400 text-sm">
      Loading your workspace…
    </div>
  );
}
function Empty({ text = "No records yet." }: { text?: string }) {
  return (
    <div className="text-center py-12 text-slate-400 text-sm">
      <Package className="mx-auto mb-3 opacity-50" size={28} />
      {text}
    </div>
  );
}
function Title({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
      <div>
        {eyebrow && (
          <div className="text-[10px] uppercase text-blue-600 tracking-widest font-semibold mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[26px] font-semibold tracking-tight mb-1">
          {title}
        </h1>
        <p className="text-xs text-slate-500 mb-0">{description}</p>
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
const colors: Record<string, string> = {
  InTransit: "#3b82f6",
  Delivered: "#10b981",
  AvailableForPickup: "#8b5cf6",
  DeliveryFailure: "#ef4444",
  Exception: "#f59e0b",
  Returned: "#f43f5e",
  PendingRegistration: "#94a3b8",
  InfoReceived: "#06b6d4",
  OutForDelivery: "#6366f1",
  NotFound: "#64748b",
};
function Badge({ status }: { status: string }) {
  const color = colors[status] ?? "#64748b";
  return (
    <span className="badge" style={{ color, background: color + "12" }}>
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {label(status)}
    </span>
  );
}
const date = (s: string | null) =>
  s
    ? new Date(s).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
const time = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
const days = (s: string | null) =>
  s
    ? Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 86400000))
    : "—";
function Priority({ n }: { n: number }) {
  return (
    <span
      className={`badge ${n === 3 ? "bg-red-50 text-red-600" : n === 2 ? "bg-orange-50 text-orange-600" : "bg-amber-50 text-amber-700"}`}
    >
      {n === 3 ? "Urgent" : n === 2 ? "High priority" : "Warning"}
    </span>
  );
}
function Dashboard() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const { data: d, error } = useData(
    "dashboard?" + new URLSearchParams(filters).toString(),
  );
  const change = (k: string, v: string) =>
    setFilters((f) => ({ ...f, [k]: v }));
  return (
    <>
      <Title
        eyebrow="Your daily overview"
        title="Shipment overview"
        description="A clear picture of your deliveries. Know what needs your attention."
      >
        <Button variant="outline" asChild>
          <Link href="/shipments">
            <Search size={14} />
            View shipments
          </Link>
        </Button>
        <Button asChild>
          <Link href="/imports">
            <Plus size={15} />
            Import shipments
          </Link>
        </Button>
      </Title>
      <div className="panel p-4 mb-5 flex flex-wrap gap-3 items-end">
        <label className="field">
          Imported from
          <input
            type="date"
            aria-label="Overview start date"
            value={filters.from ?? ""}
            onChange={(e) => change("from", e.target.value)}
          />
        </label>
        <label className="field">
          Through
          <input
            type="date"
            aria-label="Overview end date"
            value={filters.to ?? ""}
            onChange={(e) => change("to", e.target.value)}
          />
        </label>
        <label className="field">
          Carrier
          <select
            value={filters.carrier ?? ""}
            onChange={(e) => change("carrier", e.target.value)}
          >
            <option value="">All carriers</option>
            {d?.carrierOptions
              .filter((c: Row) => c.carrier)
              .map((c: Row) => (
                <option key={c.carrier}>{c.carrier}</option>
              ))}
          </select>
        </label>
        <label className="field">
          Marketplace
          <select
            value={filters.marketplace ?? ""}
            onChange={(e) => change("marketplace", e.target.value)}
          >
            <option value="">All marketplaces</option>
            <option>Amazon US</option>
            <option>Amazon CA</option>
          </select>
        </label>
        <label className="field">
          Country
          <select
            value={filters.country ?? ""}
            onChange={(e) => change("country", e.target.value)}
          >
            <option value="">All countries</option>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
        </label>
        <label className="field">
          Status
          <select
            value={filters.status ?? ""}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" size="sm" onClick={() => setFilters({})}>
          Reset
        </Button>
      </div>
      <ErrorBox error={error} />
      {!d ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {[
              {
                name: "Total shipments",
                n: d.total,
                icon: Package,
                color: "blue",
                sub: "In the selected view",
              },
              {
                name: "In transit",
                n:
                  d.groups.find((g: Row) => g.status === "InTransit")?._count ??
                  0,
                icon: Truck,
                color: "indigo",
                sub: "On the way to customers",
              },
              {
                name: "Delivered",
                n:
                  d.groups.find((g: Row) => g.status === "Delivered")?._count ??
                  0,
                icon: CheckCircle2,
                color: "emerald",
                sub: "Successfully completed",
              },
              {
                name: "Action required",
                n: d.issueCount,
                icon: TriangleAlert,
                color: "orange",
                sub: "Open delivery incidents",
              },
            ].map((x) => (
              <div key={x.name} className="panel p-5">
                <div className="flex justify-between text-xs text-slate-500 mb-4">
                  {x.name}
                  <x.icon
                    size={17}
                    className={
                      x.color === "orange" ? "text-orange-500" : "text-blue-500"
                    }
                  />
                </div>
                <div className="text-3xl font-semibold tracking-tight mb-3">
                  {x.n.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-400">{x.sub}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 mb-6">
            {[
              "PendingRegistration",
              "InfoReceived",
              "OutForDelivery",
              "AvailableForPickup",
              "DeliveryFailure",
              "Exception",
              "Returned",
            ].map((s) => (
              <Link
                key={s}
                href={"/shipments?status=" + s}
                className="panel p-3 hover:border-blue-300"
              >
                <div className="text-lg font-semibold mb-1">
                  {d.groups.find((g: Row) => g.status === s)?._count ?? 0}
                </div>
                <div className="text-[9px] text-slate-500 leading-4">
                  {label(s)}
                </div>
              </Link>
            ))}
            <Link href="/shipments?delayed=true" className="panel p-3">
              <div className="text-lg font-semibold mb-1 text-amber-600">
                {d.delayed}
              </div>
              <div className="text-[9px] text-slate-500">Delayed shipments</div>
            </Link>
          </div>
          <div className="grid xl:grid-cols-[1.5fr_1fr] gap-5 mb-5">
            <section className="panel p-5">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-sm font-semibold mb-0">
                  Shipment status distribution
                </h2>
                <span className="text-[10px] text-slate-400">All time</span>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-8">
                <div className="w-40 h-40 relative shrink-0 mx-auto">
                  <svg viewBox="0 0 100 100" className="-rotate-90">
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="none"
                      stroke="#f1f5f9"
                      strokeWidth="12"
                    />
                    {d.groups.map((g: Row, i: number) => {
                      const total = Math.max(1, d.total),
                        prev = d.groups
                          .slice(0, i)
                          .reduce((n: number, x: Row) => n + x._count, 0);
                      return (
                        <circle
                          key={g.status}
                          cx="50"
                          cy="50"
                          r="38"
                          fill="none"
                          stroke={colors[g.status] ?? "#94a3b8"}
                          strokeWidth="12"
                          strokeDasharray={`${(g._count / total) * 238.76} 238.76`}
                          strokeDashoffset={(-prev / total) * 238.76}
                        />
                      );
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <b className="text-2xl">{d.total}</b>
                    <span className="text-[9px] text-slate-400">SHIPMENTS</span>
                  </div>
                </div>
                <div className="flex-1 w-full space-y-3">
                  {d.groups.map((g: Row) => (
                    <div
                      key={g.status}
                      className="flex items-center text-[11px] gap-2"
                    >
                      <span
                        className="w-2 h-2 rounded-sm"
                        style={{ background: colors[g.status] ?? "#94a3b8" }}
                      />
                      <span className="text-slate-500 flex-1">
                        {label(g.status)}
                      </span>
                      <b>{g._count}</b>
                      <span className="text-slate-400 w-9 text-right">
                        {Math.round((g._count / Math.max(1, d.total)) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <section className="panel p-5">
              <h2 className="text-sm font-semibold mb-1">Carrier breakdown</h2>
              <p className="text-[10px] text-slate-400 mb-6">
                Volume by shipping partner
              </p>
              <div className="space-y-5">
                {d.carriers.slice(0, 5).map((c: Row, i: number) => (
                  <div key={c.carrier}>
                    <div className="flex justify-between text-[11px] mb-2">
                      <span>{c.carrier || "Auto detect"}</span>
                      <b>
                        {c._count}
                        <span className="text-slate-400 font-normal ml-2">
                          shipments
                        </span>
                      </b>
                    </div>
                    <div className="chart-bar">
                      <i
                        style={{
                          width: `${(c._count / Math.max(1, d.total)) * 100}%`,
                          background: [
                            "#3b82f6",
                            "#6366f1",
                            "#8b5cf6",
                            "#06b6d4",
                          ][i % 4],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between text-[11px]">
                <span className="text-slate-500">Delivery completion</span>
                <b className="text-emerald-600">
                  {Math.round(
                    ((d.groups.find((g: Row) => g.status === "Delivered")
                      ?._count ?? 0) /
                      Math.max(1, d.total)) *
                      100,
                  )}
                  %
                </b>
              </div>
            </section>
          </div>
          <section className="panel p-5 mb-5">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold mb-0">
                Delivery performance
              </h2>
              <span className="text-[10px] text-slate-400">
                Last 14 days · UTC
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mb-5">
              Delivered shipments by latest carrier event date, within your
              selected filters.
            </p>
            <div
              className="flex h-28 items-end gap-2"
              role="img"
              aria-label="Daily delivered shipment counts"
            >
              {d.performance.map((v: Row) => (
                <div
                  key={v.day}
                  className="flex-1 flex flex-col h-full justify-end items-center gap-1"
                  title={v.day + ": " + v.count + " delivered"}
                >
                  <span className="text-[9px] text-slate-400">
                    {v.count || ""}
                  </span>
                  <div
                    className="bg-emerald-400 rounded-t w-full min-h-[2px]"
                    style={{
                      height: Math.max(
                        2,
                        (v.count /
                          Math.max(
                            1,
                            ...d.performance.map((x: Row) => x.count),
                          )) *
                          72,
                      ),
                    }}
                  />
                  <span className="text-[8px] text-slate-400">
                    {v.day.slice(8)}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="panel mb-5 overflow-hidden">
            <div className="p-5 flex justify-between">
              <div className="flex items-center gap-2">
                <TriangleAlert size={16} className="text-orange-500" />
                <h2 className="text-sm font-semibold mb-0">
                  Needs your attention
                </h2>
                <span className="badge bg-orange-50 text-orange-600">
                  {d.issues.length} shown
                </span>
              </div>
              <Link
                href="/action-required"
                className="text-blue-600 text-[11px] flex items-center gap-1"
              >
                View all <ArrowRight size={13} />
              </Link>
            </div>
            {!d.issues.length ? (
              <Empty text="No open incidents. You're all caught up." />
            ) : (
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Tracking / order</th>
                      <th>Issue</th>
                      <th>Priority</th>
                      <th>Detected</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.issues.map((e: Row) => (
                      <tr key={e.id}>
                        <td>
                          <Link
                            href={"/shipments/" + e.shipmentId}
                            className="font-semibold text-blue-600"
                          >
                            {e.shipment.number}
                          </Link>
                          <div className="text-[10px] text-slate-400 mt-1">
                            {e.shipment.orderId}
                          </div>
                        </td>
                        <td>{e.title}</td>
                        <td>
                          <Priority n={e.priority} />
                        </td>
                        <td className="text-slate-500">{date(e.createdAt)}</td>
                        <td>
                          <Link href={"/shipments/" + e.shipmentId}>
                            <ChevronRight size={15} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel overflow-hidden">
            <div className="p-5 flex justify-between">
              <h2 className="text-sm font-semibold mb-0">
                Recently updated shipments
              </h2>
              <Link href="/shipments" className="text-blue-600 text-[11px]">
                View all shipments →
              </Link>
            </div>
            <ShipmentTable rows={d.recent} />
          </section>
        </>
      )}
    </>
  );
}
function ShipmentTable({
  rows,
  selected = [],
  toggle,
}: {
  rows: Row[];
  selected?: string[];
  toggle?: (id: string) => void;
}) {
  return !rows.length ? (
    <Empty text="No shipments match this view." />
  ) : (
    <div className="overflow-auto">
      <table className="w-full">
        <thead>
          <tr>
            {toggle && <th>Select</th>}
            <th>Tracking number / order</th>
            <th>Carrier / marketplace</th>
            <th>Status</th>
            <th>Latest checkpoint</th>
            <th>Transit / no movement</th>
            <th>Last updated</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              {toggle && (
                <td>
                  <input
                    type="checkbox"
                    aria-label={"Select " + s.number}
                    checked={selected.includes(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                </td>
              )}
              <td>
                <Link
                  href={"/shipments/" + s.id}
                  className="font-semibold text-blue-600"
                >
                  {s.number}
                </Link>
                <div className="text-[10px] text-slate-400 mt-1">
                  {s.orderId || "No order ID"}
                  {s.demo ? " · DEMO" : ""}
                </div>
              </td>
              <td>
                {s.carrier || "Auto detect"}
                <div className="text-[10px] text-slate-400 mt-1">
                  {s.marketplace} · {s.destination}
                </div>
              </td>
              <td>
                <Badge status={s.status} />
                {s.exceptions?.length > 0 && (
                  <div className="text-orange-600 text-[10px] mt-2">
                    {s.exceptions.length} open incident(s)
                  </div>
                )}
              </td>
              <td className="max-w-[230px]">
                <div className="truncate">
                  {s.latestDescription || "Waiting for tracking data"}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {s.latestLocation || "—"}
                </div>
              </td>
              <td>
                {days(s.shippedAt)}d / {days(s.lastEventAt ?? s.shippedAt)}d
              </td>
              <td className="text-slate-400 whitespace-nowrap">
                {date(s.lastSyncAt)}
                <div className="text-[9px] mt-1">Provider sync</div>
              </td>
              <td>
                <Link
                  href={"/shipments/" + s.id}
                  aria-label={"View " + s.number}
                >
                  <ArrowUpRight size={15} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Shipments() {
  const query = useSearchParams();
  const [p, setP] = useState(() => new URLSearchParams(query.toString())),
    [selected, setSelected] = useState<string[]>([]),
    [message, setMessage] = useState(""),
    [err, setErr] = useState("");
  const { data: d, error, reload } = useData("shipments?" + p.toString());
  const { data: filters, reload: reloadFilters } = useData("filters");
  function filter(k: string, v: string) {
    setP((prev) => {
      const n = new URLSearchParams(prev);
      v ? n.set(k, v) : n.delete(k);
      n.set("page", "1");
      return n;
    });
    setSelected([]);
  }
  async function bulk(action: string) {
    try {
      await api("shipments/bulk", {
        ids: selected,
        action,
        ...(action === "notes"
          ? { notes: prompt("Notes for selected shipments") ?? "" }
          : {}),
      });
      setMessage("Bulk action saved. The worker will process queued work.");
      setSelected([]);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <>
      <Title
        title="All shipments"
        description="Search, organize, and monitor every delivery in one place."
      >
        <Button variant="outline" asChild>
          <a href={"/api/export?" + p.toString()}>
            <Download size={14} />
            CSV
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={"/api/export?" + p.toString() + "&format=xlsx"}>XLSX</a>
        </Button>
        <Button asChild>
          <Link href="/imports">
            <Plus size={14} />
            Import
          </Link>
        </Button>
      </Title>
      <ErrorBox error={error || err} />
      {message && (
        <p
          role="status"
          className="text-sm text-blue-700 bg-blue-50 p-3 rounded-lg"
        >
          {message}
        </p>
      )}
      <div className="panel p-4 mb-5">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search
              size={15}
              className="absolute left-3 top-3 text-slate-400"
            />
            <input
              className="w-full pl-9 text-xs"
              aria-label="Search shipments"
              placeholder="Search tracking number or order ID…"
              value={p.get("q") ?? ""}
              onChange={(e) => filter("q", e.target.value)}
            />
          </div>
          <select
            aria-label="Status"
            className="text-xs"
            value={p.get("status") ?? ""}
            onChange={(e) => filter("status", e.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
          <select
            aria-label="Carrier"
            className="text-xs"
            value={p.get("carrier") ?? ""}
            onChange={(e) => filter("carrier", e.target.value)}
          >
            <option value="">All carriers</option>
            {d?.carriers
              .filter((c: Row) => c.carrier)
              .map((c: Row) => (
                <option key={c.carrier}>{c.carrier}</option>
              ))}
          </select>
          <select
            aria-label="Marketplace"
            className="text-xs"
            value={p.get("marketplace") ?? ""}
            onChange={(e) => filter("marketplace", e.target.value)}
          >
            <option value="">All marketplaces</option>
            <option>Amazon US</option>
            <option>Amazon CA</option>
          </select>
          <select
            aria-label="Country"
            className="text-xs"
            value={p.get("country") ?? ""}
            onChange={(e) => filter("country", e.target.value)}
          >
            <option value="">All countries</option>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-3 mt-3">
          <label className="field">
            Imported from
            <input
              type="date"
              value={p.get("from") ?? ""}
              onChange={(e) => filter("from", e.target.value)}
            />
          </label>
          <label className="field">
            Through
            <input
              type="date"
              value={p.get("to") ?? ""}
              onChange={(e) => filter("to", e.target.value)}
            />
          </label>
          <select
            aria-label="Sort"
            className="text-xs h-10"
            value={p.get("sort") ?? "createdAt"}
            onChange={(e) => filter("sort", e.target.value)}
          >
            <option value="createdAt">Newest imports</option>
            <option value="number">Tracking number</option>
            <option value="lastEventAt">Latest checkpoint</option>
            <option value="shippedAt">Ship date</option>
            <option value="status">Status</option>
          </select>
          <select
            aria-label="Sort direction"
            className="text-xs h-10"
            value={p.get("direction") ?? "desc"}
            onChange={(e) => filter("direction", e.target.value)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
          <label className="text-xs p-2">
            <input
              type="checkbox"
              checked={p.get("delayed") === "true"}
              onChange={(e) =>
                filter("delayed", e.target.checked ? "true" : "")
              }
            />{" "}
            Delayed only
          </label>
          <label className="text-xs p-2">
            <input
              type="checkbox"
              checked={p.get("issues") === "true"}
              onChange={(e) => filter("issues", e.target.checked ? "true" : "")}
            />{" "}
            Action required
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const name = prompt("Name this filter");
              if (!name) return;
              try {
                await api("filters", { name, query: Object.fromEntries(p) });
                reloadFilters();
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            Save view
          </Button>
          {filters?.length > 0 && (
            <select
              aria-label="Saved views"
              className="text-xs"
              onChange={(e) => {
                const f = filters.find((x: Row) => x.id === e.target.value);
                if (f) setP(new URLSearchParams(f.query));
              }}
            >
              <option>Saved views</option>
              {filters.map((f: Row) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <button
            className="text-xs text-blue-600"
            onClick={() => setP(new URLSearchParams())}
          >
            Clear
          </button>
        </div>
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-xs">{selected.length} selected</span>
          <Button variant="outline" size="sm" onClick={() => bulk("retry")}>
            Retry registration
          </Button>
          <Button variant="outline" size="sm" onClick={() => bulk("reconcile")}>
            Queue recovery sync
          </Button>
          <Button variant="outline" size="sm" onClick={() => bulk("notes")}>
            Update notes
          </Button>
        </div>
      )}
      {!d ? (
        <Loading />
      ) : (
        <section className="panel overflow-hidden">
          <div className="p-4 text-xs text-slate-500 flex gap-4">
            <span>{d.total.toLocaleString()} shipments</span>
            <button
              className="text-blue-600"
              onClick={() =>
                setSelected(
                  selected.length === d.rows.length
                    ? []
                    : d.rows.map((s: Row) => s.id),
                )
              }
            >
              Select page
            </button>
          </div>
          <ShipmentTable
            rows={d.rows}
            selected={selected}
            toggle={(id) =>
              setSelected((prev) =>
                prev.includes(id)
                  ? prev.filter((x) => x !== id)
                  : [...prev, id],
              )
            }
          />
          <div className="flex items-center justify-between p-4 text-xs text-slate-400">
            <span>
              Page {d.page} of {Math.max(1, Math.ceil(d.total / 25))}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={d.page === 1}
                onClick={() =>
                  setP((prev) => {
                    const n = new URLSearchParams(prev);
                    n.set("page", String(d.page - 1));
                    return n;
                  })
                }
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={d.page * 25 >= d.total}
                onClick={() =>
                  setP((prev) => {
                    const n = new URLSearchParams(prev);
                    n.set("page", String(d.page + 1));
                    return n;
                  })
                }
              >
                Next
              </Button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
function Imports() {
  const [preview, setPreview] = useState<Row | null>(null),
    [mapping, setMapping] = useState<Mapping>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Row | null>(null);
  return (
    <>
      <Title
        title="Import shipments"
        description="Upload once. Registration and tracking continue automatically."
      />
      <ErrorBox error={error} />
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {["Upload your file", "Map & review columns", "Confirm import"].map(
          (s, i) => (
            <div key={s} className="panel p-4 text-xs flex gap-3 items-center">
              <span className="rounded-full bg-blue-50 text-blue-600 w-7 h-7 inline-flex items-center justify-center font-bold">
                {i + 1}
              </span>
              {s}
            </div>
          ),
        )}
      </div>
      <section className="panel p-6 mb-5">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setResult(null);
            try {
              const data = await api(
                "imports/preview",
                new FormData(e.currentTarget),
              );
              setPreview(data);
              setMapping(data.mapping);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 text-center py-10">
            <FileSpreadsheet size={34} className="mx-auto mb-4 text-blue-500" />
            <h2 className="text-base font-semibold">
              Bring your shipments into focus
            </h2>
            <p className="text-xs text-slate-500">
              CSV, XLSX, or TXT · Up to 10,000 rows · 10 MB maximum
            </p>
            <input
              aria-label="Shipment file"
              name="file"
              type="file"
              accept=".csv,.xlsx,.txt"
              required
              className="text-xs max-w-full"
            />
            <div className="mt-5">
              <Button disabled={busy}>
                <Upload size={14} />
                {busy ? "Reading file…" : "Preview import"}
              </Button>
            </div>
          </div>
        </form>
        <p className="text-[11px] text-slate-400 mt-4 mb-0">
          A tracking-number-only list works too. Optional fields include order
          ID, carrier, marketplace, country, dates, and notes. Dates:
          YYYY-MM-DD.
        </p>
      </section>
      {preview && !result && (
        <section className="panel p-6">
          <h2 className="font-semibold text-base">
            Review {preview.total.toLocaleString()} rows
          </h2>
          <p className="text-xs text-slate-500">
            {preview.existing} existing tracking numbers detected. Matching
            records retain their full tracking history. Preview shows the first
            50 rows.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {fields.map((f) => (
              <label className="field" key={f}>
                {label(f)}
                {f === "trackingNumber" ? " *" : ""}
                <select
                  aria-label={"Map " + f}
                  value={mapping[f] ?? ""}
                  onChange={(e) =>
                    setMapping({ ...mapping, [f]: e.target.value })
                  }
                >
                  <option value="">Not mapped</option>
                  {preview.headers.map((h: string) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="overflow-auto max-h-72 border rounded-lg">
            <table className="w-full">
              <thead>
                <tr>
                  {preview.headers.map((h: string) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r: Row, i: number) => (
                  <tr key={i}>
                    {preview.headers.map((h: string) => (
                      <td key={h}>{r[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 my-4">
            All rows are validated again using your final mapping. Invalid
            records remain in the import history with row-level errors; valid
            shipments are saved permanently.
          </p>
          <Button
            disabled={busy || !mapping.trackingNumber}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const d = await api("imports/confirm", {
                  id: preview.id,
                  mapping,
                });
                setResult(d);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Check size={15} />
            {busy ? "Importing…" : "Confirm & import"}
          </Button>
        </section>
      )}
      {result && (
        <section className="panel p-6">
          <CheckCircle2 className="text-emerald-500 mb-3" />
          <h2 className="font-semibold">Import complete</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-5">
            {Object.entries(result.result)
              .filter(([k]) => k !== "errors")
              .map(([k, v]) => (
                <div key={k}>
                  <b className="text-2xl">{String(v)}</b>
                  <p className="text-xs text-slate-500 capitalize mt-1">{k}</p>
                </div>
              ))}
          </div>
          <p className="text-xs text-slate-500">
            New shipments remain pending until the configured worker can
            register them with 17TRACK. Demo imports never contact the provider.
          </p>
          {result.result.errors?.length > 0 && (
            <details className="text-xs mb-4">
              <summary>
                View invalid row report ({result.result.errors.length})
              </summary>
              <ul className="space-y-2 mt-3">
                {result.result.errors.map((e: Row) => (
                  <li key={e.row}>
                    Row {e.row}: {e.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Button asChild>
            <Link href="/shipments">
              View shipments <ArrowRight size={14} />
            </Link>
          </Button>
        </section>
      )}
    </>
  );
}
function ExceptionActions({
  incident,
  reload,
}: {
  incident: Row;
  reload: () => void;
}) {
  const [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(action: string) {
    setBusy(true);
    try {
      await api("exceptions/" + incident.id, { action, note });
      setNote("");
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4">
      <ErrorBox error={error} />
      <input
        aria-label="Follow-up note"
        placeholder="Add a follow-up note…"
        className="text-xs w-full mb-3"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {incident.active && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !!incident.acknowledgedAt}
              onClick={() => act("acknowledge")}
            >
              {incident.acknowledgedAt ? "Acknowledged" : "Acknowledge"}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => act("resolve")}>
              Mark resolved
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !note.trim()}
          onClick={() => act("note")}
        >
          Save note
        </Button>
      </div>
    </div>
  );
}
function Detail({ id }: { id: string }) {
  const { data: s, error, reload } = useData("shipments/" + id);
  return (
    <>
      <Link
        href="/shipments"
        className="text-blue-600 text-xs inline-block mb-5"
      >
        ← Back to shipments
      </Link>
      <ErrorBox error={error} />
      {!s ? (
        <Loading />
      ) : (
        <>
          <Title
            title={s.number}
            description={`${s.orderId || "No order ID"} · ${s.marketplace} · ${s.demo ? "DEMO shipment" : "Live shipment"}`}
          >
            <Badge status={s.status} />
          </Title>
          <div className="grid lg:grid-cols-[1.5fr_1fr] gap-5">
            <div>
              <section className="panel p-6 mb-5">
                <h2 className="text-sm font-semibold mb-5">
                  Shipment information
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                  {[
                    ["Order ID", s.orderId],
                    ["Carrier", s.carrier || "Auto detect"],
                    ["Origin", s.origin],
                    ["Destination", s.destination],
                    ["Shipped", date(s.shippedAt)],
                    ["Expected", date(s.expectedAt)],
                    ["Days in transit", days(s.shippedAt)],
                    [
                      "Days without movement",
                      days(s.lastEventAt ?? s.shippedAt),
                    ],
                    ["Last provider update", time(s.lastSyncAt)],
                    ["Customer", s.customerName],
                    ["Carrier code", s.carrierCode],
                    ["Registered", date(s.registeredAt)],
                  ].map(([k, v]) => (
                    <div key={String(k)}>
                      <p className="text-[10px] text-slate-400 mb-1">{k}</p>
                      <div className="text-xs font-medium break-words">
                        {v ?? "—"}
                      </div>
                    </div>
                  ))}
                </div>
                {s.notes && (
                  <p className="mt-5 text-xs text-slate-500">
                    Notes: {s.notes}
                  </p>
                )}
                {s.registrationError && (
                  <p className="mt-4 bg-red-50 text-red-700 p-3 rounded text-xs">
                    {s.registrationError}
                  </p>
                )}
              </section>
              <section className="panel p-6">
                <h2 className="text-sm font-semibold mb-6">
                  Tracking timeline{" "}
                  <span className="text-slate-400 font-normal text-xs">
                    · Oldest to newest
                  </span>
                </h2>
                {!s.events.length ? (
                  <Empty text="No carrier checkpoints recorded yet." />
                ) : (
                  <ol className="ml-2">
                    {s.events.map((e: Row, i: number) => (
                      <li
                        key={e.id}
                        className={`relative border-l-2 ${i === s.events.length - 1 ? "border-blue-200" : "border-slate-100"} pl-6 pb-7`}
                      >
                        <span
                          className={`absolute -left-[6px] top-1 w-2.5 h-2.5 rounded-full ${i === s.events.length - 1 ? "bg-blue-500" : "bg-slate-300"}`}
                        />
                        <p className="text-xs font-medium mb-1">
                          {e.description}
                        </p>
                        {e.originalDescription !== e.description && (
                          <p className="text-xs text-slate-500 mb-2">
                            Original: {e.originalDescription}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                          <MapPin size={10} />
                          {e.location || "Location unavailable"} ·{" "}
                          {e.carrierSource}
                        </p>
                        <time className="text-[10px] text-slate-400">
                          {time(e.occurredAt)} · {e.stage}
                        </time>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
            <div>
              <section className="panel p-5 mb-5">
                <h2 className="text-sm font-semibold">Delivery exceptions</h2>
                {!s.exceptions.length ? (
                  <Empty text="No incidents recorded." />
                ) : (
                  s.exceptions.map((e: Row) => (
                    <div
                      key={e.id}
                      className="border-t border-slate-100 pt-5 mt-5"
                    >
                      <div className="flex justify-between">
                        <Priority n={e.priority} />
                        <span className="text-[10px] text-slate-400">
                          {e.active ? "Open" : "Resolved"}
                        </span>
                      </div>
                      <h3 className="text-xs font-semibold mt-3 mb-1">
                        {e.title}
                      </h3>
                      <p className="text-[10px] text-slate-400">
                        Detected {time(e.createdAt)}
                      </p>
                      <ExceptionActions incident={e} reload={reload} />
                      {e.followUps.length > 0 && (
                        <details className="text-xs text-slate-500 mt-4">
                          <summary>
                            Follow-up history ({e.followUps.length})
                          </summary>
                          {e.followUps.map((f: Row) => (
                            <p key={f.id} className="mt-3 mb-0">
                              {time(f.createdAt)} · {f.action}
                              <br />
                              {f.note}
                              <br />
                              <span className="text-[10px]">{f.actor}</span>
                            </p>
                          ))}
                        </details>
                      )}
                    </div>
                  ))
                )}
              </section>
              <section className="panel p-5">
                <h2 className="text-sm font-semibold">Registration history</h2>
                {!s.attempts.length ? (
                  <p className="text-xs text-slate-400">No API attempts yet.</p>
                ) : (
                  s.attempts.map((a: Row) => (
                    <div key={a.id} className="text-xs border-t py-3">
                      <b>{a.outcome}</b>
                      <p className="text-slate-400 mt-1 mb-0">
                        {time(a.createdAt)}
                      </p>
                    </div>
                  ))
                )}
                <Button
                  className="mt-3"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await api("shipments/bulk", {
                        ids: [id],
                        action: "retry",
                      });
                      reload();
                    } catch (e) {
                      alert((e as Error).message);
                    }
                  }}
                >
                  <RefreshCw size={12} />
                  Retry pending registration
                </Button>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
function ActionRequired() {
  const [history, setHistory] = useState(false);
  const {
    data: rows,
    error,
    reload,
  } = useData("exceptions?history=" + history);
  return (
    <>
      <Title
        title="Action required"
        description="Delivery incidents ordered by priority. Keep every follow-up in one place."
      >
        <Button variant="outline" onClick={() => setHistory(!history)}>
          {history ? "Show open only" : "Include history"}
        </Button>
      </Title>
      <ErrorBox error={error} />
      {!rows ? (
        <Loading />
      ) : !rows.length ? (
        <div className="panel">
          <Empty text="No open delivery incidents." />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {rows.map((e: Row) => (
            <section key={e.id} className="panel p-5">
              <div className="flex justify-between items-center mb-4">
                <Priority n={e.priority} />
                <span className="text-[10px] text-slate-400">
                  {e.active ? "Open" : "Resolved"}
                </span>
              </div>
              <Link
                className="text-sm text-blue-600 font-semibold"
                href={"/shipments/" + e.shipmentId}
              >
                {e.shipment.number}
              </Link>
              <p className="text-xs font-medium mt-2 mb-2">{e.title}</p>
              <p className="text-[10px] text-slate-400">
                {e.shipment.marketplace} · {date(e.createdAt)}
              </p>
              <ExceptionActions incident={e} reload={reload} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
function Notifications() {
  const { data: rows, error, reload } = useData("notifications");
  return (
    <>
      <Title
        title="Notifications"
        description="A complete history of alerts and email delivery outcomes."
      />
      <ErrorBox error={error} />
      <section className="panel">
        {!rows ? (
          <Loading />
        ) : !rows.length ? (
          <Empty text="No notifications yet." />
        ) : (
          rows.map((n: Row) => (
            <article
              key={n.id}
              className="p-5 border-b border-slate-100 flex gap-4"
            >
              <div className="p-2 rounded-lg bg-blue-50 text-blue-500 self-start">
                <TriangleAlert size={17} />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap gap-3 items-center">
                  <h2 className="text-sm font-semibold mb-0">{n.title}</h2>
                  <Priority n={n.priority} />
                  {!n.readAt && (
                    <span className="text-[9px] text-blue-600">NEW</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2 mb-2 whitespace-pre-line">
                  {n.body}
                </p>
                <p className="text-[10px] text-slate-400 mb-0">
                  {time(n.createdAt)} · Email: {n.emailState}
                  {n.emailError ? " · " + n.emailError : ""}
                </p>
              </div>
              {!n.readAt && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await api("notifications/" + n.id, {});
                    reload();
                  }}
                >
                  Mark read
                </Button>
              )}
            </article>
          ))
        )}
      </section>
    </>
  );
}
function Settings() {
  const { data: d, error, reload } = useData("settings");
  const [settings, setSettings] = useState<Row | null>(null),
    [message, setMessage] = useState(""),
    [err, setErr] = useState("");
  useEffect(() => {
    if (d) setSettings(d.settings);
  }, [d]);
  return (
    <>
      <Title
        title="Settings"
        description="Configure tracking rules, administrator alerts, and your account."
      />
      <ErrorBox error={error || err} />
      {message && (
        <p
          role="status"
          className="text-xs p-3 rounded-lg bg-blue-50 text-blue-700"
        >
          {message}
        </p>
      )}
      {!d || !settings ? (
        <Loading />
      ) : (
        <div className="grid xl:grid-cols-[1fr_320px] gap-5">
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("settings", settings);
                setMessage(
                  "Settings saved. Background checks use these thresholds on their next run.",
                );
                reload();
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            <section className="panel p-6">
              <h2 className="text-sm font-semibold">
                Tracking & delivery rules
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                Evaluated automatically every 15 minutes, including when no new
                scan arrives.
              </p>
              <div className="grid sm:grid-cols-2 gap-5">
                {[
                  ["noMovementWarning", "No movement · warning (days)"],
                  ["noMovementHigh", "No movement · high priority (days)"],
                  ["transitWarning", "In transit · warning (days)"],
                  ["transitHigh", "In transit · high priority (days)"],
                  ["monthlyAllowance", "Monthly registration allowance"],
                  ["dailyHourUTC", "Daily summary hour (UTC)"],
                ].map(([k, title]) => (
                  <label key={k} className="field">
                    {title}
                    <input
                      type="number"
                      required
                      min={k === "dailyHourUTC" ? 0 : 1}
                      max={k === "dailyHourUTC" ? 23 : undefined}
                      value={settings[k]}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          [k]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
                <label className="field">
                  Default marketplace
                  <select
                    value={settings.defaultMarketplace}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        defaultMarketplace: e.target.value,
                      })
                    }
                  >
                    <option>Amazon US</option>
                    <option>Amazon CA</option>
                  </select>
                </label>
              </div>
            </section>
            <section className="panel p-6">
              <h2 className="text-sm font-semibold">
                Notification preferences
              </h2>
              <label className="field mb-4">
                Recipient emails (comma separated)
                <input
                  aria-label="Recipient emails"
                  value={settings.recipients.join(", ")}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      recipients: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label className="text-xs flex gap-2 items-center mb-5">
                <input
                  type="checkbox"
                  checked={settings.immediateUrgent}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      immediateUrgent: e.target.checked,
                    })
                  }
                />
                Send urgent alerts by email (next worker cycle)
              </label>
              <label className="field mb-5">
                Default carrier detection
                <select
                  value={settings.carrierDetection}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      carrierDetection: e.target.value,
                    })
                  }
                >
                  <option value="auto">Automatic provider detection</option>
                  <option value="require-code">
                    Require an official carrier code
                  </option>
                </select>
              </label>
              <p className="text-xs text-slate-500">
                Alert categories & priority overrides
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  "delivery_failed",
                  "pickup",
                  "customs",
                  "returned",
                  "carrier_exception",
                  "address",
                  "lost",
                  "damaged",
                  "no_movement",
                  "long_transit",
                  "deadline",
                  "not_found",
                  "registration",
                ].map((k) => (
                  <label className="text-xs text-slate-600 flex gap-2" key={k}>
                    <input
                      type="checkbox"
                      checked={!settings.disabledCategories.includes(k)}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          disabledCategories: e.target.checked
                            ? settings.disabledCategories.filter(
                                (x: string) => x !== k,
                              )
                            : [...settings.disabledCategories, k],
                        })
                      }
                    />
                    {k.replaceAll("_", " ")}
                    <select
                      aria-label={"Priority for " + k}
                      className="text-[10px] ml-auto py-0"
                      value={settings.priorityOverrides?.[k] ?? ""}
                      onChange={(e) => {
                        const next = { ...(settings.priorityOverrides ?? {}) };
                        if (e.target.value) next[k] = Number(e.target.value);
                        else delete next[k];
                        setSettings({ ...settings, priorityOverrides: next });
                      }}
                    >
                      <option value="">Rule default</option>
                      <option value="1">Warning</option>
                      <option value="2">High</option>
                      <option value="3">Urgent</option>
                    </select>
                  </label>
                ))}
              </div>
            </section>
            <Button type="submit">Save settings</Button>
          </form>
          <div>
            <section className="panel p-5 mb-5">
              <h2 className="text-sm font-semibold">17TRACK connection</h2>
              <div className="text-xs space-y-4 text-slate-500">
                <p>
                  API key:{" "}
                  <b className="text-slate-700">
                    {d.provider.configured
                      ? "•••••••• (configured)"
                      : "Not configured"}
                  </b>
                </p>
                <p>
                  Contract:{" "}
                  <b className="text-slate-700">
                    {d.provider.verified
                      ? "Marked verified"
                      : "Awaiting official documentation verification"}
                  </b>
                </p>
                <p>Adapter: {d.provider.version}</p>
                <p>
                  Live requests: {d.provider.ready ? "Enabled" : "Disabled"}
                </p>
                <p>Last webhook: {time(d.lastWebhook)}</p>
                <p>Worker heartbeat: {time(d.workerHeartbeat)}</p>
                <p>
                  Mail transport:{" "}
                  {d.emailConfigured ? "Configured" : "Not configured"}
                </p>
                <p className="leading-5">
                  Set credentials securely in server environment variables. They
                  are never stored in the browser or returned by this page.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const r = await api("provider/test", {});
                      setMessage(r.message);
                    } catch (e) {
                      setErr((e as Error).message);
                    }
                  }}
                >
                  Check configuration
                </Button>
              </div>
            </section>
            <section className="panel p-5">
              <h2 className="text-sm font-semibold">Administrator account</h2>
              <p className="text-xs text-slate-400">{d.user.email}</p>
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    await api("account", Object.fromEntries(f));
                    location.href = "/login";
                  } catch (e) {
                    setErr((e as Error).message);
                  }
                }}
              >
                <label className="field">
                  Name
                  <input name="name" defaultValue={d.user.name} required />
                </label>
                <label className="field">
                  Current password
                  <input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label className="field">
                  New password
                  <input
                    name="newPassword"
                    type="password"
                    minLength={14}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <Button size="sm" variant="outline">
                  Change password & sign out
                </Button>
              </form>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
function Usage() {
  const { data: d, error, reload } = useData("usage");
  const [err, setErr] = useState("");
  return (
    <>
      <Title
        title="API & activity"
        description="Measured registration usage, import history, and operational diagnostics."
      />
      <ErrorBox error={error || err} />
      {!d ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {[
              ["Attempts this month", d.monthly],
              ["Estimated monthly pace", d.estimatedMonthly],
              ["Monthly allowance", d.settings.monthlyAllowance],
              ["Provider credits", "Unavailable"],
            ].map(([k, v]) => (
              <div key={String(k)} className="panel p-5">
                <p className="text-xs text-slate-500 mb-3">{k}</p>
                <b className="text-2xl">{v}</b>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mb-5">
            Usage is measured locally from real API attempts; it is not the
            provider billing balance. Retries count as attempts. Monthly pace
            projects attempts so far over 30 days.
          </p>
          <div className="flex flex-wrap gap-3 mb-5">
            {d.counts.map((c: Row) => (
              <span className="panel px-4 py-3 text-xs" key={c.outcome}>
                {c.outcome}: <b>{c._count}</b>
              </span>
            ))}
          </div>
          <section className="panel p-5 mb-5">
            <h2 className="text-sm font-semibold">Import history</h2>
            {!d.imports.length ? (
              <Empty />
            ) : (
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>State</th>
                      <th>Created / duplicates / invalid</th>
                      <th>Imported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.imports.map((i: Row) => (
                      <tr key={i.id}>
                        <td>{i.filename}</td>
                        <td>{i.state}</td>
                        <td>
                          {i.result
                            ? `${i.result.created} / ${i.result.duplicates} / ${i.result.invalid}`
                            : "Preview only"}
                        </td>
                        <td>{time(i.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel p-5 mb-5">
            <h2 className="text-sm font-semibold">Webhook inbox</h2>
            <p className="text-xs text-slate-400">
              Verified payloads are access-restricted and retained for 30 days
              after processing.
            </p>
            {!d.webhooks.length ? (
              <Empty text="No verified webhooks received." />
            ) : (
              d.webhooks.map((w: Row) => (
                <div
                  key={w.id}
                  className="border-t py-3 flex gap-3 items-center text-xs"
                >
                  <span className="flex-1 break-all">
                    {w.id.slice(0, 16)}… · {w.state} · {time(w.createdAt)}
                    <span className="text-red-600 block">{w.error}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await api("webhooks/replay", { id: w.id });
                        reload();
                      } catch (e) {
                        setErr((e as Error).message);
                      }
                    }}
                  >
                    Replay
                  </Button>
                </div>
              ))
            )}
          </section>
          <section className="panel p-5 mb-5">
            <h2 className="text-sm font-semibold">Failed background jobs</h2>
            {!d.jobs.length ? (
              <Empty text="No failed jobs retained." />
            ) : (
              d.jobs.map((j: Row) => (
                <div key={j.id} className="border-t py-3 text-xs">
                  {j.name} · {j.state} · {j.retrycount} retries ·{" "}
                  {time(j.createdon)}
                </div>
              ))
            )}
          </section>
          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Audit log</h2>
            {!d.logs.length ? (
              <Empty />
            ) : (
              d.logs.map((l: Row) => (
                <div
                  key={l.id}
                  className="flex justify-between border-t py-3 gap-3 text-xs"
                >
                  <span>
                    {l.action}
                    <span className="text-slate-400 ml-3">{l.actor}</span>
                  </span>
                  <time className="text-slate-400">{time(l.createdAt)}</time>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </>
  );
}
export function Workspace({ route }: { route: string[] }) {
  switch (route[0]) {
    case "dashboard":
      return <Dashboard />;
    case "shipments":
      return route[1] ? <Detail id={route[1]} /> : <Shipments />;
    case "imports":
      return <Imports />;
    case "action-required":
      return <ActionRequired />;
    case "notifications":
      return <Notifications />;
    case "settings":
      return <Settings />;
    case "usage":
      return <Usage />;
    default:
      return <Empty text="Page not found." />;
  }
}
