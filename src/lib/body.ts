export async function limitedBody(req: Request, max: number) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("VALIDATION: Empty request body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new Error("VALIDATION: Request body exceeds the allowed size");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function uploadForm(req: Request) {
  const bytes = await limitedBody(req, 11 * 1024 * 1024);
  return new Request(req.url, {
    method: "POST",
    headers: { "Content-Type": req.headers.get("content-type") ?? "" },
    body: bytes,
  }).formData();
}
