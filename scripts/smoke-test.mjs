import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as duckdb from "@duckdb/duckdb-wasm";
import Worker from "web-worker";

const demoRoot = fileURLToPath(new URL("../", import.meta.url));
const bundle = {
  eh: {
    mainModule: fileURLToPath(
      new URL(
        "../public/duckdb-wasm-runtime/v1.5.5/duckdb-eh.wasm",
        import.meta.url
      )
    ),
    mainWorker: new URL(
      "./runtime/v1.5.5/duckdb-node-eh.worker.cjs",
      import.meta.url
    ).href
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
    await connection.query(`
      DROP GRAPH IF EXISTS mobile_editor_smoke;
      CREATE GRAPH mobile_editor_smoke ANY;
    `);
    await connection.query("DROP GRAPH mobile_editor_smoke");
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
    const moreQueries = [
      `
        MATCH (origin:airport)-[route:route]->(destination:airport)
        WHERE origin.code = 'ATL'
        RETURN destination.code AS destination,
               destination.city AS city,
               route.dist AS miles
        ORDER BY miles DESC
        LIMIT 10
      `,
      `
        MATCH (origin:airport)-[route:route]->(destination:airport)
        WHERE origin.country = 'US' AND destination.country = 'JP'
        RETURN origin.code AS origin,
               destination.code AS destination,
               route.dist AS miles
        ORDER BY miles DESC
        LIMIT 10
      `,
      `
        MATCH (origin:airport)-[:route]->(connection:airport)-[:route]->(destination:airport)
        WHERE origin.code = 'ATL' AND destination.code = 'LHR'
        RETURN connection.code AS connection,
               connection.city AS city
        ORDER BY connection
        LIMIT 20
      `,
      `
        MATCH (origin:airport)-[:route]->(destination:airport)
        RETURN origin.code AS airport,
               COUNT(*) AS outbound_routes
        GROUP BY origin
        ORDER BY outbound_routes DESC
        LIMIT 10
      `
    ];
    for (const query of moreQueries) {
      const result = await connection.query(query);
      console.log(result.toString());
    }
    await connection.query("CALL gql_build_csr('air_routes')");
    const pageRank = await connection.query(`
      CALL algo.pagerank(
          'air_routes',
          damping := 0.85,
          max_iterations := 100,
          tolerance := 1e-8
      )
      YIELD code, city, country, rank
      RETURN code, city, country, rank
      ORDER BY rank DESC
      LIMIT 10
    `);
    console.log(pageRank.toString());
    const degree = await connection.query(`
      CALL algo.degree(
          'air_routes',
          vertex_label := 'airport'
      )
      YIELD code, city, country, out_degree, in_degree, total_degree
      RETURN code, city, country, out_degree, in_degree, total_degree
      ORDER BY total_degree DESC, code ASC
      LIMIT 10
    `);
    console.log(degree.toString());
    const triangles = await connection.query(`
      CALL algo.triangle_count(
          'air_routes',
          vertex_label := 'airport'
      )
      YIELD code, city, country, triangle_count, degree, local_clustering_coefficient
      RETURN code, city, country, triangle_count, degree, local_clustering_coefficient
      ORDER BY triangle_count DESC, code ASC
      LIMIT 10
    `);
    console.log(triangles.toString());
    const stronglyConnected = await connection.query(`
      CALL algo.scc(
          'air_routes',
          vertex_label := 'airport'
      )
      YIELD code, city, country, component_id, component_size
      RETURN code, city, country, component_id, component_size
      ORDER BY component_size ASC, code ASC
      LIMIT 20
    `);
    console.log(stronglyConnected.toString());
  } finally {
    await connection.close();
  }
} finally {
  await db.terminate();
}
