export type ContactTarget =
  | { kind: "telegram"; url: string }
  | { kind: "external"; url: string }
  | { kind: "invalid"; reason: "empty" | "bad_username" | "unsafe_url" };

const TELEGRAM_USER_RE = /^[A-Za-z0-9_]{5,32}$/;

export function resolveContactTarget(raw: string | null | undefined): ContactTarget {
  const value = (raw ?? "").trim();
  if (!value) return { kind: "invalid", reason: "empty" };

  if (value.startsWith("@")) {
    return usernameTarget(value.slice(1));
  }

  if (!value.includes("://") && TELEGRAM_USER_RE.test(value)) {
    return usernameTarget(value);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { kind: "invalid", reason: "unsafe_url" };
  }

  if (url.protocol !== "https:") {
    return { kind: "invalid", reason: "unsafe_url" };
  }

  if (url.hostname === "t.me" || url.hostname === "telegram.me") {
    return { kind: "telegram", url: url.toString() };
  }

  return { kind: "external", url: url.toString() };
}

function usernameTarget(username: string): ContactTarget {
  if (!TELEGRAM_USER_RE.test(username)) {
    return { kind: "invalid", reason: "bad_username" };
  }
  return { kind: "telegram", url: `https://t.me/${username}` };
}
