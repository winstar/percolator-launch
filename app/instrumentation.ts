/**
 * Next.js Instrumentation — runs once on server startup.
 * Used by @sentry/nextjs for proper server-side initialization.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Server-side Sentry initialization
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // Edge runtime Sentry initialization
    await import("./sentry.edge.config");
  }
}

/**
 * Called when an uncaught error occurs during server-side rendering.
 * Reports to Sentry for production visibility.
 */
export function onRequestError(
  error: Error,
  request: { path: string; method: string; headers: Record<string, string> },
  context: { routerKind: string; routePath: string; routeType: string; renderSource: string }
) {
  // Dynamic import to avoid pulling Sentry into edge bundles unnecessarily
  import("@sentry/nextjs").then((Sentry) => {
    Sentry.captureException(error, {
      tags: {
        routerKind: context.routerKind,
        routePath: context.routePath,
        routeType: context.routeType,
        renderSource: context.renderSource,
      },
      extra: {
        path: request.path,
        method: request.method,
      },
    });
  });
}
