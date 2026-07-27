# Indexes and optimization

DuckGQL keeps point lookups fast without requiring a second authoritative
graph store. The graph optimizer chooses among native scans, property indexes,
label postings from a current CSR snapshot, and selective CSR expansion.

## Create a property index

```sql
CALL gql_create_property_index('social', 'id');
SELECT * FROM gql_property_indexes();
```

The index is a native DuckDB ART index over the typed property column. DuckDB
maintains it for both direct SQL and GQL writes.

```sql
MATCH (person:Person)
WHERE person.id = 123
RETURN person.name;
```

The index is graph-wide. DuckGQL obtains indexed candidates and then applies
the requested labels, so labels that share a property value remain correct.

## Drop a property index

```sql
CALL gql_drop_property_index('social', 'id');
```

## Labels and relationship types

Nodes retain their native `VARCHAR[]` label set. Label membership is expressed
with DuckDB's list operation:

```sql
SELECT *
FROM gql_data.graph_1_vertices
WHERE list_contains(labels, 'Person');
```

For broad scans this remains vectorized; for selective label access a current
CSR snapshot can provide label posting lists. Each edge has one scalar,
immutable relationship type, which keeps type filtering and fanout statistics
simple.

## CSR is optional for queries

Property indexes work without CSR. If a current CSR snapshot exists, an
indexed endpoint can seed selective fixed-hop expansion. Otherwise the same
query falls back to native scans and joins.

Graph algorithms are different: they require CSR explicitly.
