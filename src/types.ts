export type Policy = "fail" | "warn" | "require-check";

export type IdentityConfig = {
  name: string;
  email: string;
  githubUser: string;
  remote: string;
  sshHostAlias: string;
  policies: Record<string, Policy>;
};

export type Finding = {
  level: "PASS" | "WARN" | "FAIL";
  title: string;
  detail: string;
};

export type RemoteParts = {
  host: string;
  owner: string;
  repository: string;
};

export type CheckPhase = "commit" | "push" | "all";
