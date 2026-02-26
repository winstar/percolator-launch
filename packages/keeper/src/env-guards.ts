export function validateKeeperEnvGuards(env: NodeJS.ProcessEnv = process.env): void {
  const supabaseKey = env.SUPABASE_KEY?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (supabaseKey && serviceRoleKey && supabaseKey === serviceRoleKey) {
    throw new Error(
      "Keeper misconfiguration: SUPABASE_KEY must not equal SUPABASE_SERVICE_ROLE_KEY. " +
      "Set SUPABASE_KEY to the anon key for keeper runtime."
    );
  }
}
