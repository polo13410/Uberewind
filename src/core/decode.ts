/**
 * Bytes → text with tolerance for imperfect encodings.
 *
 * - UTF-8 (with or without BOM) is the normal case.
 * - UTF-16 is detected by its BOM.
 * - Invalid UTF-8 with *no* valid multi-byte sequence at all is most likely a
 *   Latin-1 / Windows-1252 file (e.g. re-saved in Excel): decode it as such.
 * - Otherwise we keep UTF-8 and let invalid bytes become U+FFFD, which are
 *   counted so the UI can warn the user.
 */

export interface DecodedText {
  text: string;
  encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';
  /** Number of U+FFFD replacement characters in the result. */
  replacementChars: number;
}

function countReplacement(s: string): number {
  let n = 0;
  for (let i = s.indexOf('�'); i !== -1; i = s.indexOf('�', i + 1)) n++;
  return n;
}

function tryDecode(label: string, bytes: Uint8Array, fatal: boolean): string | null {
  try {
    return new TextDecoder(label, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

export function decodeText(bytes: Uint8Array): DecodedText {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const text = tryDecode('utf-16le', bytes, false) ?? '';
    return { text, encoding: 'utf-16le', replacementChars: countReplacement(text) };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const text = tryDecode('utf-16be', bytes, false) ?? '';
    return { text, encoding: 'utf-16be', replacementChars: countReplacement(text) };
  }

  const strict = tryDecode('utf-8', bytes, true);
  if (strict != null) return { text: strict, encoding: 'utf-8', replacementChars: countReplacement(strict) };

  const lenient = tryDecode('utf-8', bytes, false) ?? '';
  // Any genuine non-ASCII character decoded from UTF-8? Then the file is UTF-8
  // with a few corrupt bytes: re-decoding as 1252 would garble the good ones.
  // eslint-disable-next-line no-control-regex
  const hasRealUtf8 = /[^\u0000-\u007f�]/.test(lenient);
  if (!hasRealUtf8) {
    const latin = tryDecode('windows-1252', bytes, false);
    if (latin != null) return { text: latin, encoding: 'windows-1252', replacementChars: countReplacement(latin) };
  }
  return { text: lenient, encoding: 'utf-8', replacementChars: countReplacement(lenient) };
}
