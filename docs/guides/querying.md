# Querying graphs

DuckGQL lowers graph operations into DuckDB plans, so projection, filtering,
joins, sorting, and aggregation use DuckDB's execution engine.

## Match a directed relationship

```sql
MATCH (person:Person)-[relationship:KNOWS]->(friend:Person)
WHERE person.name = 'Ada'
RETURN friend.name,
       relationship.since
ORDER BY relationship.since DESC
LIMIT 20;
```

## Aggregate

```sql
MATCH (person:Person)-[:KNOWS]->(friend:Person)
RETURN person.name,
       COUNT(*) AS friend_count
GROUP BY person
ORDER BY friend_count DESC;
```

## Optional patterns

```sql
MATCH (person:Person)
OPTIONAL MATCH (person)-[:KNOWS]->(friend:Person)
RETURN person.name,
       friend.name;
```

## Fixed and bounded paths

```sql
MATCH (source:Person)-[:KNOWS]->(middle:Person)-[:KNOWS]->(target:Person)
WHERE source.id = 123
RETURN target.name;
```

```sql
MATCH (source:Person)-[:KNOWS]->{1,3}(target:Person)
WHERE source.id = 123
RETURN DISTINCT target.name
ORDER BY target.name
LIMIT 20;
```

Path search and composition support is still partial. Review
[compatibility and limitations](../reference/limitations.md) before designing
around advanced ISO GQL path features.

## Explain a query

```sql
EXPLAIN MATCH (person:Person)
WHERE person.age >= 35
RETURN person.name;

EXPLAIN ANALYZE MATCH (person:Person)
RETURN person.name;

EXPLAIN (FORMAT JSON) MATCH (person:Person)
RETURN person.name;
```

DuckGQL first selects graph-specific access paths. DuckDB then costs and
executes the resulting relational plan.
