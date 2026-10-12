import { sniffMime } from './guard-profiles.service';

describe('sniffMime', () => {
  it('reconnaît PDF, PNG et JPEG par leurs premiers octets', () => {
    expect(sniffMime(Buffer.from('%PDF-1.7'))?.mime).toBe('application/pdf');
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))?.mime).toBe('image/png');
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
  });

  it('refuse un exécutable déguisé', () => {
    expect(sniffMime(Buffer.from('MZ\x90\x00 faux.pdf'))).toBeNull();
    expect(sniffMime(Buffer.from('<script>alert(1)</script>'))).toBeNull();
  });
});
