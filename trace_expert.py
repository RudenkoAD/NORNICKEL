import sys
sys.path.insert(0, r'C:\Users\StesNiash\Documents\GitHub\NORNICKEL\backend')
from app.config import get_settings
from app.db.neo4j_client import Neo4jClient

s = get_settings()
c = Neo4jClient(s)

# Check actual properties of Трофимов
rows = c.read("""
    MATCH (e:Expert)
    WHERE e.name_ru CONTAINS 'Трофим'
    RETURN e.name_ru AS name, e.expert_id AS eid, e.canonical_id AS cid, 
           e.aliases AS aliases, e.unresolved AS unr, keys(e) AS all_keys
""")
print("=== Expert Трофимов properties ===")
for r in rows:
    print(f"  name: {r['name']}")
    print(f"  expert_id: {r['eid']}")
    print(f"  canonical_id: {r['cid']}")
    print(f"  aliases: {r['aliases']}")
    print(f"  unresolved: {r['unr']}")
    print(f"  all keys: {r['all_keys']}")
    print()

# Check if expert_id is in the fulltext index
rows2 = c.read("""
    CALL db.index.fulltext.queryNodes("entity_names", "Трофим")
    YIELD node, score
    RETURN labels(node)[0] AS label, coalesce(node.name_ru, node.name_en, node.name) AS name,
           node.expert_id AS eid, score
    LIMIT 10
""")
print("=== Fulltext search 'Трофим' ===")
for r in rows2:
    print(f"  {r['label']}: {r['name']} (expert_id={r['eid']}, score={r['score']})")

c.close()
