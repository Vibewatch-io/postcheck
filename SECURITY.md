# Security

Postcheck has two server routes that fetch on a user's behalf, `/api/unfurl` (Open Graph lookups) and `/api/profile` (FxTwitter lookups), and one that serves licensed fonts, `/fonts/[file]`. The guard they share is `src/lib/server/fetch-guard.ts`: http(s) only, public addresses only, re-checked on every redirect hop, byte caps and timeouts.

## Reporting

Please report vulnerabilities privately through [GitHub's private vulnerability reporting](../../security/advisories/new) rather than a public issue. You'll get a reply within a week, and credit in the fix if you want it.

In scope: anything that gets the server to fetch a private or internal address, exhaust memory or time, leak another user's data, or serve the GT America files to a third-party site. Also anything in the capture scripts that could write to an X account.

Out of scope: rate limiting on the hosted site (it's applied at the edge, not in this repo), and the accuracy of the previews themselves (that's a normal issue).

## Known limitations

- The address check resolves DNS before the fetch and the fetch resolves again, so a host that answers with a public address first and a private one second (DNS rebinding) could in principle pass. Both resolutions happen within milliseconds and the routes only return parsed metadata, never the raw response, which limits what could be read.
- The hosted instance rate-limits both API routes at the edge. A fork must do the same.
