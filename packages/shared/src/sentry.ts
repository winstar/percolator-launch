import * as Sentry from "@sentry/node";

/**
 * Initialize Sentry for a backend service.
 * Only initializes if SENTRY_DSN env var is set.
 * 
 * @param service - Service name (e.g. "api", "keeper", "indexer")
 */
export function initSentry(service: string): void {
  const dsn = process.env.SENTRY_DSN;
  
  if (!dsn) {
    console.log(`[Sentry] Disabled (no SENTRY_DSN set) for ${service}`);
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1, // 10% of transactions
    enabled: true,
    
    // Add service name as tag
    initialScope: {
      tags: {
        service,
      },
    },
    
    // Don't send PII
    beforeSend(event, hint) {
      // You can filter or modify events here if needed
      return event;
    },
  });

  console.log(`[Sentry] Initialized for ${service}`);
}

/**
 * Capture an exception to Sentry.
 * Safe to call even if Sentry is not initialized.
 */
export function captureException(
  error: Error | unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: Sentry.SeverityLevel;
  }
): string {
  return Sentry.captureException(error, {
    tags: context?.tags,
    extra: context?.extra,
    level: context?.level,
  });
}

/**
 * Capture a message to Sentry.
 * Safe to call even if Sentry is not initialized.
 */
export function captureMessage(
  message: string,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: Sentry.SeverityLevel;
  }
): string {
  return Sentry.captureMessage(message, {
    tags: context?.tags,
    extra: context?.extra,
    level: context?.level || "info",
  });
}

/**
 * Add a breadcrumb for tracking important operations.
 * Breadcrumbs appear in Sentry when an error occurs.
 */
export function addBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
  level?: Sentry.SeverityLevel
): void {
  Sentry.addBreadcrumb({
    message,
    data,
    level: level || "info",
    timestamp: Date.now() / 1000,
  });
}

/**
 * Set a tag for all future events in this scope.
 */
export function setTag(key: string, value: string): void {
  Sentry.setTag(key, value);
}

/**
 * Set user context for all future events.
 */
export function setUser(user: { id?: string; [key: string]: unknown }): void {
  Sentry.setUser(user);
}

/**
 * Clear user context.
 */
export function clearUser(): void {
  Sentry.setUser(null);
}
