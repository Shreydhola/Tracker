// Bound XLSX expansion before the XLSX parser allocates workbook data. ZIP64 and
// encrypted archives are unnecessary for a 10 MB shipment import and rejected.
export function validateWorkbookZip(bytes: Buffer) {
  if (bytes.readUInt32LE(0) !== 0x04034b50)
    throw new Error("VALIDATION: Invalid XLSX archive");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("VALIDATION: Invalid XLSX directory");
  const count = bytes.readUInt16LE(end + 10),
    offset = bytes.readUInt32LE(end + 16);
  if (count > 1000 || count === 65535 || offset >= end)
    throw new Error("VALIDATION: XLSX archive is too complex");
  let cursor = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error("VALIDATION: Malformed XLSX entry");
    const flags = bytes.readUInt16LE(cursor + 8),
      compressed = bytes.readUInt32LE(cursor + 20),
      size = bytes.readUInt32LE(cursor + 24);
    const nameLen = bytes.readUInt16LE(cursor + 28),
      extra = bytes.readUInt16LE(cursor + 30),
      comment = bytes.readUInt16LE(cursor + 32);
    total += size;
    if (
      flags & 1 ||
      size > 20 * 1024 * 1024 ||
      total > 50 * 1024 * 1024 ||
      size / Math.max(1, compressed) > 1000
    )
      throw new Error("VALIDATION: XLSX expansion exceeds safe limits");
    cursor += 46 + nameLen + extra + comment;
    if (cursor > end) throw new Error("VALIDATION: Invalid XLSX entry size");
  }
}
