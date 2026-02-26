import { describe, it, expect } from "vitest";
import { validateKeeperEnvGuards } from "../src/env-guards.js";

describe("validateKeeperEnvGuards", () => {
  it("throws when SUPABASE_KEY equals SUPABASE_SERVICE_ROLE_KEY", () => {
    const env = {
      SUPABASE_KEY: "same-key",
      SUPABASE_SERVICE_ROLE_KEY: "same-key",
    } as NodeJS.ProcessEnv;

    expect(() => validateKeeperEnvGuards(env)).toThrow(
      "Keeper misconfiguration: SUPABASE_KEY must not equal SUPABASE_SERVICE_ROLE_KEY"
    );
  });

  it("does not throw when keys differ", () => {
    const env = {
      SUPABASE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    } as NodeJS.ProcessEnv;

    expect(() => validateKeeperEnvGuards(env)).not.toThrow();
  });

  it("does not throw when one key is missing", () => {
    const env = {
      SUPABASE_KEY: "anon-key",
    } as NodeJS.ProcessEnv;

    expect(() => validateKeeperEnvGuards(env)).not.toThrow();
  });
});
