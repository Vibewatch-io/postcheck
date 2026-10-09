# Security

Postcheck has three server routes that fetch on a user's behalf and one that serves licensed fonts:

- `/api/unfurl` fetches the Open Graph tags of the first link in a post.
- `/api/quote` asks FxTwitter for a quoted post.
- `/api/profile` asks FxTwitter for an account, with vxtwitter as the fallback.
- `/fonts/[file]` serves the GT America files.

Fetches to a user-supplied or redirected address go through `src/lib/server/fetch-guard.ts`. Only http(s) is allowed, and only to public addresses. The address check runs again on every redirect hop, on the address the connection actually dials. The quote lookup asks FxTwitter's fixed address with redirects refused (`src/lib/server/fxtwitter.ts`). Every read is byte-capped and has a timeout. Lookups take their input in a POST body and answer `no-store`. The README's [Privacy](README.md#privacy) section lists everything that leaves the browser and how to check it yourself.

## Reporting

Please report vulnerabilities privately through [GitHub's private vulnerability reporting](../../security/advisories/new) rather than a public issue. You'll get a reply within a week, and credit in the fix if you want it.

In scope: anything that gets the server to fetch a private or internal address, exhaust memory or time, store or leak what a user typed, or serve the GT America files to a third-party site. Also anything in the capture scripts that could write to an X account.

Out of scope: rate limiting on the hosted site (it's applied at the edge, not in this repo), and the accuracy of the previews themselves (that's a normal issue).

## Known limitations

- The routes are a fetch proxy by design. The hosted instance rate-limits `/api/` at the edge; a fork must do the same.
- FxTwitter and vxtwitter are third parties: a looked-up handle or post number reaches them, as the README says.
