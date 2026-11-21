import type { RequestHandler } from './$types'

const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Jellyfin Downloader API</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#1a1a1a}code,pre{background:#f2f4f7;border-radius:6px}code{padding:.15em .35em}pre{padding:1rem;overflow:auto}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;text-align:left;padding:.45rem}.muted{color:#666}</style>
</head>
<body>
<h1>Jellyfin Downloader API v1</h1>
<p class="muted">Server API without authentication. Protect it with a reverse proxy or VPN. The complete specification is at <a href="/api/v1/openapi.json">/api/v1/openapi.json</a>.</p>
<h2>Flow</h2>
<ol>
<li><code>GET /api/v1/movies</code> to obtain IDs and metadata.</li>
<li><code>GET /api/v1/movies/{id}</code> to inspect sources and tracks.</li>
<li><code>POST /api/v1/downloads</code> to create the job.</li>
<li>Poll <code>GET /api/v1/downloads/{id}</code>.</li>
<li><code>GET /api/v1/downloads/{id}/file</code> when <code>state</code> is <code>ready</code>.</li>
</ol>
<h2>Endpoints</h2>
<table>
<tr><th>Method</th><th>Path</th><th>Description</th></tr>
<tr><td>GET</td><td>/api/v1/health</td><td>App and ffmpeg health</td></tr>
<tr><td>GET</td><td>/api/v1/capabilities</td><td>Containers, codecs and limits</td></tr>
<tr><td>GET</td><td>/api/v1/movies?q=</td><td>List/search</td></tr>
<tr><td>GET</td><td>/api/v1/movies/{id}</td><td>Details and tracks</td></tr>
<tr><td>GET</td><td>/api/v1/artwork/{id}?w=300</td><td>Poster</td></tr>
<tr><td>POST</td><td>/api/v1/downloads</td><td>Create download</td></tr>
<tr><td>GET</td><td>/api/v1/downloads/{id}</td><td>State and progress</td></tr>
<tr><td>GET</td><td>/api/v1/downloads/{id}/file</td><td>Final file; supports Range</td></tr>
<tr><td>DELETE</td><td>/api/v1/downloads/{id}</td><td>Cancel active job</td></tr>
<tr><td>POST</td><td>/api/v1/local-downloads/check</td><td>Check whether it already exists</td></tr>
<tr><td>GET</td><td>/api/v1/settings</td><td>Defaults and presets</td></tr>
</table>
<h2>curl example</h2>
<pre>curl -s http://localhost:3000/api/v1/movies?q=bunny

curl -s -X POST http://localhost:3000/api/v1/downloads \\
  -H 'Content-Type: application/json' \\
  -d '{
    "movieId": "0123456789abcdef0123456789abcdef",
    "preset": "mp4-480p",
    "options": {
      "subtitleStrategy": "muxed",
      "audioPackaging": "mux"
    }
  }'</pre>
<p>The response includes <code>id</code>, <code>statusUrl</code> and, when ready, <code>downloadUrl</code>. The final download is served with <code>Content-Disposition</code> and <code>Range</code> support.</p>
<h2>Packaging modes</h2>
<ul>
<li><strong>Unified:</strong> integrated audio and integrated/burned subtitles. One file.</li>
<li><strong>Hybrid:</strong> integrated audio and separate subtitles. ZIP.</li>
<li><strong>Separate:</strong> separate audio and subtitles. ZIP with a video-only file.</li>
</ul>
<p>Use <code>audioPackaging</code>, <code>subtitleStrategy</code> and <code>subtitlePackaging</code>. The default mirrors the source: external subtitles are separate and embedded subtitles are integrated.</p>
<h2>CORS</h2>
<p>Disabled by default. Set <code>API_CORS_ORIGINS</code> to a comma-separated list if a browser plugin needs to call the API.</p>
</body></html>`

export const GET: RequestHandler = async () => {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}
