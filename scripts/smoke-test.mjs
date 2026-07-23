import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as duckdb from "@duckdb/duckdb-wasm";
import Worker from "web-worker";

const demoRoot = fileURLToPath(new URL("../", import.meta.url));
const bundle = {
  eh: {
    mainModule: fileURLToPath(
      import.meta.resolve("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm")
    ),
    mainWorker: import.meta.resolve(
      "@duckdb/duckdb-wasm/dist/duckdb-node-eh.worker.cjs"
    )
  }
};

const worker = new Worker(bundle.eh.mainWorker);
const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);

try {
  await db.instantiate(bundle.eh.mainModule);
  await db.open({ allowUnsignedExtensions: true });
  const connection = await db.connect();
  try {
    await connection.query(
      "SET custom_extension_repository = 'http://127.0.0.1:5173/duckdb-wasm'"
    );
    await connection.query("LOAD duckgql");
    const version = await connection.query("SELECT version()");
    console.log(version.toString());
    await db.registerFileBuffer(
      "air-routes-nodes.csv",
      new Uint8Array(
        readFileSync(`${demoRoot}public/data/air-routes/nodes.csv`)
      )
    );
    await db.registerFileBuffer(
      "air-routes-edges.csv",
      new Uint8Array(
        readFileSync(`${demoRoot}public/data/air-routes/edges.csv`)
      )
    );
    await connection.query("CREATE GRAPH air_routes ANY");
    await connection.query(`
      COPY GRAPH air_routes FROM (
          VERTICES 'air-routes-nodes.csv',
          EDGES 'air-routes-edges.csv'
      ) FORMAT GRAPH
    `);
    await connection.query("SESSION SET GRAPH air_routes");
    const sampleRoute = await connection.query(`
      MATCH (origin:airport)-[route:route]->(destination:airport)
      WHERE origin.code = 'ATL'
      RETURN origin.code AS origin,
             destination.code AS destination,
             route.dist AS miles
      LIMIT 10
    `);
    console.log(sampleRoute.toString());
    await connection.query("CALL gql_build_csr('air_routes')");
    const pageRank = await connection.query(`
      CALL algo.pagerank(
          'air_routes',
          damping := 0.85,
          max_iterations := 100,
          tolerance := 1e-8
      )
      YIELD vertex_id, rank
      RETURN vertex_id, rank
      ORDER BY rank DESC
      LIMIT 1
    `);
    console.log(pageRank.toString());
  } finally {
    await connection.close();
  }
} finally {
  await db.terminate();
}
