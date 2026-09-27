/* The real backend unpacks the archive itself. The mock only needs the names of
   the files inside, so that the batch screen lists what was really uploaded
   instead of inventing file names. Reads the zip central directory; no
   decompression and no dependency. */

const EOCD = 0x06054b50
const ENTRY = 0x02014b50

/* Windows archivers still write Cyrillic names in cp866 unless bit 11 says the
   name is UTF-8. */
const decode = (bytes: Uint8Array, utf8: boolean) =>
  new TextDecoder(utf8 ? 'utf-8' : 'ibm866').decode(bytes)

export function zipEntries(buffer: ArrayBuffer): string[] {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  /* The end-of-central-directory record sits at the tail, after an optional
     comment of up to 64 KB. */
  let eocd = -1
  for (let at = buffer.byteLength - 22; at >= 0 && at > buffer.byteLength - 65_558; at -= 1) {
    if (view.getUint32(at, true) === EOCD) {
      eocd = at
      break
    }
  }
  if (eocd < 0) return []

  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  const names: string[] = []

  for (let index = 0; index < count; index += 1) {
    if (at + 46 > buffer.byteLength || view.getUint32(at, true) !== ENTRY) break

    const flags = view.getUint16(at + 8, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const name = decode(bytes.subarray(at + 46, at + 46 + nameLength), (flags & 0x800) !== 0)

    /* directories and the junk macOS puts into archives */
    if (!name.endsWith('/') && !name.includes('__MACOSX') && !name.startsWith('.')) {
      names.push(name.split('/').pop() as string)
    }

    at += 46 + nameLength + extraLength + commentLength
  }

  return names
}
