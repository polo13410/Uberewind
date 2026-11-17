import { describe, expect, it } from 'vitest';
import { decodeText } from '../../src/core/decode';

describe('decodeText', () => {
  it('decodes UTF-8 and strips the BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('a,b\nCécile,1')]);
    const r = decodeText(bytes);
    expect(r.encoding).toBe('utf-8');
    expect(r.text).toBe('a,b\nCécile,1');
    expect(r.replacementChars).toBe(0);
  });

  it('falls back to Windows-1252 for a pure Latin-1 file', () => {
    // "Cécile" in Latin-1: é = 0xE9 (invalid as UTF-8)
    const bytes = new Uint8Array([0x43, 0xe9, 0x63, 0x69, 0x6c, 0x65]);
    const r = decodeText(bytes);
    expect(r.encoding).toBe('windows-1252');
    expect(r.text).toBe('Cécile');
  });

  it('keeps UTF-8 and counts U+FFFD when the file mixes valid UTF-8 and broken bytes', () => {
    const good = new TextEncoder().encode('Zürich,');
    const bytes = new Uint8Array([...good, 0x43, 0xe9, 0x63]);
    const r = decodeText(bytes);
    expect(r.encoding).toBe('utf-8');
    expect(r.text.startsWith('Zürich,')).toBe(true);
    expect(r.replacementChars).toBe(1);
  });

  it('counts replacement characters already present in a valid UTF-8 file', () => {
    const r = decodeText(new TextEncoder().encode('Label\nC\uFFFDcile'));
    expect(r.replacementChars).toBe(1);
  });

  it('decodes UTF-16LE with BOM', () => {
    const s = 'a,b';
    const bytes = new Uint8Array(2 + s.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let i = 0; i < s.length; i++) bytes[2 + i * 2] = s.charCodeAt(i);
    expect(decodeText(bytes).text).toBe('a,b');
  });
});
