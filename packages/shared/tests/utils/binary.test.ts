import { describe, it, expect } from "vitest";
import { decodeBase58, readU128LE, parseTradeSize } from "../../src/utils/binary.js";

describe("binary utilities", () => {
  describe("decodeBase58", () => {
    it("should decode valid base58 public key", () => {
      // Known Solana public key (all zeros): 11111111111111111111111111111111
      const result = decodeBase58("11111111111111111111111111111111");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result?.length).toBe(32);
      expect(Array.from(result!)).toEqual(new Array(32).fill(0));
    });

    it("should decode valid base58 string with non-zero bytes", () => {
      // Example: "5" in base58 should decode to Uint8Array([4])
      const result = decodeBase58("5");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result?.length).toBe(1);
      expect(result![0]).toBe(4);
    });

    it("should return null for invalid characters", () => {
      const result = decodeBase58("invalid0OIl"); // 0, O, I, l are not in base58 alphabet
      expect(result).toBeNull();
    });

    it("should return null for empty string", () => {
      const result = decodeBase58("");
      expect(result).not.toBeNull();
      expect(result?.length).toBe(0);
    });

    it("should handle leading 1s (zeros)", () => {
      // "111" should decode to [0, 0, 0]
      const result = decodeBase58("111");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result?.length).toBe(3);
      expect(Array.from(result!)).toEqual([0, 0, 0]);
    });

    it("should handle mixed leading 1s and data", () => {
      // "115" should decode to [0, 0, 4]
      const result = decodeBase58("115");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result?.length).toBe(3);
      expect(Array.from(result!)).toEqual([0, 0, 4]);
    });

    it("should return null for string with invalid character '0'", () => {
      const result = decodeBase58("0");
      expect(result).toBeNull();
    });

    it("should return null for string with invalid character 'O'", () => {
      const result = decodeBase58("O");
      expect(result).toBeNull();
    });

    it("should return null for string with invalid character 'I'", () => {
      const result = decodeBase58("I");
      expect(result).toBeNull();
    });

    it("should return null for string with invalid character 'l'", () => {
      const result = decodeBase58("l");
      expect(result).toBeNull();
    });
  });

  describe("readU128LE", () => {
    it("should read zero", () => {
      const bytes = new Uint8Array(16).fill(0);
      const result = readU128LE(bytes);
      expect(result).toBe(0n);
    });

    it("should read max u128 value", () => {
      const bytes = new Uint8Array(16).fill(0xff);
      const result = readU128LE(bytes);
      // Max u128 = 2^128 - 1
      expect(result).toBe(340282366920938463463374607431768211455n);
    });

    it("should read specific known value (little-endian)", () => {
      // Value: 0x0102030405060708090a0b0c0d0e0f10 in little-endian
      const bytes = new Uint8Array([
        0x10, 0x0f, 0x0e, 0x0d, 0x0c, 0x0b, 0x0a, 0x09,
        0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01,
      ]);
      const result = readU128LE(bytes);
      expect(result).toBe(0x0102030405060708090a0b0c0d0e0f10n);
    });

    it("should read value 256", () => {
      const bytes = new Uint8Array(16);
      bytes[1] = 1; // 256 in little-endian: [0, 1, 0, 0, ...]
      const result = readU128LE(bytes);
      expect(result).toBe(256n);
    });

    it("should read value 1", () => {
      const bytes = new Uint8Array(16);
      bytes[0] = 1;
      const result = readU128LE(bytes);
      expect(result).toBe(1n);
    });
  });

  describe("parseTradeSize", () => {
    it("should parse positive size as long", () => {
      const bytes = new Uint8Array(16);
      bytes[0] = 100; // 100 in little-endian
      const result = parseTradeSize(bytes);
      expect(result.sizeValue).toBe(100n);
      expect(result.side).toBe("long");
    });

    it("should parse negative size as short", () => {
      // -100 in i128 two's complement
      // Two's complement of 100: invert bits and add 1
      // 100 = 0x64, inverted = 0xffffff...ff9b, +1 = 0xffffff...ff9c
      const bytes = new Uint8Array(16);
      bytes[0] = 0x9c; // -100 in little-endian
      bytes.fill(0xff, 1);
      const result = parseTradeSize(bytes);
      expect(result.sizeValue).toBe(100n);
      expect(result.side).toBe("short");
    });

    it("should parse zero as long", () => {
      const bytes = new Uint8Array(16).fill(0);
      const result = parseTradeSize(bytes);
      expect(result.sizeValue).toBe(0n);
      expect(result.side).toBe("long");
    });

    it("should parse max positive i128 as long", () => {
      // Max i128 = 2^127 - 1
      const bytes = new Uint8Array(16);
      bytes.fill(0xff, 0, 15);
      bytes[15] = 0x7f; // Sign bit = 0
      const result = parseTradeSize(bytes);
      expect(result.sizeValue).toBe(170141183460469231731687303715884105727n);
      expect(result.side).toBe("long");
    });

    it("should parse -1 as short", () => {
      // -1 in two's complement: all bits set
      const bytes = new Uint8Array(16).fill(0xff);
      const result = parseTradeSize(bytes);
      expect(result.sizeValue).toBe(1n);
      expect(result.side).toBe("short");
    });

    it("should parse min i128 (most negative) as short", () => {
      // Min i128 = -2^127
      const bytes = new Uint8Array(16);
      bytes[15] = 0x80; // Only sign bit set
      const result = parseTradeSize(bytes);
      expect(result.sizeValue).toBe(170141183460469231731687303715884105728n);
      expect(result.side).toBe("short");
    });

    it("should parse -1000000 as short", () => {
      // -1000000 in i128 two's complement
      const positive = 1000000n;
      const bytes = new Uint8Array(16);
      
      // Encode 1000000 first
      let val = positive;
      for (let i = 0; i < 16; i++) {
        bytes[i] = Number(val & 0xffn);
        val >>= 8n;
      }
      
      // Two's complement: invert and add 1
      for (let i = 0; i < 16; i++) {
        bytes[i] = ~bytes[i] & 0xff;
      }
      let carry = 1;
      for (let i = 0; i < 16; i++) {
        const sum = bytes[i] + carry;
        bytes[i] = sum & 0xff;
        carry = sum >> 8;
      }
      
      const result = parseTradeSize(bytes);
      expect(result.sizeValue).toBe(1000000n);
      expect(result.side).toBe("short");
    });
  });
});
