# DuckGQL browser playground

A static DuckDB-Wasm shell that loads the DuckGQL WebAssembly extension and a
small example graph entirely in the browser.

The runtime and extension both use the WebAssembly exception-handling (`eh`)
build so C++ exceptions cross the extension boundary correctly.

Desktop browsers use the embedded terminal. On narrow screens and coarse
pointer devices, the playground switches to a mobile query editor with direct
execution and inline results so virtual-keyboard autocorrection and terminal
IME behavior cannot corrupt SQL input.

## Run locally

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:5173>.

The browser runtime and DuckGQL extension both target DuckDB `v1.5.5`.
The matching exception-handling DuckDB-Wasm runtime is vendored under
`public/duckdb-wasm-runtime/v1.5.5/`. The JavaScript API remains pinned to
`1.33.1-dev61.0` until the DuckDB-Wasm package containing the v1.5.5 runtime is
published.

## Production build

```sh
npm run build
npm run preview
```

The static output is written to `dist/`. The browser playground is emitted at
the site root and the documentation site is emitted under `dist/docs/`.

## Documentation

Documentation is written in Markdown under `docs/` and built with VitePress.
Run the docs-only development server while writing:

```sh
npm run docs:dev
```

Build or preview only the documentation:

```sh
npm run docs:build
npm run docs:preview
```

The production URL is <https://duckgql.com/docs/>. Navigation and sidebar
entries live in `docs/.vitepress/config.ts`; colors and typography live in
`docs/.vitepress/theme/custom.css`.

The GitHub Pages workflow runs the combined `npm run build` command and uploads
all of `dist/`, so the playground and documentation are deployed atomically.
The custom domain is configured in the repository's GitHub Pages settings.

## Analytics

The deployed site supports privacy-friendly Umami analytics. Create a website
for `duckgql.com` in Umami, then add this GitHub repository variable:

- `UMAMI_WEBSITE_ID`: the website ID shown by Umami

Umami Cloud uses `https://cloud.umami.is/script.js` by default. For a
self-hosted instance, also set `UMAMI_SCRIPT_URL` to its tracker script URL.
Without `UMAMI_WEBSITE_ID`, analytics is disabled.

The integration records page views and anonymous interaction events such as
playground startup, demo-step selection, query copying, and outbound link
clicks. It never sends SQL text, graph data, email addresses, or other visitor
identifiers.

## Refresh the DuckGQL Wasm artifact

```sh
gh run download 30325524028 \
  --repo rahul-iyer/duckdb-gql \
  --name duckgql-v1.5.5-extension-wasm_eh \
  --dir public
cp public/duckgql.duckdb_extension.wasm \
  public/duckdb-wasm/v1.5.5/wasm_eh/duckgql.duckdb_extension.wasm
```

DuckDB extensions are version-specific. Update the pinned DuckDB-Wasm packages
and the extension artifact together.
