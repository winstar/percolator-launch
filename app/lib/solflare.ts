export function buildSolflareBrowseUrl(currentUrl: string, ref?: string): string {
  const encodedUrl = encodeURIComponent(currentUrl);
  const encodedRef = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  return `https://solflare.com/ul/v1/browse/${encodedUrl}${encodedRef}`;
}
