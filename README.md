# DuckGQL browser playground

A static DuckDB-Wasm shell that loads the DuckGQL WebAssembly extension and a
small example graph entirely in the browser.

The runtime and extension both use the WebAssembly exception-handling (`eh`)
build so C++ exceptions cross the extension boundary correctly.

## Run locally

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:5173>.

The demo intentionally pins both DuckDB-Wasm packages to
`1.33.1-dev61.0`. That release uses DuckDB commit
`08e34c447bae34eaee3723cac61f2878b6bdf787`, which matches the DuckDB
`v1.5.4` commit used to compile `public/duckgql.duckdb_extension.wasm`.

## Production build

```sh
npm run build
npm run preview
```

The static output is written to `dist/`.

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
gh run download 29980569141 \
  --repo rahul-iyer/duckdb-gql \
  --name duckgql-v1.5.4-extension-wasm_eh \
  --dir public
```

DuckDB extensions are version-specific. Update the pinned DuckDB-Wasm packages
and the extension artifact together.
