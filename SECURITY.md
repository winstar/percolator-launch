# Security Features

This document outlines the security hardening implemented in the Percolator Launch API.

## 🔒 Security Headers

The API automatically adds the following security headers to all responses:

- **X-Content-Type-Options: nosniff** — Prevents MIME type sniffing
- **X-Frame-Options: DENY** — Prevents clickjacking attacks
- **X-XSS-Protection: 1; mode=block** — Enables browser XSS protection
- **Referrer-Policy: strict-origin-when-cross-origin** — Controls referrer information
- **Strict-Transport-Security** — Enforces HTTPS (only when using HTTPS)

## 🌐 CORS Lockdown

CORS origins are strictly controlled:

- **Development**: Defaults to `http://localhost:3000,http://localhost:3001`
- **Production**: `CORS_ORIGINS` environment variable **must** be set explicitly
- Disallowed origins receive a 403 response
- Configure via `CORS_ORIGINS` environment variable (comma-separated)

Example:
```bash
CORS_ORIGINS=https://percolator-launch.vercel.app,https://app.percolatorlaunch.com
```

## 🔐 WebSocket Authentication

WebSocket connections support optional authentication:

### Configuration

- `WS_AUTH_REQUIRED=true` — Require authentication (default: false)
- `WS_AUTH_SECRET` — Secret key for HMAC tokens (change in production!)

### Authentication Methods

**Method 1: Query Parameter**
```javascript
const ws = new WebSocket('wss://api.percolatorlaunch.com?token=YOUR_TOKEN');
```

**Method 2: First Message**
```javascript
const ws = new WebSocket('wss://api.percolatorlaunch.com');
ws.send(JSON.stringify({ type: 'auth', token: 'YOUR_TOKEN' }));
```

### Token Format

Tokens are HMAC-based:
```
slabAddress:timestamp:signature
```

- **slabAddress**: The market slab address
- **timestamp**: Unix timestamp in milliseconds
- **signature**: HMAC-SHA256 signature

Tokens are valid for 5 minutes.

### Connection Limits

- **Global limit**: 500 concurrent connections (configurable via `MAX_WS_CONNECTIONS`)
- **Per-IP limit**: 5 concurrent connections
- **Subscriptions per client**: 50 markets max
- **Global subscriptions**: 1000 max across all clients
- **Auth timeout**: Connections must authenticate within 5 seconds (if auth required)

## 🧹 Input Sanitization

All user inputs are sanitized using utilities in `@percolator/shared`:

### Functions

**sanitizeString(input, maxLength?)**
- Removes null bytes and control characters
- Trims whitespace
- Limits length (default: 1000 chars)

**sanitizeSlabAddress(input)**
- Validates base58 format
- Checks length (32-44 characters)
- Returns sanitized address or null

**sanitizePagination(limit?, offset?)**
- Clamps limit: 1-500 (default: 50)
- Clamps offset: 0-100000
- Returns safe values

**sanitizeNumber(input, min?, max?)**
- Validates numeric input
- Enforces min/max bounds
- Returns number or null

### Applied To

- All route parameters (slab addresses, etc.)
- All query parameters (limit, offset, hours, etc.)
- WebSocket message payloads

## 🚦 Rate Limiting

Rate limiting is applied per-IP with separate limits for read and write operations:

### Limits

- **Read endpoints** (GET, HEAD, OPTIONS): 100 requests/minute
- **Write endpoints** (POST, PUT, DELETE): 10 requests/minute

### Headers

All responses include rate limit headers:

- `X-RateLimit-Limit` — Maximum requests allowed
- `X-RateLimit-Remaining` — Requests remaining in window
- `X-RateLimit-Reset` — Unix timestamp when limit resets

### Violations

Rate limit violations are:
- Logged with IP, path, and method
- Responded with 429 status code

## 🛡️ Best Practices

### For Production

1. **Set CORS_ORIGINS explicitly**
   ```bash
   CORS_ORIGINS=https://your-app.com,https://www.your-app.com
   ```

2. **Enable WebSocket auth for sensitive data**
   ```bash
   WS_AUTH_REQUIRED=true
   WS_AUTH_SECRET=$(openssl rand -hex 32)
   ```

3. **Use HTTPS** to enable HSTS headers

4. **Monitor rate limit logs** for potential abuse

5. **Rotate WS_AUTH_SECRET periodically**

### For Development

1. **Use localhost origins**
   ```bash
   CORS_ORIGINS=http://localhost:3000,http://localhost:3001
   ```

2. **Keep auth disabled** for easier testing
   ```bash
   WS_AUTH_REQUIRED=false
   ```

## 📊 Security Monitoring

All security events are logged:

- CORS violations (rejected origins)
- Rate limit violations (IP, path, method)
- WebSocket auth failures
- WebSocket connection limits reached

Check logs with:
```bash
pnpm --filter=@percolator/api dev
```

## 🔄 Future Enhancements

Potential improvements:

- [ ] JWT-based WebSocket authentication
- [ ] Redis-backed rate limiting for multi-instance deployments
- [ ] IP allowlist/blocklist
- [ ] Request signing for write endpoints
- [ ] Audit logging for sensitive operations
