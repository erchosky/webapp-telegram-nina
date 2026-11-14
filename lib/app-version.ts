import "server-only";

export function appVersion() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || process.env.APP_VERSION || "0.10.0-beta";
}
