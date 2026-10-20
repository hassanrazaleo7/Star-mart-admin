// Runs once when the Next.js server boots: validates the environment so a
// misconfigured deployment fails immediately instead of at the first login.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./env");
  }
}
