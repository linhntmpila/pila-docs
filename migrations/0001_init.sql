CREATE TABLE documents (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  title_search  TEXT NOT NULL,          -- lowercase, no diacritics, for search
  doc_number    TEXT,                   -- số/ký hiệu, e.g. 12/2026/QĐ-PILA
  type          TEXT NOT NULL,          -- cong_van | hop_dong | quyet_dinh | to_trinh | ...
  summary       TEXT,
  issued_date   TEXT,                   -- YYYY-MM-DD
  featured      INTEGER NOT NULL DEFAULT 0,
  file_key      TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_size     INTEGER NOT NULL,
  mime          TEXT NOT NULL,
  downloads     INTEGER NOT NULL DEFAULT 0,
  uploaded_by   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_documents_type     ON documents(type);
CREATE INDEX idx_documents_issued   ON documents(issued_date);
CREATE INDEX idx_documents_updated  ON documents(updated_at);
CREATE INDEX idx_documents_featured ON documents(featured);
