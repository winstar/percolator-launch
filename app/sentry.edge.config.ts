import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Performance Monitoring
  tracesSampleRate: 0.1,
  
  // Environment detection
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
  
  // Only enable if DSN is provided
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
