# Graph lifecycle and import

DuckGQL manages typed vertex and edge tables inside DuckDB. Those tables are
the authoritative graph storage.

## Create a graph

```sql
CREATE GRAPH social ANY;
```

## Import graph-header files

```sql
COPY GRAPH social FROM (
    VERTICES 'nodes.parquet',
    EDGES 'relationships.parquet'
) FORMAT GRAPH;
```

`COPY GRAPH` accepts `.csv`, `.csv.gz`, `.csv.zst`, and `.parquet`. Validation
rejects duplicate or missing vertex IDs and edges with missing endpoints.
Trusted inputs can skip those validation scans:

```sql
COPY GRAPH social FROM (
    VERTICES 'nodes.parquet',
    EDGES 'relationships.parquet'
) FORMAT GRAPH OPTIONS (VALIDATE FALSE);
```

Current bulk import accepts one vertex file and one edge file. Vertices can
retain multiple labels in their native `VARCHAR[]` label column. Every edge
must have exactly one non-empty relationship type.

## Select a graph

Select the graph used by subsequent `MATCH` statements:

```sql
SESSION SET GRAPH social;
```

## Drop a graph

```sql
DROP GRAPH social;
```

Dropping a graph removes its metadata and managed vertex and edge tables.

## Transaction rules

`CREATE GRAPH`, `DROP GRAPH`, and full-load `COPY GRAPH` are lifecycle
operations and must run in autocommit mode. `COPY GRAPH` requires an empty
graph. Graph queries and supported mutations can participate in a
caller-controlled DuckDB transaction.

## Storage layout

```text
gql_data.graph_<id>_vertices   typed vertex properties and labels
gql_data.graph_<id>_edges      typed edge properties, types, and endpoints
gql_internal.*                 graph catalog and column mappings
```

Properties remain typed columns rather than entity-attribute-value rows.
