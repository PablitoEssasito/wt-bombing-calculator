/**
 * The game's `.clog` files are its text log XOR'd with a repeating key. The key
 * isn't published and changes nothing about the text underneath, so it's
 * recovered from the log itself: a log is mostly spaces and plain ASCII, so at
 * each position in the key the most common byte is almost always a space.
 */
export const KEY_LENGTH = 128;

/** Only the head is needed to find the key; a log runs to tens of megabytes. */
const SAMPLE = 4_000_000;

export function recoverKey(data: Uint8Array, length = KEY_LENGTH): Uint8Array {
  const key = new Uint8Array(length);
  const end = Math.min(data.length, SAMPLE);
  for (let i = 0; i < length; i++) {
    const counts = new Uint32Array(256);
    for (let j = i; j < end; j += length) counts[data[j]]++;
    let top = 0;
    for (let byte = 1; byte < 256; byte++) if (counts[byte] > counts[top]) top = byte;
    key[i] = top ^ 0x20;
  }
  return key;
}

export function decode(data: Uint8Array, key: Uint8Array): string {
  const plain = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) plain[i] = data[i] ^ key[i % key.length];
  return new TextDecoder("utf-8").decode(plain);
}
