# GQL surface

This page is a practical summary, not a claim of full ISO GQL conformance.

## Graph lifecycle

```sql
CREATE GRAPH graph_name ANY;
COPY GRAPH graph_name FROM (
    VERTICES 'nodes.csv',
    EDGES 'relationships.csv'
) FORMAT GRAPH;
SESSION SET GRAPH graph_name;
DROP GRAPH graph_name;
```

## Query clauses

The implemented surface includes directed `MATCH`, `OPTIONAL MATCH`, `WHERE`,
`RETURN`, projection, aggregation, `GROUP BY`, `DISTINCT`, `ORDER BY`,
`LIMIT`, and paging. Fixed multi-hop paths and a bounded variable-length
subset are supported.

```sql
MATCH (a:Person)-[e:KNOWS]->(b:Person)
WHERE a.active = true
RETURN DISTINCT a.name, b.name, e.since
ORDER BY e.since DESC
LIMIT 20;
```

## Mutations

The implemented mutation subset includes standalone node and directed-path
`INSERT`, fixed directed `MATCH`-and-`INSERT`, property `SET` and `REMOVE`,
and edge or node deletion.

Mutation support is narrower than query support. Test the exact statement
shape you plan to use and consult the machine-readable conformance manifest.

## Procedures

```sql
SELECT * FROM gql_graphs();
SELECT * FROM gql_property_indexes();

CALL gql_create_property_index('social', 'id');
CALL gql_drop_property_index('social', 'id');

CALL gql_build_csr('social');
CALL gql_neighbors('social', 1, 'out');
SELECT * FROM gql_csr_stats('social');
SELECT * FROM gql_csr_edge_stats('social');
```

Algorithm procedures are documented in [CSR and algorithms](../guides/csr-and-algorithms.md).

## Plans

`EXPLAIN`, `EXPLAIN ANALYZE`, and `EXPLAIN (FORMAT JSON)` can prefix supported
GQL queries and procedure pipelines.
