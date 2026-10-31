import "dotenv/config";
import { hash } from "bcryptjs";
import { db } from "../src/lib/db";
async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase(),
    password = process.env.ADMIN_PASSWORD;
  if (
    !email ||
    !password ||
    password.length < 14 ||
    Buffer.byteLength(password) > 72
  )
    throw new Error(
      "Set ADMIN_EMAIL and a unique ADMIN_PASSWORD of 14+ characters and at most 72 UTF-8 bytes",
    );
  if (await db.user.findUnique({ where: { email } })) {
    console.log("Administrator already exists; password unchanged");
    return;
  }
  await db.user.create({
    data: {
      email,
      name: "Administrator",
      passwordHash: await hash(password, 12),
    },
  });
  console.log("Administrator created");
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
