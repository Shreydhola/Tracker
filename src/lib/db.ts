import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const g = globalThis as unknown as { prisma?: PrismaClient };
let client: PrismaClient | undefined;
function getClient() {
  return (client ??= g.prisma ??=
    new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }));
}
export const db = new Proxy({} as PrismaClient, {
  get(_target, key) {
    const c = getClient();
    const value = Reflect.get(c, key);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
