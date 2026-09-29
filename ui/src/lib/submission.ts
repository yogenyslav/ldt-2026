const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const encode = (value: bigint, length: number): string => {
  let result = ''
  for (let i = 0; i < length; i += 1) {
    result = ULID_ALPHABET[Number(value & 31n)] + result
    value >>= 5n
  }
  return result
}

/* ULID: 48 бит времени и 80 случайных битов в алфавите Crockford Base32. */
export const newSubmissionId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  let random = 0n
  for (const byte of bytes) random = (random << 8n) | BigInt(byte)

  return encode(BigInt(Date.now()), 10) + encode(random, 16)
}
