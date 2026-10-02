// Market bars from a CSV file, for `gadgets run --bars`. Prices become integer cents by exact text
// arithmetic, never through a float, so a replay is reproducible to the cent.

import { readFile } from "node:fs/promises";

/** One price bar: epoch seconds, close in integer cents, volume. Oldest first in any series. */
export type Bar = { t: number; closeCents: number; volume: number };

/** Reads bars from the CSV file at `path`. */
export async function readBarsCsv(path: string): Promise<Bar[]> {
  return parseBarsCsv(await readFile(path, "utf8"));
}

/**
 * Parses CSV text with a header row naming a time column (`t` in epoch seconds, or `time`/`date` as
 * an ISO 8601 timestamp), a price column (`closeCents`, or `close` in units with at most two
 * decimals) and `volume`. Rows must be oldest first.
 */
export function parseBarsCsv(text: string): Bar[] {
  const rows = text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
  const header = (rows.shift() ?? "").split(",").map(cell => cell.trim());
  const column = (...names: string[]) => header.findIndex(cell => names.includes(cell));
  const [time, close, cents, volume] = [column("t", "time", "date"), column("close"), column("closeCents"), column("volume")];
  if (time < 0 || (close < 0 && cents < 0) || volume < 0) {
    throw new Error("Bars CSV needs a header with t (or time/date), close (or closeCents) and volume");
  }
  if (rows.length === 0) throw new Error("Bars CSV has no rows");

  const bars = rows.map((row, index) => {
    const cells = row.split(",").map(cell => cell.trim());
    const where = `Bars CSV row ${index + 2}`;
    return {
      t: parseTime(cells[time] ?? "", header[time]!, where),
      closeCents: cents >= 0 ? parseInteger(cells[cents] ?? "", `${where} closeCents`)
          : parsePriceCents(cells[close] ?? "", where),
      volume: parseInteger(cells[volume] ?? "", `${where} volume`),
    };
  });
  for (let i = 1; i < bars.length; i++) {
    if (bars[i]!.t <= bars[i - 1]!.t) throw new Error(`Bars CSV row ${i + 2} is not after the row before it`);
  }
  return bars;
}

function parseTime(cell: string, columnName: string, where: string): number {
  if (columnName === "t") return parseInteger(cell, `${where} t`);
  // Require an explicit offset or `Z`, or a plain date (which is UTC), so the result never depends
  // on this machine's time zone.
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.test(cell)) {
    throw new Error(`${where} time must be YYYY-MM-DD or an ISO timestamp with a zone`);
  }
  const millis = Date.parse(cell);
  if (Number.isNaN(millis)) throw new Error(`${where} time is not a date`);
  return Math.floor(millis / 1000);
}

function parsePriceCents(cell: string, where: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cell);
  if (!match) throw new Error(`${where} close must be a non-negative price with at most two decimals`);
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

function parseInteger(cell: string, what: string): number {
  if (!/^\d+$/.test(cell)) throw new Error(`${what} must be a non-negative integer`);
  return Number(cell);
}
