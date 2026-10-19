import duckdb, os, time, json
con = duckdb.connect()
p = os.environ.get('HTTPS_PROXY','')
con.execute("INSTALL httpfs; LOAD httpfs;")
host = p.replace('http://','').replace('https://','').rstrip('/')
con.execute(f"SET http_proxy='{host}'")
con.execute("SET ca_cert_file='/root/.ccr/ca-bundle.crt'")
con.execute("CREATE SECRET anon (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2')")
src = "read_parquet('s3://overturemaps-us-west-2/release/2026-09-23.1/theme=places/type=place/*', hive_partitioning=1)"
print(con.execute(f"DESCRIBE SELECT * FROM {src}").fetchall())
t=time.time()
con.execute(f"""CREATE TABLE jp AS SELECT id, names, basic_category, taxonomy, confidence, operating_status, websites, phones, addresses, sources, bbox
FROM {src}
WHERE bbox.xmin BETWEEN 122 AND 154 AND bbox.ymin BETWEEN 24 AND 46
AND (list_contains(taxonomy.hierarchy, 'lodging') OR basic_category IN ('hotel','motel','hostel','resort','inn','guest_house','ryokan','bed_and_breakfast','campground','lodging'))""")
print('load s', round(time.time()-t,1))
con.execute("COPY jp TO '/tmp/claude-0/-home-user/0c78c19d-a421-5334-ba23-0ecb47664dcc/scratchpad/d08raw/ov_jp_lodging.parquet' (FORMAT parquet)")
print(con.execute("SELECT count(*) FROM jp").fetchall())
