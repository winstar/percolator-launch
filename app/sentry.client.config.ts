import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Performance Monitoring
  tracesSampleRate: 0.1, // Capture 10% of transactions
  
  // Session Replay
  replaysSessionSampleRate: 0, // Don't record normal sessions
  replaysOnErrorSampleRate: 1.0, // Record 100% of sessions with errors
  
  // Environment detection
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
  
  // Only enable if DSN is provided
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Don't send PII
  beforeSend(event, hint) {
    // You can filter or modify events here if needed
    return event;
  },
});
