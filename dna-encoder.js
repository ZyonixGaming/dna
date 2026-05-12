// dna-encoder.global.js — non‑module version, attach to window

(function() {
  // Fixed schema
  const FIXED_LENGTHS = [10,13,13,15,11,8,11,8,11,11,13,15,13,11,11,13,15,11,11,16];
  const TOTAL_BASES = FIXED_LENGTHS.reduce((sum, len) => sum + 2*len, 0);

  const BASE_TO_BITS = { 'A': 0b00, 'C': 0b01, 'G': 0b10, 'T': 0b11 };
  const BITS_TO_BASE = ['A', 'C', 'G', 'T'];

  function bitsToBytes(bitsString) {
    const bytes = [];
    for (let i = 0; i < bitsString.length; i += 8) {
      let chunk = bitsString.substring(i, i + 8);
      while (chunk.length < 8) chunk += '0';
      bytes.push(parseInt(chunk, 2));
    }
    return new Uint8Array(bytes);
  }

  function uint8ToBase64url(buffer) {
    let binary = '';
    buffer.forEach(byte => binary += String.fromCharCode(byte));
    const base64 = btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64urlToUint8(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4 !== 0) str += '=';
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function bytesToBits(bytes) {
    let bits = '';
    for (let i = 0; i < bytes.length; i++) {
      bits += bytes[i].toString(2).padStart(8, '0');
    }
    return bits;
  }

  // Expose the two main functions globally
  window.encodeSequences = function(linesArray) {
    if (linesArray.length !== 40) throw new Error('Exactly 40 lines are required.');
    let bits = '';
    for (let i = 0; i < 40; i++) {
      const match = linesArray[i].match(/^(\d{2}):([ACGT]+)$/);
      if (!match) throw new Error('Invalid format at line ' + (i+1) + ': "' + linesArray[i] + '"');
      const num = parseInt(match[1], 10);
      const seq = match[2];
      if (num !== Math.floor(i/2)) throw new Error('Line numbers must be 00,00,…,19,19. Problem at line ' + (i+1));
      const expectedLen = FIXED_LENGTHS[num];
      if (seq.length !== expectedLen) throw new Error('Line ' + String(num).padStart(2,'0') + ' must have length ' + expectedLen + '. Got ' + seq.length + '.');
      for (const ch of seq) {
        bits += BASE_TO_BITS[ch].toString(2).padStart(2, '0');
      }
    }
    const pad = (8 - (bits.length % 8)) % 8;
    bits += '0'.repeat(pad);
    return uint8ToBase64url(bitsToBytes(bits));
  };

  window.decodeToLines = function(encodedStr) {
    const bytes = base64urlToUint8(encodedStr);
    let bits = bytesToBits(bytes);
    if (bits.length < TOTAL_BASES * 2) throw new Error('Link too short for fixed schema.');
    const seqBits = bits.substring(0, TOTAL_BASES * 2);
    const sequences = [];
    for (let i = 0; i < seqBits.length; i += 2) {
      sequences.push(BITS_TO_BASE[parseInt(seqBits.substring(i, i+2), 2)]);
    }
    const lines = [];
    let cursor = 0;
    for (let i = 0; i < 20; i++) {
      const len = FIXED_LENGTHS[i];
      const num = String(i).padStart(2, '0');
      lines.push(num + ':' + sequences.slice(cursor, cursor + len).join(''));
      cursor += len;
      lines.push(num + ':' + sequences.slice(cursor, cursor + len).join(''));
      cursor += len;
    }
    return lines;
  };
})();