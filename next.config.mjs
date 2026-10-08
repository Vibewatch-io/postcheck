/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The fetch guard's connect-time address check runs in undici's own dispatcher; bundled, its
  // fetch returned FxTwitter's zstd-encoded JSON unreadable (gzip pages were fine), so load it as is.
  serverExternalPackages: ["undici"],
};
export default nextConfig;
