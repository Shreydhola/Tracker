// The Prisma CLI eagerly downloads the native schema engine, even for JS-only
// client generation. This pinned official generator path needs no native engine.
import { getGenerators } from "@prisma/internals";
import { PrismaClientJsGenerator } from "@prisma/client-generator-js";
async function main() {
  const generators = await getGenerators({
    schemaPath: "prisma/schema.prisma",
    registry: {
      "prisma-client-js": {
        type: "in-process",
        generator: new PrismaClientJsGenerator({
          cliCommand: "npm run db:generate",
          shouldResolvePrismaClient: true,
        }),
      },
    },
    skipDownload: true,
    cliCommand: "npm run db:generate",
  });
  try {
    for (const g of generators) await g.generate();
    console.log("Prisma JavaScript client generated from schema");
  } finally {
    for (const g of generators) g.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
