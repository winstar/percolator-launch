import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  slabAddressSchema,
  marketRegistrationSchema,
  paginationSchema,
  validateEnv,
} from "../src/validation.js";

describe("validation", () => {
  describe("slabAddressSchema", () => {
    it("should accept valid base58 Solana addresses", () => {
      const validAddresses = [
        "11111111111111111111111111111111", // 32 chars
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // 44 chars
        "So11111111111111111111111111111111111112", // SOL mint
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC mint
      ];

      validAddresses.forEach((address) => {
        const result = slabAddressSchema.safeParse(address);
        expect(result.success).toBe(true);
      });
    });

    it("should reject addresses that are too short", () => {
      const tooShort = "123456789ABC"; // Only 12 chars

      const result = slabAddressSchema.safeParse(tooShort);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("at least 32");
      }
    });

    it("should reject addresses that are too long", () => {
      const tooLong = "1".repeat(45); // 45 chars

      const result = slabAddressSchema.safeParse(tooLong);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("at most 44");
      }
    });

    it("should reject addresses with invalid characters", () => {
      const invalidChars = [
        "11111111111111111111111111111110", // Contains 0 (not base58)
        "OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO", // Contains O (not base58)
        "IIIIIIIIIIIIIIIIIIIIIIIIIIIIIiii", // Contains I (not base58)
        "llllllllllllllllllllllllllllllll", // Contains l (not base58)
        "11111111111111111111111111111!11", // Special char
        "1111111111111111111111111111 111", // Contains space
      ];

      invalidChars.forEach((address) => {
        const result = slabAddressSchema.safeParse(address);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("Invalid base58");
        }
      });
    });

    it("should reject non-string inputs", () => {
      const invalidInputs = [123, null, undefined, {}, []];

      invalidInputs.forEach((input) => {
        const result = slabAddressSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("marketRegistrationSchema", () => {
    it("should accept valid market registration body", () => {
      const validBody = {
        slabAddress: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        name: "My Market",
        description: "A test market",
      };

      const result = marketRegistrationSchema.safeParse(validBody);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validBody);
      }
    });

    it("should accept body without optional name and description", () => {
      const minimalBody = {
        slabAddress: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      };

      const result = marketRegistrationSchema.safeParse(minimalBody);
      
      expect(result.success).toBe(true);
    });

    it("should reject body with missing slabAddress", () => {
      const missingAddress = {
        name: "My Market",
        description: "A test market",
      };

      const result = marketRegistrationSchema.safeParse(missingAddress);
      
      expect(result.success).toBe(false);
    });

    it("should reject body with invalid slabAddress", () => {
      const invalidAddress = {
        slabAddress: "invalid-address-123",
        name: "My Market",
      };

      const result = marketRegistrationSchema.safeParse(invalidAddress);
      
      expect(result.success).toBe(false);
    });

    it("should reject empty name", () => {
      const emptyName = {
        slabAddress: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        name: "",
      };

      const result = marketRegistrationSchema.safeParse(emptyName);
      
      expect(result.success).toBe(false);
    });
  });

  describe("paginationSchema", () => {
    it("should apply default values", () => {
      const result = paginationSchema.safeParse({});
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
      }
    });

    it("should accept valid limit and offset", () => {
      const valid = { limit: 50, offset: 100 };

      const result = paginationSchema.safeParse(valid);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(100);
      }
    });

    it("should coerce string numbers to integers", () => {
      const stringNumbers = { limit: "30", offset: "20" };

      const result = paginationSchema.safeParse(stringNumbers);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(30);
        expect(result.data.offset).toBe(20);
      }
    });

    it("should reject negative limit", () => {
      const negativeLim = { limit: -10, offset: 0 };

      const result = paginationSchema.safeParse(negativeLim);
      
      expect(result.success).toBe(false);
    });

    it("should reject negative offset", () => {
      const negativeOff = { limit: 20, offset: -5 };

      const result = paginationSchema.safeParse(negativeOff);
      
      expect(result.success).toBe(false);
    });

    it("should reject limit above 100", () => {
      const tooHigh = { limit: 101, offset: 0 };

      const result = paginationSchema.safeParse(tooHigh);
      
      expect(result.success).toBe(false);
    });

    it("should reject zero limit", () => {
      const zeroLimit = { limit: 0, offset: 0 };

      const result = paginationSchema.safeParse(zeroLimit);
      
      expect(result.success).toBe(false);
    });

    it("should handle partial input with defaults", () => {
      const onlyLimit = { limit: 15 };

      const result = paginationSchema.safeParse(onlyLimit);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(15);
        expect(result.data.offset).toBe(0); // default
      }
    });
  });

  describe("validateEnv", () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      vi.resetModules();
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.resetModules();
    });

    it("should accept valid development environment", async () => {
      process.env.NODE_ENV = "development";
      process.env.RPC_URL = "https://api.devnet.solana.com";

      const { validateEnv } = await import("../src/validation.js");
      const result = validateEnv();

      expect(result.NODE_ENV).toBe("development");
      expect(result.RPC_URL).toBe("https://api.devnet.solana.com");
    });

    it("should use defaults for missing optional vars in development", async () => {
      process.env.NODE_ENV = "development";
      delete process.env.RPC_URL;
      delete process.env.SUPABASE_URL;

      const { validateEnv } = await import("../src/validation.js");
      const result = validateEnv();

      expect(result.NODE_ENV).toBe("development");
      // Optional vars should be undefined
      expect(result.RPC_URL).toBeUndefined();
      expect(result.SUPABASE_URL).toBeUndefined();
    });

    it("should require RPC_URL in production", async () => {
      process.env.NODE_ENV = "production";
      delete process.env.RPC_URL;
      process.env.SUPABASE_URL = "https://test.supabase.co";
      process.env.SUPABASE_KEY = "key";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

      const { validateEnv } = await import("../src/validation.js");

      expect(() => validateEnv()).toThrow("RPC_URL is required in production");
    });

    it("should require SUPABASE_URL in production", async () => {
      process.env.NODE_ENV = "production";
      process.env.RPC_URL = "https://api.mainnet-beta.solana.com";
      delete process.env.SUPABASE_URL;
      process.env.SUPABASE_KEY = "key";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

      const { validateEnv } = await import("../src/validation.js");

      expect(() => validateEnv()).toThrow("SUPABASE_URL is required in production");
    });

    it("should require SUPABASE_KEY in production", async () => {
      process.env.NODE_ENV = "production";
      process.env.RPC_URL = "https://api.mainnet-beta.solana.com";
      process.env.SUPABASE_URL = "https://test.supabase.co";
      delete process.env.SUPABASE_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

      const { validateEnv } = await import("../src/validation.js");

      expect(() => validateEnv()).toThrow("SUPABASE_KEY is required in production");
    });

    it("should require SUPABASE_SERVICE_ROLE_KEY in production", async () => {
      process.env.NODE_ENV = "production";
      process.env.RPC_URL = "https://api.mainnet-beta.solana.com";
      process.env.SUPABASE_URL = "https://test.supabase.co";
      process.env.SUPABASE_KEY = "key";
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { validateEnv } = await import("../src/validation.js");

      expect(() => validateEnv()).toThrow("SUPABASE_SERVICE_ROLE_KEY is required in production");
    });

    it("should accept valid production environment with all required vars", async () => {
      process.env.NODE_ENV = "production";
      process.env.RPC_URL = "https://api.mainnet-beta.solana.com";
      process.env.SUPABASE_URL = "https://test.supabase.co";
      process.env.SUPABASE_KEY = "key";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

      const { validateEnv } = await import("../src/validation.js");
      const result = validateEnv();

      expect(result.NODE_ENV).toBe("production");
      expect(result.RPC_URL).toBe("https://api.mainnet-beta.solana.com");
      expect(result.SUPABASE_URL).toBe("https://test.supabase.co");
      expect(result.SUPABASE_KEY).toBe("key");
      expect(result.SUPABASE_SERVICE_ROLE_KEY).toBe("service-key");
    });

    it("should coerce PORT to number", async () => {
      process.env.NODE_ENV = "development";
      process.env.PORT = "8080";

      const { validateEnv } = await import("../src/validation.js");
      const result = validateEnv();

      expect(result.PORT).toBe(8080);
      expect(typeof result.PORT).toBe("number");
    });

    it("should default NODE_ENV to development", async () => {
      delete process.env.NODE_ENV;

      const { validateEnv } = await import("../src/validation.js");
      const result = validateEnv();

      expect(result.NODE_ENV).toBe("development");
    });
  });
});
