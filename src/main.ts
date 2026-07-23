import * as duckdb from "@duckdb/duckdb-wasm";
import * as shell from "@duckdb/duckdb-wasm-shell";
import duckdbEhWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbEhWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import shellWasm from "@duckdb/duckdb-wasm-shell/dist/shell_bg.wasm?url";
import "xterm/css/xterm.css";
import "./styles.css";

const CREATE_GRAPH_QUERY = `DROP GRAPH IF EXISTS air_routes;
CREATE GRAPH air_routes ANY;`;

const LOAD_GRAPH_QUERY = `COPY GRAPH air_routes FROM (
    VERTICES 'air-routes-nodes.csv',
    EDGES 'air-routes-edges.csv'
) FORMAT GRAPH;

SESSION SET GRAPH air_routes;`;

const MATCH_QUERY = `MATCH (origin:airport)-[route:route]->(destination:airport)
WHERE origin.code = 'ATL'
RETURN origin.code AS origin,
       destination.code AS destination,
       route.dist AS miles
LIMIT 10;`;

const BUILD_CSR_QUERY = `CALL gql_build_csr('air_routes');`;

const PAGERANK_QUERY = `CALL algo.pagerank(
    'air_routes',
    damping := 0.85,
    max_iterations := 100,
    tolerance := 1e-8
)
YIELD vertex_id, rank
RETURN vertex_id, rank
ORDER BY rank DESC
LIMIT 10;`;

type DemoStep = {
  button: HTMLButtonElement;
  label: string;
  query: string;
  prepare?: () => Promise<void>;
};

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`The playground document is missing ${selector}.`);
  }
  return element;
}

const statusText = requiredElement<HTMLSpanElement>("#status-text");
const statusDot = requiredElement<HTMLSpanElement>("#status-dot");
const shellContainer = requiredElement<HTMLDivElement>("#shell");
const startupError = requiredElement<HTMLDivElement>("#startup-error");
const errorDetail = requiredElement<HTMLPreElement>("#error-detail");
const copyButton = requiredElement<HTMLButtonElement>("#copy-query");
const copyLabel = requiredElement<HTMLSpanElement>("#copy-label");
const sampleQuery = requiredElement<HTMLElement>("#sample-query");
const consolePanel = requiredElement<HTMLElement>("#console");
const consoleActionHelp =
  requiredElement<HTMLSpanElement>("#console-action-help");
const createGraphButton =
  requiredElement<HTMLButtonElement>("#create-graph-step");
const loadGraphButton =
  requiredElement<HTMLButtonElement>("#load-graph-step");
const matchQueryButton =
  requiredElement<HTMLButtonElement>("#match-query-step");
const buildCsrButton =
  requiredElement<HTMLButtonElement>("#build-csr-step");
const algorithmQueryButton = requiredElement<HTMLButtonElement>(
  "#algorithm-query-step"
);
const moreQueriesButton =
  requiredElement<HTMLButtonElement>("#more-queries-step");
const queryLibrary = requiredElement<HTMLElement>("#more-queries");
const selectedStepLabel =
  requiredElement<HTMLSpanElement>("#selected-step-label");
const selectedStepQuery =
  requiredElement<HTMLElement>("#selected-step-query");
const selectedStepCopyButton =
  requiredElement<HTMLButtonElement>("#copy-selected-step");
const selectedStepCopyLabel =
  requiredElement<HTMLSpanElement>("#selected-step-copy-label");
const selectedStepCopyStatus =
  requiredElement<HTMLSpanElement>("#selected-step-copy-status");
const sampleResult = requiredElement<HTMLSpanElement>("#sample-result");

const demoStepButtons = [
  createGraphButton,
  loadGraphButton,
  matchQueryButton,
  buildCsrButton,
  algorithmQueryButton,
  moreQueriesButton
];

let activeDatabase: duckdb.AsyncDuckDB | null = null;
let airRoutesFilesRegistered = false;

function setStatus(message: string, state: "loading" | "ready" | "error") {
  statusText.textContent = message;
  statusDot.className = `status-dot is-${state}`;
  consolePanel.dataset.state = state;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function focusShellInput(): void {
  shellContainer
    .querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")
    ?.focus({ preventScroll: true });
}

async function loadDuckGql(db: duckdb.AsyncDuckDB): Promise<void> {
  const repositoryUrl = new URL(
    `${import.meta.env.BASE_URL}duckdb-wasm/`,
    window.location.href
  ).href.replace(/\/$/, "");
  const quotedRepositoryUrl = repositoryUrl.replaceAll("'", "''");

  const connection = await db.connect();
  try {
    await connection.query(
      `SET custom_extension_repository = '${quotedRepositoryUrl}'`
    );
    await connection.query("LOAD duckgql");
  } finally {
    await connection.close();
  }
}

async function fetchDatasetFile(fileName: string): Promise<Uint8Array> {
  const dataUrl = new URL(
    `${import.meta.env.BASE_URL}data/air-routes/${fileName}`,
    window.location.href
  );
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(
      `Could not download ${fileName}: ${response.status} ${response.statusText}`
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function registerAirRoutesFiles(db: duckdb.AsyncDuckDB): Promise<void> {
  if (airRoutesFilesRegistered) {
    return;
  }
  const [nodes, edges] = await Promise.all([
    fetchDatasetFile("nodes.csv"),
    fetchDatasetFile("edges.csv")
  ]);

  await Promise.all([
    db.registerFileBuffer("air-routes-nodes.csv", nodes),
    db.registerFileBuffer("air-routes-edges.csv", edges)
  ]);
  airRoutesFilesRegistered = true;
}

async function startPlayground(): Promise<void> {
  setStatus("Loading DuckDB-Wasm…", "loading");

  const worker = new Worker(duckdbEhWorker);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(duckdbEhWasm);
  await db.open({
    allowUnsignedExtensions: true,
    query: {
      castBigIntToDouble: false
    }
  });

  setStatus("Loading DuckGQL…", "loading");
  await loadDuckGql(db);

  await shell.embed({
    shellModule: shellWasm,
    container: shellContainer,
    backgroundColor: "#101719",
    fontFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
    resolveDatabase: async () => db
  });

  activeDatabase = db;
  for (const button of demoStepButtons) {
    button.disabled = false;
  }
  setStatus("Ready", "ready");
  window.requestAnimationFrame(focusShellInput);
}

shellContainer.addEventListener("pointerdown", () => {
  window.requestAnimationFrame(focusShellInput);
});

async function selectDemoStep(step: DemoStep): Promise<void> {
  for (const button of demoStepButtons) {
    button.dataset.state = button === step.button ? "selected" : "";
  }
  selectedStepLabel.textContent = step.label;
  selectedStepQuery.textContent = step.query;
  selectedStepCopyLabel.textContent = "Copy command";
  selectedStepCopyStatus.textContent = "Ready to copy";

  try {
    if (step.prepare) {
      step.button.disabled = true;
      consoleActionHelp.textContent = "Mounting the bundled CSV files…";
      sampleResult.textContent = "Preparing air-routes files for DuckDB-Wasm";
      await step.prepare();
      step.button.disabled = false;
    }
    consoleActionHelp.textContent =
      "Command selected — use Copy command when you are ready";
    sampleResult.textContent = `${step.label} selected`;
  } catch (error: unknown) {
    step.button.disabled = false;
    consoleActionHelp.textContent = "Could not prepare this demo step";
    sampleResult.textContent = formatError(error);
  }
}

const demoSteps: DemoStep[] = [
  {
    button: createGraphButton,
    label: "1 · Create graph",
    query: CREATE_GRAPH_QUERY
  },
  {
    button: loadGraphButton,
    label: "2 · Load graph",
    query: LOAD_GRAPH_QUERY,
    prepare: async () => {
      if (!activeDatabase) {
        throw new Error("DuckDB-Wasm is not ready.");
      }
      await registerAirRoutesFiles(activeDatabase);
    }
  },
  {
    button: matchQueryButton,
    label: "3 · Run MATCH query",
    query: MATCH_QUERY
  },
  {
    button: buildCsrButton,
    label: "4 · Build CSR",
    query: BUILD_CSR_QUERY
  },
  {
    button: algorithmQueryButton,
    label: "5 · Run PageRank",
    query: PAGERANK_QUERY
  }
];

for (const step of demoSteps) {
  step.button.addEventListener("click", () => {
    void selectDemoStep(step);
  });
}

function revealMoreQueries(scroll: boolean): void {
  for (const button of demoStepButtons) {
    button.dataset.state = button === moreQueriesButton ? "selected" : "";
  }
  queryLibrary.hidden = false;
  moreQueriesButton.setAttribute("aria-expanded", "true");
  consoleActionHelp.textContent =
    "More Air Routes examples are ready below";
  sampleResult.textContent = "Choose a query and use its Copy button";

  if (scroll) {
    window.requestAnimationFrame(() => {
      queryLibrary.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

moreQueriesButton.addEventListener("click", () => {
  revealMoreQueries(true);
});

if (
  window.location.hash === "#more-queries" ||
  window.location.hash === "#more-queries-title"
) {
  revealMoreQueries(false);
}

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-copy-query]"
)) {
  button.addEventListener("click", async () => {
    const queryId = button.dataset.copyQuery;
    const query = queryId ? document.getElementById(queryId) : null;
    const label = button.querySelector<HTMLSpanElement>("span");
    if (!query || !label) {
      return;
    }

    try {
      await navigator.clipboard.writeText(query.textContent ?? "");
      label.textContent = "Copied";
      sampleResult.textContent = "Air Routes query copied to clipboard";
      window.requestAnimationFrame(focusShellInput);
      window.setTimeout(() => {
        label.textContent = "Copy";
      }, 1400);
    } catch (error: unknown) {
      label.textContent = "Copy failed";
      sampleResult.textContent = formatError(error);
    }
  });
}

selectedStepCopyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(selectedStepQuery.textContent ?? "");
    selectedStepCopyLabel.textContent = "Copied";
    selectedStepCopyStatus.textContent = "Paste into the terminal";
    consoleActionHelp.textContent =
      "SQL copied — paste it into the terminal and press Enter";
    sampleResult.textContent =
      `${selectedStepLabel.textContent ?? "Selected step"} SQL copied to clipboard`;
    window.requestAnimationFrame(focusShellInput);
    window.setTimeout(() => {
      selectedStepCopyLabel.textContent = "Copy command";
    }, 1400);
  } catch (error: unknown) {
    selectedStepCopyStatus.textContent = "Copy failed";
    consoleActionHelp.textContent =
      "Select the SQL shown below and copy it manually";
    sampleResult.textContent = formatError(error);
  }
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(sampleQuery.textContent ?? "");
  copyLabel.textContent = "Copied";
  window.setTimeout(() => {
    copyLabel.textContent = "Copy";
  }, 1400);
});

startPlayground().catch((error: unknown) => {
  console.error(error);
  setStatus("Startup failed", "error");
  shellContainer.hidden = true;
  startupError.hidden = false;
  errorDetail.textContent = formatError(error);
});
