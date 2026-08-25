# Imgur Image Portal

A small, privacy-minded GitHub Pages viewer for direct Imgur images. It accepts an Imgur URL, asks GitHub's Markdown API for an anonymized [Camo](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-anonymized-urls) URL, and displays the image through that relay.

The repository is intentionally private and Pages is not enabled yet. A normal personal GitHub Pages deployment is public even when its source repository is private, and GitHub Free only supports Pages from public repositories. Review the launch notes below before publishing.

## Supported links

- Direct images: `https://i.imgur.com/AbCdE12.jpg`
- Simple single-image pages: `https://imgur.com/AbCdE12`
- JPEG, PNG, GIF, and WebP images

Albums, gallery posts, profile links, SVG, and video formats are rejected deliberately. Resolving them would require scraping or a separate metadata service, which is outside this portal's narrow scope.

Once deployed at `https://paradoxgods.github.io/imgur-redirect/`, links can be opened in three ways:

```text
# Recommended: the Imgur URL stays in the browser fragment
https://paradoxgods.github.io/imgur-redirect/#url=https%3A%2F%2Fi.imgur.com%2FAbCdE12.jpg

# Also accepted
https://paradoxgods.github.io/imgur-redirect/?url=https%3A%2F%2Fi.imgur.com%2FAbCdE12.jpg

# Short direct-image route (handled by 404.html)
https://paradoxgods.github.io/imgur-redirect/i/AbCdE12.jpg
```

The app converts query links to the fragment form after validation. Unlike a query or path, a fragment is not included in the initial HTTP request to GitHub Pages.

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

`npm test` is entirely local. `npm run test:live` makes one request to GitHub's Markdown API and checks that Camo can return a known public Imgur image.

## Publishing checklist

1. Review Imgur's current terms, GitHub's terms and limits, and any rights or regulatory obligations that apply to the intended audience and content. Do not use this to relay content you are not permitted to access or share.
2. Merge the feature branch into `main`.
3. Change the repository visibility to public. The included workflow deliberately skips every private repository, even on plans that otherwise support private-source Pages.
4. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
5. Run **Deploy GitHub Pages** from the Actions tab. Future pushes to `main` will redeploy while the repository is public.

The deployment workflow refuses to publish while the repository is private. This avoids accidentally creating a public Pages site during private development.

## Privacy and security

- No project-operated analytics, cookies, accounts, uploads, search index, or server-side submission database.
- The current tab keeps source-to-relay mappings in `sessionStorage` to avoid spending another API request on every reload. GitHub still logs ordinary Pages/API requests, including visitor IP addresses, and GitHub, Camo, and browsers may cache requests or images.
- Share links use URL fragments by default.
- GitHub still receives the Markdown API request and the Camo image request. A Camo URL is not secret; anyone who has it can view the relayed image.
- Input is limited to exact Imgur hostnames, HTTPS media URLs, conservative image IDs, and supported extensions. Credentials, custom ports, deceptive subdomains, and arbitrary proxy targets are rejected.
- Returned HTML is never rendered. The app extracts and verifies the Camo URL before assigning it to an image element.
- **Try direct** and **Original via Imgur** intentionally contact Imgur from the visitor's browser and may use applicable Imgur cookies. They are expected to fail where Imgur is unavailable.

This independent utility is not affiliated with, endorsed by, or operated by Imgur or GitHub.
