import type { Finding } from "../types.js";

export function printFindings(items: Finding[], json = false): number {
  const code = items.some((item) => item.level === "FAIL") ? 1 : 0;
  if (json) {
    console.log(JSON.stringify({ result: code === 0 ? "SAFE" : "BLOCKED", findings: items }));
    return code;
  }
  for (const item of items) console.log(`${item.level.padEnd(4)}  ${item.title}\n      ${item.detail}`);
  return code;
}

export function printResult(code: number): void {
  console.log(`\nResult: ${code === 0 ? "SAFE" : "BLOCKED"}`);
}
