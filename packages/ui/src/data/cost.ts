/**
 * Capacity cost model. Fabric capacity is billed per capacity unit per hour, so the cost of a
 * capacity follows its SKU, not (yet) its usage: splitting the bill across workspaces needs
 * per-operation CU, which arrives with operation events. These helpers give the honest
 * capacity-level number now, and the per-workspace split lights up later.
 *
 * Rates are the list pay-as-you-go price and are editable here. Regional pricing and reserved
 * (1-year / 3-year) commitments are cheaper; treat these as an estimate, not an invoice.
 */

/** List pay-as-you-go price for a Fabric capacity unit, USD per CU-hour. */
export const CU_HOUR_USD = 0.18;

/** Capacity units per F SKU. Anything matching F<number> is also understood. */
export const SKU_CU: Record<string, number> = {
  F2: 2, F4: 4, F8: 8, F16: 16, F32: 32, F64: 64, F128: 128,
  F256: 256, F512: 512, F1024: 1024, F2048: 2048,
};

export function skuCapacityUnits(sku: string): number | undefined {
  const key = sku.trim().toUpperCase();
  if (SKU_CU[key] !== undefined) return SKU_CU[key];
  const m = /^F(\d+)$/.exec(key);
  return m ? Number(m[1]) : undefined;
}

export function hourlyUsd(sku: string): number | undefined {
  const cu = skuCapacityUnits(sku);
  return cu === undefined ? undefined : cu * CU_HOUR_USD;
}

/** Hours elapsed in the current UTC month up to `now`. */
export function hoursElapsedThisMonth(now: Date = new Date()): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return (now.getTime() - start) / 3_600_000;
}

/** Total hours in the current UTC month. */
export function hoursInMonth(now: Date = new Date()): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return (next - start) / 3_600_000;
}

export interface CapacityCost {
  /** USD per hour at the SKU's list rate. */
  hourlyUsd: number;
  /** Cost so far this month, assuming the capacity has been running. */
  mtdUsd: number;
  /** Cost for the whole month at this SKU. */
  projectedMonthUsd: number;
}

export function capacityCost(sku: string, now: Date = new Date()): CapacityCost | undefined {
  const rate = hourlyUsd(sku);
  if (rate === undefined) return undefined;
  return { hourlyUsd: rate, mtdUsd: rate * hoursElapsedThisMonth(now), projectedMonthUsd: rate * hoursInMonth(now) };
}

/** Compact money, for KPI tiles: $8.4k, $512, $11.52. */
export function usd(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  if (n >= 10_000) return `$${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

/** Full money, for tables and totals: $8,240. */
export function usdFull(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Turn rows into a CSV string, quoting cells that need it. */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

/** Download `rows` as a CSV file. Runs in the viewer's browser; nothing leaves the page. */
export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
