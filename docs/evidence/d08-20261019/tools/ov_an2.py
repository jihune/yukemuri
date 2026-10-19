import duckdb
con=duckdb.connect()
f='/tmp/claude-0/-home-user/0c78c19d-a421-5334-ba23-0ecb47664dcc/scratchpad/d08raw/ov_jp_lodging.parquet'
con.execute(f"CREATE VIEW jp AS SELECT * FROM read_parquet('{f}') WHERE addresses[1].country='JP'")
q="""
WITH w AS (SELECT lower(regexp_extract(websites[1], '^https?://(?:www\\.)?([^/]+)', 1)) d FROM jp WHERE len(websites)>0)
SELECT CASE WHEN d LIKE '%facebook.com' THEN 'facebook' WHEN d LIKE '%instagram.com' THEN 'instagram'
 WHEN d LIKE '%jalan.net' THEN 'jalan' WHEN d LIKE '%rakuten%' THEN 'rakuten' WHEN d LIKE '%booking.com' THEN 'booking'
 WHEN d LIKE '%airbnb%' THEN 'airbnb' WHEN d LIKE '%ikyu.com' THEN 'ikyu' WHEN d LIKE '%trip.com' THEN 'trip' WHEN d LIKE '%agoda%' THEN 'agoda'
 WHEN d LIKE '%expedia%' THEN 'expedia' WHEN d LIKE '%line.me' THEN 'line' WHEN d LIKE '%google%' THEN 'google' ELSE 'other(own etc.)' END k, count(*) n
FROM w GROUP BY 1 ORDER BY 2 DESC"""
print(con.execute(q).fetchall())
print('sources update_time range', con.execute("SELECT min(s.update_time), max(s.update_time) FROM (SELECT unnest(sources) s FROM jp) WHERE s.dataset='meta'").fetchall())
print('high-conf with website', con.execute("SELECT count(*) FROM jp WHERE confidence>=0.77 AND len(websites)>0").fetchall())
