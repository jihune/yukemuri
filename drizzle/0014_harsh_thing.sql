CREATE TABLE `hotel_search_chunks` (
	`chunk` integer PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`core` text NOT NULL,
	`text` text NOT NULL
);--> statement-breakpoint
-- Search columns of each hotel for the in-memory search (lib/hotel-search-snapshot.ts).
-- core: region, prefecture, name, kind, trip score/reviews, Jalan score/reviews,
-- natural, bath features/known, latitude, longitude (both JSON numbers, else
-- NULL) and lifecycle state. text: search text, names, location and aliases.
-- REAL scores are printed with 17 significant digits and coordinates keep their
-- JSON text, so JavaScript reads the same doubles that SQL compared.
CREATE VIEW `hotel_search_rows` AS SELECT
 (CAST(substr(h.id,instr(h.id,'-')+1) AS INTEGER)%64+unicode(substr(h.id,-1))+64)%64 AS chunk,
 h.id AS id,
 json_array(h.region,h.prefecture,h.name,h.kind,
  CASE WHEN h.trip_score IS NOT NULL THEN json(CASE WHEN CAST(printf('%!.15g',h.trip_score) AS REAL)=h.trip_score THEN printf('%!.15g',h.trip_score) ELSE printf('%!.17g',h.trip_score) END) END,h.trip_reviews,
  CASE WHEN h.jalan_score IS NOT NULL THEN json(CASE WHEN CAST(printf('%!.15g',h.jalan_score) AS REAL)=h.jalan_score THEN printf('%!.15g',h.jalan_score) ELSE printf('%!.17g',h.jalan_score) END) END,h.jalan_reviews,
  h.natural,h.bath_features,h.bath_known,
  CASE WHEN json_type(h.payload,'$.location.latitude') IN ('integer','real') AND json_type(h.payload,'$.location.longitude') IN ('integer','real') THEN json(h.payload->'$.location.latitude') END,
  CASE WHEN json_type(h.payload,'$.location.latitude') IN ('integer','real') AND json_type(h.payload,'$.location.longitude') IN ('integer','real') THEN json(h.payload->'$.location.longitude') END,
  l.state) AS core,
 json_array(h.search_text,json(h.payload->'$.names'),json(h.payload->'$.location'),
  (SELECT json_group_array(json_array(n.name_key,n.name)) FROM hotel_names n WHERE n.hotel_id=h.id)) AS text
FROM hotels h LEFT JOIN hotel_lifecycle l ON l.hotel_id=h.id;
--> statement-breakpoint
CREATE TRIGGER `hotel_search_hotels_insert` AFTER INSERT ON `hotels` BEGIN
 UPDATE hotel_search_chunks SET version=hotel_search_chunks.version+1,core=json_set(hotel_search_chunks.core,'$."'||r.id||'"',json(r.core)),text=json_set(hotel_search_chunks.text,'$."'||r.id||'"',json(r.text)) FROM (SELECT * FROM hotel_search_rows WHERE id=NEW.id) AS r WHERE hotel_search_chunks.chunk=r.chunk;
END;
--> statement-breakpoint
CREATE TRIGGER `hotel_search_hotels_update` AFTER UPDATE ON `hotels` BEGIN
 UPDATE hotel_search_chunks SET version=version+1,core=json_remove(core,'$."'||OLD.id||'"'),text=json_remove(text,'$."'||OLD.id||'"') WHERE OLD.id IS NOT NEW.id AND chunk=(CAST(substr(OLD.id,instr(OLD.id,'-')+1) AS INTEGER)%64+unicode(substr(OLD.id,-1))+64)%64;
 UPDATE hotel_search_chunks SET version=hotel_search_chunks.version+1,core=json_set(hotel_search_chunks.core,'$."'||r.id||'"',json(r.core)),text=json_set(hotel_search_chunks.text,'$."'||r.id||'"',json(r.text)) FROM (SELECT * FROM hotel_search_rows WHERE id=NEW.id) AS r WHERE hotel_search_chunks.chunk=r.chunk;
END;
--> statement-breakpoint
CREATE TRIGGER `hotel_search_hotels_delete` AFTER DELETE ON `hotels` BEGIN
 UPDATE hotel_search_chunks SET version=version+1,core=json_remove(core,'$."'||OLD.id||'"'),text=json_remove(text,'$."'||OLD.id||'"') WHERE chunk=(CAST(substr(OLD.id,instr(OLD.id,'-')+1) AS INTEGER)%64+unicode(substr(OLD.id,-1))+64)%64;
END;
--> statement-breakpoint
CREATE TRIGGER `hotel_search_names_insert` AFTER INSERT ON `hotel_names` BEGIN
 UPDATE hotel_search_chunks SET version=hotel_search_chunks.version+1,core=json_set(hotel_search_chunks.core,'$."'||r.id||'"',json(r.core)),text=json_set(hotel_search_chunks.text,'$."'||r.id||'"',json(r.text)) FROM (SELECT * FROM hotel_search_rows WHERE id=NEW.hotel_id) AS r WHERE hotel_search_chunks.chunk=r.chunk;
END;
--> statement-breakpoint
CREATE TRIGGER `hotel_search_names_update` AFTER UPDATE ON `hotel_names` BEGIN
 UPDATE hotel_search_chunks SET version=hotel_search_chunks.version+1,core=json_set(hotel_search_chunks.core,'$."'||r.id||'"',json(r.core)),text=json_set(hotel_search_chunks.text,'$."'||r.id||'"',json(r.text)) FROM (SELECT * FROM hotel_search_rows WHERE id=OLD.hotel_id) AS r WHERE hotel_search_chunks.chunk=r.chunk;
 UPDATE hotel_search_chunks SET version=hotel_search_chunks.version+1,core=json_set(hotel_search_chunks.core,'$."'||r.id||'"',json(r.core)),text=json_set(hotel_search_chunks.text,'$."'||r.id||'"',json(r.text)) FROM (SELECT * FROM hotel_search_rows WHERE id=NEW.hotel_id) AS r WHERE hotel_search_chunks.chunk=r.chunk;
END;
--> statement-breakpoint
CREATE TRIGGER `hotel_search_names_delete` AFTER DELETE ON `hotel_names` BEGIN
 UPDATE hotel_search_chunks SET version=hotel_search_chunks.version+1,core=json_set(hotel_search_chunks.core,'$."'||r.id||'"',json(r.core)),text=json_set(hotel_search_chunks.text,'$."'||r.id||'"',json(r.text)) FROM (SELECT * FROM hotel_search_rows WHERE id=OLD.hotel_id) AS r WHERE hotel_search_chunks.chunk=r.chunk;
END;
--> statement-breakpoint
CREATE TRIGGER `hotel_search_lifecycle_insert` AFTER INSERT ON `hotel_lifecycle` BEGIN
 UPDATE hotel_search_chunks SET version=hotel_search_chunks.version+1,core=json_set(hotel_search_chunks.core,'$."'||r.id||'"',json(r.core)),text=json_set(hotel_search_chunks.text,'$."'||r.id||'"',json(r.text)) FROM (SELECT * FROM hotel_search_rows WHERE id=NEW.hotel_id) AS r WHERE hotel_search_chunks.chunk=r.chunk;
END;
--> statement-breakpoint
CREATE TRIGGER `hotel_search_lifecycle_update` AFTER UPDATE OF `hotel_id`,`state` ON `hotel_lifecycle` BEGIN
 UPDATE hotel_search_chunks SET version=hotel_search_chunks.version+1,core=json_set(hotel_search_chunks.core,'$."'||r.id||'"',json(r.core)),text=json_set(hotel_search_chunks.text,'$."'||r.id||'"',json(r.text)) FROM (SELECT * FROM hotel_search_rows WHERE id=OLD.hotel_id) AS r WHERE hotel_search_chunks.chunk=r.chunk;
 UPDATE hotel_search_chunks SET version=hotel_search_chunks.version+1,core=json_set(hotel_search_chunks.core,'$."'||r.id||'"',json(r.core)),text=json_set(hotel_search_chunks.text,'$."'||r.id||'"',json(r.text)) FROM (SELECT * FROM hotel_search_rows WHERE id=NEW.hotel_id) AS r WHERE hotel_search_chunks.chunk=r.chunk;
END;
--> statement-breakpoint
CREATE TRIGGER `hotel_search_lifecycle_delete` AFTER DELETE ON `hotel_lifecycle` BEGIN
 UPDATE hotel_search_chunks SET version=hotel_search_chunks.version+1,core=json_set(hotel_search_chunks.core,'$."'||r.id||'"',json(r.core)),text=json_set(hotel_search_chunks.text,'$."'||r.id||'"',json(r.text)) FROM (SELECT * FROM hotel_search_rows WHERE id=OLD.hotel_id) AS r WHERE hotel_search_chunks.chunk=r.chunk;
END;
