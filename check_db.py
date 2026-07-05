import sys
sys.path.insert(0, r'C:\Users\StesNiash\Documents\GitHub\NORNICKEL\backend')
from app.config import get_settings
from app.db.neo4j_client import Neo4jClient

s = get_settings()
c = Neo4jClient(s)
rows = c.read("MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC")
for r in rows:
    print(f"{r['label']}: {r['cnt']}")
c.close()
