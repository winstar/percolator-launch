# Key Rotation Procedures

This document outlines step-by-step procedures for rotating sensitive credentials in the Percolator application. Follow these procedures whenever a key is compromised or as part of regular security maintenance (recommended quarterly).

## Table of Contents
- [General Principles](#general-principles)
- [Supabase Service Role Key](#supabase-service-role-key)
- [Helius API Key](#helius-api-key)
- [Discord Webhook URL](#discord-webhook-url)
- [INDEXER_API_KEY](#indexer_api_key)
- [CRANK_KEYPAIR](#crank_keypair)
- [WS_AUTH_SECRET](#ws_auth_secret)
- [Git Secrets Prevention](#git-secrets-prevention)

---

## General Principles

1. **Never commit secrets to git** - Always use environment variables
2. **Rotate keys immediately** if:
   - A key is accidentally committed to version control
   - A team member with access leaves
   - You suspect unauthorized access
   - As part of regular quarterly maintenance
3. **Zero-downtime rotation** - Update new key in environment, deploy, then revoke old key
4. **Document rotation dates** - Keep a private log of when keys were last rotated
5. **Test after rotation** - Verify all services work before revoking old credentials

---

## Supabase Service Role Key

**Impact:** High - Full database access  
**Affected Services:** API, Indexer, Keeper  
**Rotation Frequency:** Quarterly or immediately if compromised

### Steps:

1. **Generate new service role key in Supabase:**
   - Go to Supabase Dashboard → Project Settings → API
   - Click "Generate new service role key"
   - Copy the new key immediately (won't be shown again)

2. **Update environment variables:**
   ```bash
   # Production (Vercel)
   vercel env rm SUPABASE_SERVICE_ROLE_KEY production
   vercel env add SUPABASE_SERVICE_ROLE_KEY production
   # Paste new key when prompted
   
   # Development (local .env files)
   # Update .env.local, .env.vercel, etc.
   SUPABASE_SERVICE_ROLE_KEY=<new-key>
   ```

3. **Deploy all affected services:**
   ```bash
   # Redeploy API
   vercel --prod --force
   
   # Restart indexer (if running separately)
   pm2 restart indexer
   
   # Restart keeper (if running separately)
   pm2 restart keeper
   ```

4. **Verify functionality:**
   - Test API endpoints that write to database
   - Check indexer logs for successful database writes
   - Verify keeper can read/write slab data

5. **Revoke old key in Supabase:**
   - Only after confirming new key works in all environments
   - Note: Old service role keys cannot be revoked individually - they expire when regenerated

---

## Helius API Key

**Impact:** Medium - RPC access and webhook delivery  
**Affected Services:** Keeper, Indexer  
**Rotation Frequency:** Quarterly or immediately if compromised

### Steps:

1. **Generate new API key:**
   - Go to https://dev.helius.xyz/
   - Dashboard → API Keys → Create New Key
   - Copy the new API key

2. **Update webhook (if using Helius webhooks):**
   ```bash
   # If using Helius webhook for transaction monitoring
   # Delete old webhook via Helius API or dashboard
   curl -X DELETE "https://api.helius.xyz/v0/webhooks/<old-webhook-id>?api-key=<OLD_KEY>"
   
   # Create new webhook with new API key
   curl -X POST "https://api.helius.xyz/v0/webhooks?api-key=<NEW_KEY>" \
     -H "Content-Type: application/json" \
     -d '{
       "webhookURL": "https://your-api.vercel.app/webhooks/helius",
       "accountAddresses": ["<program-id>"],
       "webhookType": "enhanced",
       "txnStatus": "all"
     }'
   ```

3. **Update environment variables:**
   ```bash
   # Production
   vercel env rm HELIUS_API_KEY production
   vercel env add HELIUS_API_KEY production
   
   # Also update RPC_URL if it includes the API key
   vercel env rm RPC_URL production
   vercel env add RPC_URL production
   # New value: https://mainnet.helius-rpc.com/?api-key=<NEW_KEY>
   
   # Local .env files
   HELIUS_API_KEY=<new-key>
   RPC_URL=https://mainnet.helius-rpc.com/?api-key=<new-key>
   ```

4. **Deploy affected services:**
   ```bash
   vercel --prod --force
   pm2 restart keeper
   pm2 restart indexer
   ```

5. **Verify RPC connectivity:**
   ```bash
   # Test RPC endpoint
   curl -X POST https://mainnet.helius-rpc.com/?api-key=<NEW_KEY> \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
   ```

6. **Delete old API key:**
   - Helius Dashboard → API Keys → Delete old key
   - Only after verifying new key works

---

## Discord Webhook URL

**Impact:** Low - Notification delivery only  
**Affected Services:** Keeper (optional notifications)  
**Rotation Frequency:** As needed if compromised

### Steps:

1. **Generate new webhook URL:**
   - Discord → Server Settings → Integrations → Webhooks
   - Delete old webhook
   - Create new webhook
   - Copy the webhook URL

2. **Update environment variables:**
   ```bash
   # Production
   vercel env rm WEBHOOK_URL production
   vercel env add WEBHOOK_URL production
   
   # Local
   WEBHOOK_URL=<new-discord-webhook-url>
   ```

3. **Deploy:**
   ```bash
   vercel --prod --force
   pm2 restart keeper
   ```

4. **Test notification:**
   - Trigger an event that sends Discord notification
   - Verify message appears in correct channel

---

## INDEXER_API_KEY

**Impact:** Medium - Controls API access to indexer endpoints  
**Affected Services:** API (client), Indexer (server)  
**Rotation Frequency:** Quarterly

### Steps:

1. **Generate new key:**
   ```bash
   # Generate cryptographically secure random key
   openssl rand -hex 32
   # Example output: cd4e26bb5d107d8e33753beb66fbacee82170c2594eed540d52b72d5e48c5552
   ```

2. **Update environment variables:**
   ```bash
   # Indexer service (validates incoming requests)
   vercel env rm INDEXER_API_KEY production
   vercel env add INDEXER_API_KEY production
   
   # API service (makes requests to indexer)
   # Update in same environment
   
   # Local
   INDEXER_API_KEY=<new-key>
   ```

3. **Deploy services in order:**
   ```bash
   # Deploy indexer first (will accept both old and new key temporarily)
   # Then deploy API (will use new key)
   vercel --prod --force
   ```

4. **Verify API → Indexer communication:**
   - Check API logs for successful indexer requests
   - Test endpoints that query indexer data

**Note:** If you need zero-downtime rotation, implement dual-key validation in the indexer middleware temporarily.

---

## CRANK_KEYPAIR

**Impact:** HIGH - Controls keeper bot wallet with funds  
**Affected Services:** Keeper  
**Rotation Frequency:** Immediately if compromised, otherwise annual

### Steps:

1. **Generate new Solana keypair:**
   ```bash
   # Using Solana CLI
   solana-keygen new --no-bip39-passphrase -o new-crank-keypair.json
   
   # Or using Node.js
   node -e "
   const { Keypair } = require('@solana/web3.js');
   const kp = Keypair.generate();
   console.log(JSON.stringify(Array.from(kp.secretKey)));
   "
   ```

2. **Fund new keypair:**
   ```bash
   # Transfer SOL from old keypair to new keypair
   solana transfer <NEW_PUBKEY> <AMOUNT> --from <old-crank-keypair.json>
   
   # Verify balance
   solana balance <NEW_PUBKEY>
   ```

3. **Update environment variable:**
   ```bash
   # For JSON array format: [123,45,67,...]
   # For base58 format: use keypair.secretKey base58 encoded
   
   vercel env rm CRANK_KEYPAIR production
   vercel env add CRANK_KEYPAIR production
   
   # Local
   CRANK_KEYPAIR='[1,2,3,...]'
   ```

4. **Deploy keeper:**
   ```bash
   pm2 restart keeper
   ```

5. **Verify keeper operations:**
   - Check keeper logs for successful transaction signing
   - Verify keeper can crank slabs
   - Monitor on-chain activity from new pubkey

6. **Secure old keypair:**
   ```bash
   # Transfer remaining SOL to new keypair
   solana transfer <NEW_PUBKEY> ALL --from old-crank-keypair.json
   
   # Securely delete old keypair file
   shred -u old-crank-keypair.json
   
   # Or archive in secure offline storage if needed for audit
   ```

**WARNING:** Never commit CRANK_KEYPAIR to git. This controls real funds.

---

## WS_AUTH_SECRET

**Impact:** Medium - Controls WebSocket authentication  
**Affected Services:** API (WebSocket server)  
**Rotation Frequency:** Quarterly

### Steps:

1. **Generate new secret:**
   ```bash
   openssl rand -hex 32
   ```

2. **Plan client migration:**
   - If clients have long-lived tokens, implement dual-secret validation temporarily
   - Or notify clients of token expiration and require re-authentication

3. **Update environment variable:**
   ```bash
   vercel env rm WS_AUTH_SECRET production
   vercel env add WS_AUTH_SECRET production
   
   # Local
   WS_AUTH_SECRET=<new-secret>
   ```

4. **Deploy API:**
   ```bash
   vercel --prod --force
   ```

5. **Invalidate old tokens:**
   - All existing WebSocket authentication tokens will be invalid
   - Clients will need to reconnect and re-authenticate
   - Monitor WebSocket connection logs for auth failures

6. **Notify API consumers:**
   - If you have external API consumers, notify them in advance
   - Provide new token generation endpoint or documentation

**Note:** WebSocket tokens are short-lived (5 minutes), so rotation impact is minimal if WS_AUTH_REQUIRED=false in development.

---

## Git Secrets Prevention

To prevent accidentally committing secrets to git, set up automated secret scanning:

### Pre-commit Hook (Recommended)

1. **Install git-secrets:**
   ```bash
   # macOS
   brew install git-secrets
   
   # Linux
   git clone https://github.com/awslabs/git-secrets
   cd git-secrets
   sudo make install
   ```

2. **Configure for this repository:**
   ```bash
   cd /path/to/percolator-launch
   
   # Initialize git-secrets
   git secrets --install
   
   # Add patterns to detect
   git secrets --register-aws
   
   # Custom patterns for our secrets
   git secrets --add 'SUPABASE_SERVICE_ROLE_KEY=.*'
   git secrets --add 'HELIUS_API_KEY=.*'
   git secrets --add 'API_AUTH_KEY=.*'
   git secrets --add 'WS_AUTH_SECRET=.*'
   git secrets --add 'INDEXER_API_KEY=.*'
   git secrets --add 'CRANK_KEYPAIR=.*'
   git secrets --add 'WEBHOOK_URL=https://discord.com/api/webhooks/.*'
   git secrets --add --allowed '.env.example'  # Allow .env.example
   ```

3. **Test the hook:**
   ```bash
   # Try to commit a secret (should fail)
   echo "API_AUTH_KEY=secret123" > test.txt
   git add test.txt
   git commit -m "test"  # Should be blocked
   rm test.txt
   ```

### Alternative: GitHub Secret Scanning

- Enable in GitHub: Settings → Code security and analysis → Secret scanning
- GitHub will automatically scan commits and alert on detected secrets
- Available for public repos (free) and private repos (GitHub Advanced Security)

### Manual Audit

If you've already committed secrets:

```bash
# Search git history for potential secrets
git log -p | grep -i "api_key\|secret\|password\|token"

# Use git-filter-branch to remove secrets from history (DESTRUCTIVE)
# Only do this if absolutely necessary and coordinate with team
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env.local" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (be very careful)
git push origin --force --all
```

**After removing secrets from git history:**
1. Rotate ALL exposed credentials immediately
2. Notify team to re-clone repository
3. Change GitHub repo settings to prevent force pushes if needed

---

## Emergency Response

If you discover a committed secret:

1. **Immediately rotate the exposed credential** (follow procedure above)
2. **Remove from git history** if possible (use git-filter-branch or BFG Repo-Cleaner)
3. **Audit access logs** in affected services (Supabase, Helius, Vercel)
4. **Document incident** for security review
5. **Review and improve** secret management practices

---

## Additional Security Recommendations

1. **Use secret management service** for production (e.g., Vercel Environment Variables, AWS Secrets Manager)
2. **Implement secret versioning** - keep track of when keys were rotated
3. **Principle of least privilege** - different keys for dev/staging/production
4. **Monitor for unusual activity** - set up alerts in Supabase, Helius dashboards
5. **Regular security audits** - review access logs quarterly

---

**Last Updated:** 2026-02-17  
**Next Review:** 2026-05-17
