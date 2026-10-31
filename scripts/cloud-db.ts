/** Starts only the onboarding demo database. Production uses Docker Compose. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
const dockerEnv = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete dockerEnv[key];
const docker = (args: string[], quiet = false) =>
  execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env: dockerEnv,
    stdio: quiet ? "pipe" : "inherit",
  });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/tracker_demo" ||
    url.port !== "5432"
  )
    throw new Error(
      "Cloud helper only supports the existing local tracker_demo database. Use your deployment instructions for other databases.",
    );
  let exists = false;
  try {
    docker(
      [
        "container",
        "inspect",
        "--format",
        "{{.State.Status}}",
        "tracker-postgres",
      ],
      true,
    );
    exists = true;
  } catch {
    /* No managed demo container yet. */
  }
  if (exists) docker(["start", "tracker-postgres"]);
  else {
    if (!process.env.POSTGRES_PASSWORD)
      throw new Error(
        "Set POSTGRES_PASSWORD securely before creating the demo database",
      );
    docker([
      "run",
      "-d",
      "--name",
      "tracker-postgres",
      "--label",
      "parcelops.cloud=true",
      "--restart",
      "unless-stopped",
      "-p",
      "127.0.0.1:5432:5432",
      "-e",
      "POSTGRES_USER=tracker",
      "-e",
      "POSTGRES_DB=tracker_demo",
      "-e",
      "POSTGRES_PASSWORD",
      "-v",
      "tracker-pgdata:/var/lib/postgresql/data",
      "postgres:17-alpine",
    ]);
  }
  for (let i = 0; i < 60; i++) {
    try {
      docker(
        [
          "exec",
          "tracker-postgres",
          "pg_isready",
          "-U",
          "tracker",
          "-d",
          "tracker_demo",
        ],
        true,
      );
      console.log("Cloud PostgreSQL ready");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("PostgreSQL did not become ready within 30 seconds");
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
