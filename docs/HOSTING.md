# Hosting

The game is a static site (about 1 MB after the build, 250 KB over the wire) plus a map data set it
fetches on demand: `index.json`, `overview.png`, 2,106 fine tiles under `tiles/` and 40 far-field tiles
under `far/`, 381 MB in all. The two have different needs, so they live in different places:

| | What | Where | Why |
|---|---|---|---|
| App | `dist/` from `npm run build` | **GitHub Pages** (or Vercel / Netlify) | free, deploys from a push, tiny |
| Data | `public/data/` from `npm run bake:all` | **Cloudflare R2** behind Cloudflare's CDN (alternative: **S3 + CloudFront**) | 381 MB of objects fetched piecemeal by every player; needs an object store with cheap egress and a cache in front |

The app finds the data through one build-time variable, `VITE_DATA_URL` (default `data/` next to the
app). Everything below is about filling that in.

## What is live now: GitHub Pages with the data from a release

The public site is the `main` branch built by `.github/workflows/pages.yml` and served by GitHub Pages. The
data rides along with it: the bake is attached as one archive, `bwca-data-v3.tar`, to the GitHub release
`data-v3`, and the workflow unpacks it into `dist/data/` next to the app, so the app reads `data/` from its own
origin (no `DATA_URL`, no CORS, no bucket). The site is about 450 MB, inside Pages' 1 GB limit; Pages' soft
limit of 100 GB of bandwidth a month covers about 5,000 visits of 20 MB.

A new bake: pack it, attach it to a new release, point the workflow at it, and redeploy:

```bash
npm run bake:all
COPYFILE_DISABLE=1 tar --no-mac-metadata -C public/data -cf bwca-data-v4.tar .
gh release create data-v4 bwca-data-v4.tar --title "Map data v4" --notes "Bake of $(date +%F)"
gh variable set DATA_RELEASE --body data-v4
gh workflow run pages.yml
```

Move to a bucket (below) when the bandwidth outgrows Pages: set the `DATA_URL` variable and the workflow
stops unpacking the release.

## How the data is fetched

- On load: `index.json` (5.6 MB, 1.1 MB compressed), `overview.png` (3.7 MB), the 3 × 3 fine tiles
  round the canoe (1.8 MB) and up to 3 × 3 far tiles (2.2 MB): **about 9 MB** before the title screen.
- Paddling: the 5 × 5 neighbourhood is kept loaded, so every 2.56 km of travel in a new direction costs
  five tiles, about 0.9 MB. A teleport costs a fresh neighbourhood, 2–5 MB.
- The map: tiles beyond the loaded neighbourhood are fetched for the map alone when it is zoomed in, at
  most 96 of them (17 MB) before the oldest are dropped.
- A visit therefore costs **about 20 MB** on average and 50 MB for a long or map-happy one, in roughly
  120 requests. Tiles average 178 KB (max 272 KB); far tiles 240 KB.

The fetches come from web workers as well as the page, so the data host must answer with CORS headers
for the app's origin. The tiles are gzip bytes that the client inflates itself (`DecompressionStream`).

### Compression: store the tiles as they are

Store each `.bin` exactly as the bake wrote it, as `Content-Type: application/octet-stream` with **no**
`Content-Encoding` header, and let the client gunzip (as it does from the dev server today). This is the
decision, and the reasons:

- The bytes are already compressed; `Content-Encoding: gzip` would save nothing on the wire.
- A `Content-Encoding: gzip` header makes the browser inflate the body before `fetch()` hands it over,
  so the client's own gunzip would then fail on plain bytes. The code would have to sniff the gzip magic
  to work in both cases, and a CDN or host that strips or adds the header silently would break tiles.
- Opaque binary is never recompressed or transformed by Cloudflare or CloudFront, so a tile is one
  immutable object with one ETag everywhere: the dev server, GitHub Pages, R2, S3.
- Inflating a 180 KB tile takes a few milliseconds in the worker, which already builds the tile's terrain
  and forest from it.

`index.json` is the one object that should be compressed in transit: let the CDN do it (Cloudflare does
for `application/json`; CloudFront does with "Compress objects automatically", which both managed cache
policies turn on). GitHub Pages compresses JSON too.

### Cache headers

Tiles never change for a given bake, so upload each bake under its own prefix (`bwca/v3/`, then
`bwca/v4/` …) and mark tiles, far tiles and the overview `Cache-Control: public, max-age=31536000,
immutable`. `index.json` gets `max-age=300, must-revalidate` and is uploaded last, so a new bake is
complete before the index that points at it is. Switching bakes is then a change of `VITE_DATA_URL`
and a redeploy of the app; nothing ever has to be purged. `npm run data:sync` sets all of this.

## First choice: Cloudflare R2

R2 charges nothing for egress, which is the whole bill for a data set like this, and a bucket behind a
Cloudflare-proxied hostname gets the CDN for free. A free Cloudflare account is enough.

1. **Create the bucket**: Cloudflare dashboard → R2 → Create bucket, e.g. `bwca-data`. Keep the
   default location.
2. **Make it public** on a hostname.
   - Best: *Settings → Public access → Custom Domains → Connect domain*, e.g. `data.example.com`
     (the domain's DNS must be on Cloudflare; a cheap domain is about $10 a year). Requests then pass
     through Cloudflare's cache and firewall.
   - Quick: *Public access → R2.dev subdomain → Allow*. That URL is rate-limited and not cached, fine for
     a few dozen players and for trying things out, not for thousands.
3. **CORS**: *Settings → CORS policy → Add*:
   ```json
   [{ "AllowedOrigins": ["https://<you>.github.io"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "ExposeHeaders": [], "MaxAgeSeconds": 86400 }]
   ```
   Add `http://localhost:5173` to `AllowedOrigins` while you want the dev server to read from the bucket,
   or use `"*"` since the data is public anyway.
4. **Cache the JSON** (custom domain only): Cloudflare caches `.bin` and `.png` by extension already, but
   not `.json`. *Caching → Cache Rules → Create*: hostname equals `data.example.com` → *Eligible for cache*,
   edge TTL *Use cache-control header from origin*. Also turn *Speed → Optimization → Brotli* on (it is by
   default).
5. **An API token for uploads**: *R2 → Manage R2 API tokens → Create*, permission *Object Read & Write*
   on the bucket. Note the Access Key ID, the Secret Access Key and the S3 endpoint
   `https://<account-id>.r2.cloudflarestorage.com`.
6. **Upload** with rclone (fastest, parallel):
   ```bash
   brew install rclone
   rclone config create r2 s3 provider=Cloudflare access_key_id=… secret_access_key=… endpoint=https://<account-id>.r2.cloudflarestorage.com acl=private
   DATA_SYNC_DEST=r2:bwca-data/bwca/v3 npm run data:sync
   ```
   or with the AWS CLI:
   ```bash
   AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… DATA_SYNC_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com DATA_SYNC_DEST=s3://bwca-data/bwca/v3 npm run data:sync
   ```
   Add `-- --dry-run` to see what would change. The first full upload is 381 MB in 2,150 objects; later
   runs only send what differs.
7. **Point the app at it**: `VITE_DATA_URL=https://data.example.com/bwca/v3/` (trailing slash). Check it
   locally with `VITE_DATA_URL=… npm run dev`, then set it for the deployment (below).

**Cost.** Storage $0.015 per GB-month beyond 10 GB free (we use 0.4 GB: free). Reads (Class B) $0.36
per million beyond 10 million a month free, and with the CDN in front only cache misses reach the
bucket. Egress $0.

| | 100 players | 10,000 players |
|---|---|---|
| Egress per month (20 MB a visit, one visit each) | 2 GB | 200 GB |
| Egress, busy (3 visits of 20 MB) | 6 GB | 600 GB |
| Requests to the bucket (120 a visit, before the cache) | 12,000–36,000 | 1.2–3.6 million |
| **R2 bill** | **$0** | **$0** (reads stay inside the free 10 M; a domain is about $10 a year) |

It would take about 30,000 players a month, with no cache in front at all, to pass the free reads and
reach a dollar.

## Alternative: S3 + CloudFront

Same shape on AWS: a private S3 bucket, a CloudFront distribution in front of it with Origin Access
Control, and the distribution's hostname (or an alias) as `VITE_DATA_URL`.

1. Bucket `bwca-data` (block all public access; CloudFront reads it through OAC).
2. CloudFront distribution: origin = the bucket, *Origin access: Origin access control* (create one,
   then copy the bucket policy it offers into the bucket). Viewer protocol *Redirect HTTP to HTTPS*.
   Cache policy *CachingOptimized* (honours our `Cache-Control`, compresses the JSON). Origin request
   policy *CORS-S3Origin* and response headers policy *SimpleCORS* so `Access-Control-Allow-Origin` is
   returned to the page and the workers.
3. Bucket CORS (*Permissions → CORS*): `AllowedOrigins` = the app's origin (or `*`), `AllowedMethods` =
   `GET, HEAD`.
4. Upload: `DATA_SYNC_DEST=s3://bwca-data/bwca/v3 npm run data:sync` (uses your AWS CLI credentials).
5. `VITE_DATA_URL=https://d1234.cloudfront.net/bwca/v3/`.

**Cost.** S3 storage $0.023 per GB-month (0.4 GB: $0.01). CloudFront's always-free tier covers 1 TB of
egress and 10 million requests a month; past it, $0.085 per GB and $0.01 per 10,000 requests
(North America).

| | 100 players | 10,000 players |
|---|---|---|
| Inside the free tier | **$0** | **$0** (200–600 GB of the free 1 TB) |
| If the free tier is spent elsewhere | about $0.20–0.60 | about $20–55 |

## The app on GitHub Pages

`.github/workflows/pages.yml` builds and deploys `dist/` on every push to `main`. One-time setup:

1. Push the repository to GitHub. *Settings → Pages → Build and deployment → Source: GitHub Actions.*
2. *Settings → Secrets and variables → Actions → Variables → New repository variable*: `DATA_URL` =
   `https://data.example.com/bwca/v3/`. The workflow passes it to the build as `VITE_DATA_URL`.
3. Push. The site appears at `https://<you>.github.io/<repo>/` (the workflow sets the base path from
   the Pages configuration, so a custom domain or a user site works unchanged).

With `VITE_DATA_URL` set the build leaves `public/data` out of `dist/` (it is the only thing under
`public/`); without it, a local build copies the whole bake in, which is what the demo below wants.

The app costs nothing to host: Pages is free for public repositories, with a soft limit of 100 GB of
bandwidth a month, and a visit downloads about 300 KB of app. The GPS extension is not part of the site.

Vercel or Netlify work the same way: import the repository, build command `npm run build`, output
`dist`, environment variable `VITE_DATA_URL`. Leave `BASE_PATH` unset there (the site is at the root).

## Fallback: a small demo next to the app

For a demo that needs no bucket at all, bake the Lake One area and ship it with the app:

```bash
npm run bake               # Lake One → Lake Four, 5 x 4 tiles, about 4 MB in public/data
git add -f public/data     # it is in .gitignore; -f adds the demo bake anyway
```

With no `DATA_URL` variable the app looks for `data/` next to itself, which Vite copies from
`public/data` into `dist/`. The whole wilderness is still in the index of a full bake, but a demo bake's
index only knows its own 20 tiles and one entry point: the entry point list on the title screen shows what is baked. Pages
itself could technically hold the full 381 MB (the site limit is 1 GB), but every player would pull it
from GitHub, which is both slow and against the spirit of the bandwidth limit; keep the full set in a
bucket.

## Checklist for a new bake

1. `npm run bake:all`
2. `DATA_SYNC_DEST=r2:bwca-data/bwca/v4 npm run data:sync`
3. Set `DATA_URL` to the new prefix, `git push` (or *Run workflow* on the Actions page).
4. Leave `v3` in the bucket until the old app version has aged out of browser caches (a day), then
   delete it.
