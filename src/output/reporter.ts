import type { Finding } from "../types.js";

export function printFindings(items: Finding[]): number {
  for (const item of items) console.log(`${item.level.padEnd(4)}  ${item.title}\n      ${item.detail}`);
  return items.some((item) => item.level === "FAIL") ? 1 : 0;
}

export function printResult(code: number): void {
  console.log(`\nResult: ${code === 0 ? "SAFE" : "BLOCKED"}`);
}
