# CSR and algorithms

DuckDB tables remain authoritative. DuckGQL builds an explicit,
connection-local CSR snapshot when you want graph algorithms or selective
adjacency access.

## Build the snapshot

```sql
CALL gql_build_csr('social');
```

CSR construction must run in autocommit mode.

## Run algorithms

```sql
CALL algo.bfs('social', 1, direction := 'out', max_depth := 4);
```

```sql
CALL algo.pagerank(
    'social',
    damping := 0.85,
    max_iterations := 100,
    tolerance := 1e-8
)
YIELD vertex_id, rank
RETURN vertex_id, rank
ORDER BY rank DESC
LIMIT 10;
```

Implemented algorithm families include BFS, DFS, unweighted SSSP, PageRank,
weak and strong components, degree, closeness, local clustering coefficient,
and triangle counting. Weighted SSSP is not implemented.

## Inspect adjacency and statistics

```sql
CALL gql_neighbors('social', 1, 'out');
SELECT * FROM gql_csr_stats('social');
SELECT * FROM gql_csr_edge_stats('social');
```

Edge statistics include per-type counts, active source and target counts,
average directional degree, and maximum directional degree. The optimizer uses
them to compare a selective CSR frontier with a bulk edge-table scan.

## Snapshot invalidation

Graph mutations and direct SQL writes to managed graph tables invalidate the
affected snapshot. Rebuild it before the next algorithm call:

```sql
CALL gql_build_csr('social');
```

DuckGQL version-checks snapshots rather than allowing an algorithm to consume
stale topology.
