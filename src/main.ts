import * as duckdb from "@duckdb/duckdb-wasm";
import * as shell from "@duckdb/duckdb-wasm-shell";
import shellWasm from "@duckdb/duckdb-wasm-shell/dist/shell_bg.wasm?url";
import "xterm/css/xterm.css";
import { initializeAnalytics, trackEvent } from "./analytics";
import "./styles.css";

initializeAnalytics();

const publicBaseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
const duckdbEhWasm = new URL(
  "duckdb-wasm-runtime/v1.5.5/duckdb-eh.wasm",
  publicBaseUrl
).href;
const duckdbEhWorker = new URL(
  "duckdb-wasm-runtime/v1.5.5/duckdb-browser-eh.worker.js",
  publicBaseUrl
).href;
const mobileWorkspaceMedia = window.matchMedia(
  "(max-width: 720px), (hover: none) and (pointer: coarse)"
);

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
YIELD code, city, country, rank
RETURN code, city, country, rank
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
const mobileQueryEditor =
  requiredElement<HTMLTextAreaElement>("#mobile-query-editor");
const mobileQueryRunButton =
  requiredElement<HTMLButtonElement>("#run-mobile-query");
const mobileQueryClearButton =
  requiredElement<HTMLButtonElement>("#clear-mobile-query");
const mobileQueryStatus =
  requiredElement<HTMLSpanElement>("#mobile-query-status");
const mobileQueryResult =
  requiredElement<HTMLDivElement>("#mobile-query-result");
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
let mobileConnection: duckdb.AsyncDuckDBConnection | null = null;
let airRoutesFilesRegistered = false;
const MAX_MOBILE_RESULT_ROWS = 200;

type QueryResult = Awaited<
  ReturnType<duckdb.AsyncDuckDBConnection["query"]>
>;

function setStatus(message: string, state: "loading" | "ready" | "error") {
  statusText.textContent = message;
  statusDot.className = `status-dot is-${state}`;
  consolePanel.dataset.state = state;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function focusShellInput(): void {
  if (mobileWorkspaceMedia.matches) {
    return;
  }
  const textarea =
    shellContainer.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
  if (!textarea) {
    return;
  }
  textarea.autocapitalize = "off";
  textarea.autocomplete = "off";
  textarea.setAttribute("autocorrect", "off");
  textarea.spellcheck = false;
  textarea.focus({ preventScroll: true });
}

function installShellViewportHandling(): void {
  const resizeShell = () => {
    const rect = shellContainer.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      shellContainer.onresize?.(new UIEvent("resize"));
    }
  };
  const resizeObserver = new ResizeObserver(resizeShell);
  resizeObserver.observe(shellContainer);
  window.visualViewport?.addEventListener("resize", resizeShell);
  window.visualViewport?.addEventListener("scroll", resizeShell);
  window.addEventListener("orientationchange", resizeShell);
  resizeShell();
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Uint8Array) {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, (_key, nestedValue) =>
        typeof nestedValue === "bigint"
          ? nestedValue.toString()
          : nestedValue
      );
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function renderQueryResult(result: QueryResult): void {
  mobileQueryResult.replaceChildren();
  if (result.numRows === 0) {
    mobileQueryResult.dataset.state = "empty";
    mobileQueryResult.textContent = "Query completed successfully.";
    return;
  }

  mobileQueryResult.dataset.state = "table";
  const table = document.createElement("table");
  const caption = document.createElement("caption");
  caption.className = "sr-only";
  caption.textContent = "DuckGQL query results";
  table.append(caption);

  const headerRow = document.createElement("tr");
  for (const field of result.schema.fields) {
    const header = document.createElement("th");
    header.scope = "col";
    header.textContent = field.name;
    headerRow.append(header);
  }
  const tableHead = document.createElement("thead");
  tableHead.append(headerRow);
  table.append(tableHead);

  const tableBody = document.createElement("tbody");
  const renderedRowCount = Math.min(result.numRows, MAX_MOBILE_RESULT_ROWS);
  for (let rowIndex = 0; rowIndex < renderedRowCount; rowIndex += 1) {
    const arrowRow = result.get(rowIndex) as
      | { toJSON(): Record<string, unknown> }
      | null;
    const rowValues = arrowRow?.toJSON() ?? {};
    const tableRow = document.createElement("tr");
    for (const field of result.schema.fields) {
      const value = rowValues[field.name];
      const cell = document.createElement("td");
      cell.textContent = formatCellValue(value);
      if (value === null || value === undefined) {
        cell.dataset.null = "true";
      } else if (typeof value === "number" || typeof value === "bigint") {
        cell.dataset.numeric = "true";
      }
      tableRow.append(cell);
    }
    tableBody.append(tableRow);
  }
  table.append(tableBody);
  mobileQueryResult.append(table);

  if (result.numRows > renderedRowCount) {
    const truncatedNotice = document.createElement("p");
    truncatedNotice.className = "mobile-query-truncated";
    truncatedNotice.textContent =
      `Showing ${renderedRowCount} of ${result.numRows} rows. Add LIMIT to narrow the result.`;
    mobileQueryResult.append(truncatedNotice);
  }
}

async function runMobileQuery(): Promise<void> {
  const query = mobileQueryEditor.value.trim();
  if (!query) {
    mobileQueryStatus.textContent = "Enter a query first";
    mobileQueryEditor.focus();
    return;
  }
  if (!activeDatabase || !mobileConnection) {
    mobileQueryStatus.textContent = "DuckDB is still loading";
    return;
  }

  mobileQueryRunButton.disabled = true;
  mobileQueryEditor.setAttribute("aria-busy", "true");
  mobileQueryStatus.textContent = "Running…";
  mobileQueryResult.dataset.state = "loading";
  mobileQueryResult.textContent = "Running query…";

  try {
    if (/\bCOPY\s+GRAPH\b/i.test(query)) {
      await registerAirRoutesFiles(activeDatabase);
    }
    const result = await mobileConnection.query(query);
    renderQueryResult(result);
    mobileQueryStatus.textContent = `${result.numRows} row${
      result.numRows === 1 ? "" : "s"
    } returned`;
    sampleResult.textContent = "Mobile query completed";
    trackEvent("mobile_query_completed");
  } catch (error: unknown) {
    mobileQueryResult.dataset.state = "error";
    mobileQueryResult.textContent = formatError(error);
    mobileQueryStatus.textContent = "Query failed";
    sampleResult.textContent = "Mobile query failed";
    trackEvent("mobile_query_failed");
  } finally {
    mobileQueryRunButton.disabled = false;
    mobileQueryEditor.removeAttribute("aria-busy");
  }
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

  if (!mobileWorkspaceMedia.matches) {
    await shell.embed({
      shellModule: shellWasm,
      container: shellContainer,
      backgroundColor: "#101719",
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
      resolveDatabase: async () => db
    });
    installShellViewportHandling();
  }

  activeDatabase = db;
  mobileConnection = await db.connect();
  mobileQueryRunButton.disabled = false;
  mobileQueryStatus.textContent = "Ready";
  for (const button of demoStepButtons) {
    button.disabled = false;
  }
  setStatus("Ready", "ready");
  trackEvent("playground_ready");
  window.requestAnimationFrame(focusShellInput);
}

shellContainer.addEventListener("pointerdown", () => {
  focusShellInput();
});

async function selectDemoStep(step: DemoStep): Promise<void> {
  for (const button of demoStepButtons) {
    button.dataset.state = button === step.button ? "selected" : "";
  }
  selectedStepLabel.textContent = step.label;
  selectedStepQuery.textContent = step.query;
  mobileQueryEditor.value = step.query;
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
    trackEvent("demo_step_selected", { step: step.label });
  } catch (error: unknown) {
    step.button.disabled = false;
    consoleActionHelp.textContent = "Could not prepare this demo step";
    sampleResult.textContent = formatError(error);
    trackEvent("demo_step_failed", { step: step.label });
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
  trackEvent("more_queries_opened");
});

mobileQueryRunButton.addEventListener("click", () => {
  void runMobileQuery();
});

mobileQueryClearButton.addEventListener("click", () => {
  mobileQueryEditor.value = "";
  mobileQueryResult.dataset.state = "empty";
  mobileQueryResult.textContent = "Results will appear here.";
  mobileQueryStatus.textContent = "Ready";
  mobileQueryEditor.focus();
});

mobileQueryEditor.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    void runMobileQuery();
  }
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
      if (mobileWorkspaceMedia.matches) {
        mobileQueryEditor.value = query.textContent ?? "";
      }
      label.textContent = "Copied";
      sampleResult.textContent = "Air Routes query copied to clipboard";
      trackEvent("query_copied", { query: queryId ?? "unknown" });
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
    trackEvent("demo_step_copied", {
      step: selectedStepLabel.textContent ?? "unknown"
    });
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
  trackEvent("quick_start_copied");
  window.setTimeout(() => {
    copyLabel.textContent = "Copy";
  }, 1400);
});

startPlayground().catch((error: unknown) => {
  console.error(error);
  trackEvent("playground_startup_failed");
  setStatus("Startup failed", "error");
  shellContainer.hidden = true;
  startupError.hidden = false;
  errorDetail.textContent = formatError(error);
});
