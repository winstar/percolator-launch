/** Railway backend URL for simulation engine */
export const RAILWAY_URL =
  process.env.NEXT_PUBLIC_RAILWAY_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://percolator-api-production.up.railway.app";

/** Build a full Railway API URL */
export function railwayUrl(path: string): string {
  return `${RAILWAY_URL}${path}`;
}
