import { Hono } from "hono";
import { auth, loadUser, requireAdmin, requireUser, sameOriginWrites } from "./auth";
import { ALL_TYPES, classify, isValidType, typeLabel } from "./classify";
import { normalize } from "./text";
import type { AppEnv, DocumentRow, Env } from "./types";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const COLUMNS =
  "id,title,doc_number,type,summary,issued_date,featured,file_name,file_size,mime,downloads,uploaded_by,created_at,updated_at";

const app = new Hono<AppEnv>();
app.use("*", loadUser);
app.use("/api/*", sameOriginWrites);
app.route("/auth", auth);

app.get("/api/me", (c) => {
  const user = c.get("user");
  return user ? c.json({ user }) : c.json({ error: "Chưa đăng nhập" }, 401);
});

app.get("/api/types", requireUser, async (c) => {
  const { results } = await c.env.DB.prepare("SELECT type, COUNT(*) AS n FROM documents GROUP BY type").all<{
    type: string;
    n: number;
  }>();
  const counts = new Map(results.map((r) => [r.type, r.n]));
  return c.json({ types: ALL_TYPES.map((t) => ({ id: t.id, label: t.label, count: counts.get(t.id) ?? 0 })) });
});

/** Suggest a type from a title so the upload form can preview what will be chosen. */
app.get("/api/classify", requireAdmin, (c) => {
  const t = classify(c.req.query("title") ?? "");
  return c.json({ type: t.id, label: t.label });
});

app.get("/api/home", requireUser, async (c) => {
  const [featured, latest, total] = await Promise.all([
    c.env.DB.prepare(`SELECT ${COLUMNS} FROM documents WHERE featured=1 ORDER BY updated_at DESC LIMIT 6`).all<DocumentRow>(),
    c.env.DB.prepare(`SELECT ${COLUMNS} FROM documents ORDER BY updated_at DESC LIMIT 8`).all<DocumentRow>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM documents").first<{ n: number }>(),
  ]);
  return c.json({ featured: featured.results, latest: latest.results, total: total?.n ?? 0 });
});

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

app.get("/api/documents", requireUser, async (c) => {
  const q = c.req.query();
  const where: string[] = [];
  const args: (string | number)[] = [];

  for (const term of normalize(q.q ?? "").split(/\s+/).filter(Boolean).slice(0, 8)) {
    where.push("title_search LIKE ? ESCAPE '\\'");
    args.push(`%${likeEscape(term)}%`);
  }
  const types = (q.type ?? "").split(",").filter(isValidType);
  if (types.length) {
    where.push(`type IN (${types.map(() => "?").join(",")})`);
    args.push(...types);
  }
  if (/^\d{4}$/.test(q.year ?? "")) {
    where.push("substr(issued_date,1,4) = ?");
    args.push(q.year);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from ?? "")) {
    where.push("issued_date >= ?");
    args.push(q.from);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.to ?? "")) {
    where.push("issued_date <= ?");
    args.push(q.to);
  }
  if (q.featured === "1") where.push("featured = 1");

  const order =
    { oldest: "issued_date ASC, created_at ASC", title: "title_search ASC", downloads: "downloads DESC", updated: "updated_at DESC" }[
      q.sort ?? ""
    ] ?? "COALESCE(issued_date, substr(created_at,1,10)) DESC, created_at DESC";
  const pageSize = Math.min(Math.max(parseInt(q.pageSize) || 20, 1), 50);
  const page = Math.max(parseInt(q.page) || 1, 1);
  const clause = where.length ? "WHERE " + where.join(" AND ") : "";

  const [rows, count] = await Promise.all([
    c.env.DB.prepare(`SELECT ${COLUMNS} FROM documents ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .bind(...args, pageSize, (page - 1) * pageSize)
      .all<DocumentRow>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM documents ${clause}`).bind(...args).first<{ n: number }>(),
  ]);
  return c.json({ items: rows.results, total: count?.n ?? 0, page, pageSize });
});

app.get("/api/documents/:id", requireUser, async (c) => {
  const row = await c.env.DB.prepare(`SELECT ${COLUMNS} FROM documents WHERE id=?`).bind(c.req.param("id")).first<DocumentRow>();
  return row ? c.json(row) : c.json({ error: "Không tìm thấy văn bản" }, 404);
});

app.get("/api/documents/:id/download", requireUser, async (c) => {
  const row = await c.env.DB.prepare("SELECT file_key,file_name,mime FROM documents WHERE id=?")
    .bind(c.req.param("id"))
    .first<{ file_key: string; file_name: string; mime: string }>();
  if (!row) return c.json({ error: "Không tìm thấy văn bản" }, 404);
  const obj = await c.env.FILES.get(row.file_key);
  if (!obj) return c.json({ error: "Không tìm thấy tệp" }, 404);

  const inline = c.req.query("inline") === "1" && row.mime === "application/pdf";
  if (!inline) {
    c.executionCtx.waitUntil(
      c.env.DB.prepare("UPDATE documents SET downloads = downloads + 1 WHERE id=?").bind(c.req.param("id")).run(),
    );
  }
  const asciiName = row.file_name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(obj.body, {
    headers: {
      "content-type": row.mime,
      "content-length": String(obj.size),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
});

// ---- Admin -----------------------------------------------------------------

const admin = new Hono<AppEnv>();
admin.use("*", requireAdmin);

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const cleanDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function readFile(form: FormData): Promise<{ file: File } | { error: string } | null> {
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > MAX_FILE_BYTES) return { error: "Tệp vượt quá 50MB" };
  if (!MIME_BY_EXT[extOf(f.name)]) return { error: "Định dạng không được hỗ trợ (PDF, Word, Excel, PowerPoint, TXT, PNG, JPG)" };
  return { file: f };
}

function resolveType(requested: string, title: string, fileName: string): string {
  if (isValidType(requested)) return requested;
  const fromTitle = classify(title);
  return fromTitle.id !== "khac" ? fromTitle.id : classify(fileName).id;
}

admin.post("/documents", async (c) => {
  const form = await c.req.formData();
  const upload = await readFile(form);
  if (!upload) return c.json({ error: "Vui lòng chọn tệp" }, 400);
  if ("error" in upload) return c.json({ error: upload.error }, 400);
  const { file } = upload;

  const title = str(form.get("title"), 300) || file.name.replace(/\.[^.]+$/, "");
  const docNumber = str(form.get("doc_number"), 100);
  const summary = str(form.get("summary"), 2000);
  const type = resolveType(str(form.get("type"), 30), title, file.name);
  const issued = cleanDate(form.get("issued_date"));
  const featured = form.get("featured") === "1" ? 1 : 0;

  const id = crypto.randomUUID();
  const key = `docs/${id}/${crypto.randomUUID()}`;
  const mime = MIME_BY_EXT[extOf(file.name)];
  await c.env.FILES.put(key, file.stream(), { httpMetadata: { contentType: mime } });
  const now = new Date().toISOString();
  try {
    await c.env.DB.prepare(
      `INSERT INTO documents (id,title,title_search,doc_number,type,summary,issued_date,featured,file_key,file_name,file_size,mime,uploaded_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(id, title, normalize(`${title} ${docNumber} ${summary} ${typeLabel(type)}`), docNumber || null, type, summary || null, issued, featured, key, file.name, file.size, mime, c.get("user")!.email, now, now)
      .run();
  } catch (e) {
    await c.env.FILES.delete(key); // don't leave an orphan if the row failed
    throw e;
  }
  return c.json({ id, type }, 201);
});

admin.put("/documents/:id", async (c) => {
  const id = c.req.param("id");
  const old = await c.env.DB.prepare("SELECT file_key FROM documents WHERE id=?").bind(id).first<{ file_key: string }>();
  if (!old) return c.json({ error: "Không tìm thấy văn bản" }, 404);
  const form = await c.req.formData();
  const upload = await readFile(form);
  if (upload && "error" in upload) return c.json({ error: upload.error }, 400);

  const title = str(form.get("title"), 300);
  if (!title) return c.json({ error: "Tiêu đề không được để trống" }, 400);
  const docNumber = str(form.get("doc_number"), 100);
  const summary = str(form.get("summary"), 2000);
  const type = resolveType(str(form.get("type"), 30), title, "");

  let fileSql = "";
  const fileArgs: (string | number)[] = [];
  let newKey: string | null = null;
  if (upload) {
    const { file } = upload;
    newKey = `docs/${id}/${crypto.randomUUID()}`;
    const mime = MIME_BY_EXT[extOf(file.name)];
    await c.env.FILES.put(newKey, file.stream(), { httpMetadata: { contentType: mime } });
    fileSql = ",file_key=?,file_name=?,file_size=?,mime=?";
    fileArgs.push(newKey, file.name, file.size, mime);
  }
  await c.env.DB.prepare(
    `UPDATE documents SET title=?,title_search=?,doc_number=?,type=?,summary=?,issued_date=?,featured=?,updated_at=?${fileSql} WHERE id=?`,
  )
    .bind(title, normalize(`${title} ${docNumber} ${summary} ${typeLabel(type)}`), docNumber || null, type, summary || null, cleanDate(form.get("issued_date")), form.get("featured") === "1" ? 1 : 0, new Date().toISOString(), ...fileArgs, id)
    .run();
  if (newKey) await c.env.FILES.delete(old.file_key);
  return c.json({ id, type });
});

admin.post("/documents/:id/featured", async (c) => {
  const { featured } = await c.req.json<{ featured: boolean }>();
  const r = await c.env.DB.prepare("UPDATE documents SET featured=? WHERE id=?").bind(featured ? 1 : 0, c.req.param("id")).run();
  return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "Không tìm thấy văn bản" }, 404);
});

admin.delete("/documents/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT file_key FROM documents WHERE id=?").bind(id).first<{ file_key: string }>();
  if (!row) return c.json({ error: "Không tìm thấy văn bản" }, 404);
  await c.env.DB.prepare("DELETE FROM documents WHERE id=?").bind(id).run();
  await c.env.FILES.delete(row.file_key);
  return c.json({ ok: true });
});

app.route("/api/admin", admin);
app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Not found" }, 404) : c.env.ASSETS.fetch(c.req.raw)));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Lỗi máy chủ" }, 500);
});

export default app satisfies ExportedHandler<Env>;
