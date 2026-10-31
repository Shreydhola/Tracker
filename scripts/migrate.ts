// Use Prisma's npm-distributed WASM schema engine and official PostgreSQL
// adapter. No native download, alternate binary mirror, or verification bypass.
import "dotenv/config";
import { Pool } from "pg";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { dirname } from "node:path";
async function loadEngine() {
  const runtime = await import("@prisma/schema-engine-wasm/schema_engine_bg");
  const require = createRequire(resolve("package.json"));
  const bytes = await readFile(
    resolve(
      dirname(require.resolve("@prisma/schema-engine-wasm/schema_engine_bg")),
      "schema_engine_bg.wasm",
    ),
  );
  const instance = await WebAssembly.instantiate(bytes, {
    "./schema_engine_bg.js": runtime,
  });
  runtime.__wbg_set_wasm(instance.instance.exports);
  (instance.instance.exports.__wbindgen_start as () => void)();
  return runtime.SchemaEngine;
}
import { PrismaPg } from "@prisma/adapter-pg";
import { bindMigrationAwareSqlAdapterFactory } from "@prisma/driver-adapter-utils";
async function main() {
  const schemaPath = resolve("prisma/schema.prisma");
  const content = await readFile(schemaPath, "utf8");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = bindMigrationAwareSqlAdapterFactory(new PrismaPg(pool));
  const engine = await (
    await loadEngine()
  ).new({ datamodels: [[schemaPath, content]] }, () => {}, adapter);
  const filters = { externalTables: [], externalEnums: [] };
  try {
    const baseDir = resolve("prisma/migrations");
    if (process.argv.includes("--initial")) {
      const result = await engine.diff({
        from: { tag: "empty" },
        to: { tag: "schemaDatamodel", files: [{ path: schemaPath, content }] },
        script: true,
        exitCode: false,
        filters,
      });
      if (!result.stdout) throw new Error("No migration SQL returned");
      const dir = resolve(baseDir, "202610310001_initial");
      await mkdir(dir, { recursive: true });
      await writeFile(resolve(dir, "migration.sql"), result.stdout);
      await writeFile(
        resolve(baseDir, "migration_lock.toml"),
        'provider = "postgresql"\n',
      );
      console.log("Initial Prisma migration SQL generated");
      return;
    }
    const folders = (await readdir(baseDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    const migrationsList = {
      baseDir,
      lockfile: {
        path: "migration_lock.toml",
        content: await readFile(
          resolve(baseDir, "migration_lock.toml"),
          "utf8",
        ),
      },
      shadowDbInitScript: "",
      migrationDirectories: await Promise.all(
        folders.map(async (path) => ({
          path,
          migrationFile: {
            path: "migration.sql",
            content: {
              tag: "ok" as const,
              value: await readFile(
                resolve(baseDir, path, "migration.sql"),
                "utf8",
              ),
            },
          },
        })),
      ),
    };
    const result = await engine.applyMigrations({ migrationsList, filters });
    console.log(
      "Applied migrations:",
      result.appliedMigrationNames.length
        ? result.appliedMigrationNames.join(", ")
        : "none (up to date)",
    );
  } finally {
    engine.free();
    await pool.end();
  }
}
main().catch((e) => {
  console.error("Migration failed:", e);
  process.exitCode = 1;
});
