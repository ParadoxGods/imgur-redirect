# Imgur Image Portal

A small, privacy-minded GitHub Pages viewer for direct Imgur images and GIFs. It accepts an Imgur URL, asks GitHub's Markdown API for an anonymized [Camo](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-anonymized-urls) URL, and displays the image through that relay.

The portal is live at <https://paradoxgods.github.io/imgur-redirect/>. Paste a valid Imgur image URL into the field and it opens automatically, replacing any previous URL. On phones that support native sharing, choose **share**. Otherwise choose **copy link**.

## Supported links

- Direct images: `https://i.imgur.com/AbCdE12.jpg`
- Simple single-image pages: `https://imgur.com/AbCdE12`
- JPEG, PNG, GIF, and WebP images

Real `.gif` files work when Imgur serves them as `image/gif` and they fit GitHub Camo's relay limit. Large GIFs may fail with a size error. Legacy GIFV links keep their best-effort `.gif` fallback, but Imgur may return a still JPEG instead of animation.

The static portal cannot look up Imgur metadata. An extensionless `imgur.com/ID` link therefore uses Imgur's `.jpg` endpoint, which may be a still preview when the original post is animated or video.

Albums, gallery posts, profile links, SVG, MP4, and WebM are rejected deliberately. GitHub Camo only relays externally hosted images; it rejects MP4 bytes. True video support requires a separate, video-capable server relay and cannot be added by static GitHub Pages alone.

Links can be opened in these forms:

```text
# Recommended compact share link
https://paradoxgods.github.io/imgur-redirect/#AbCdE12.jpg

# Older query and fragment links remain accepted
https://paradoxgods.github.io/imgur-redirect/?url=https%3A%2F%2Fi.imgur.com%2FAbCdE12.jpg
https://paradoxgods.github.io/imgur-redirect/#url=https%3A%2F%2Fi.imgur.com%2FAbCdE12.jpg

# Friendly path that redirects to the compact link
https://paradoxgods.github.io/imgur-redirect/i/AbCdE12.jpg
```

The app converts older links to the compact fragment after validation. Unlike a query or path, a fragment is not included in the initial HTTP request to GitHub Pages. The compact format also loads the real page with HTTP 200 instead of relying on the custom 404 bridge.

## How it works

GitHub Pages cannot proxy traffic: it only serves static HTML, CSS, and JavaScript. A plain `<img src="https://i.imgur.com/...">` would still contact Imgur from the visitor's connection.

This portal instead:

1. validates and normalizes an exact Imgur host and direct-image ID;
2. sends a tiny image Markdown document to GitHub's public Markdown REST endpoint;
3. verifies the returned URL is an exact `camo.githubusercontent.com` URL for the requested source;
4. displays the Camo response without inserting GitHub's returned HTML into the page.

No API key is stored in the site. GitHub's unauthenticated REST limit is currently 60 requests per originating IP per hour, and Camo is a best-effort cache rather than a service-level guarantee. Source-to-relay mappings are stored in the tab's `sessionStorage`; browser session restore behavior varies, and GitHub, Camo, and browser logs or caches may persist independently.

## Local development

Requirements: Node.js 24+ and any static HTTP server.

```powershell
npm test
npm run check
npm run test:live
python -m http.server 4173 --directory site
```

Then open `http://localhost:4173/`.

`npm test` is entirely local. `npm run test:live` checks that Camo can return both a known public JPEG and a small GIF with the expected content types and file signatures.

## Deployment

GitHub Pages publishes `site/` through `.github/workflows/deploy-pages.yml` after changes reach `main`. The workflow also supports a manual run from the Actions tab and refuses to publish from a private repository or a non-`main` ref.

Review Imgur's current terms, GitHub's terms and limits, and any rights or regulatory obligations that apply to the intended audience and content. Do not use this to relay content you are not permitted to access or share.

## Privacy and security

- No project-operated analytics, cookies, accounts, uploads, search index, or server-side submission database.
- The current tab keeps source-to-relay mappings in `sessionStorage` to avoid spending another API request on every reload. GitHub still logs ordinary Pages/API requests, including visitor IP addresses, and GitHub, Camo, and browsers may cache requests or images.
- Share links use compact URL fragments by default.
- GitHub still receives the Markdown API request and the Camo image request. A Camo URL is not secret; anyone who has it can view the relayed image.
- Input is limited to exact Imgur hostnames, HTTPS media URLs, conservative image IDs, and supported extensions. Credentials, custom ports, deceptive subdomains, and arbitrary proxy targets are rejected.
- Returned HTML is never rendered. The app extracts and verifies the Camo URL before assigning it to an image element.
- **Try direct** intentionally contacts Imgur from the visitor's browser and may use applicable Imgur cookies. It is expected to fail where Imgur is unavailable.

This independent utility is not affiliated with, endorsed by, or operated by Imgur or GitHub.
