import type { RemoteParts } from "../types.js";

export function parseRemote(remote: string): RemoteParts {
  const scp = remote.match(/^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (scp) return { host: scp[1], owner: scp[2], repository: scp[3] };
  try {
    const url = new URL(remote);
    const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    return { host: url.hostname, owner: parts[0] ?? "", repository: parts[1] ?? "" };
  } catch {
    return { host: "", owner: "", repository: "" };
  }
}
