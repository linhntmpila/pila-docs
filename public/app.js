// Shared helpers for every page: API calls, auth guard, header, formatting.
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: "same-origin", ...opts });
  if (res.status === 401) {
    location.href = "/login.html?next=" + encodeURIComponent(location.pathname + location.search);
    return new Promise(() => {});
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || "Có lỗi xảy ra");
  return data;
}

export const TYPE_LABELS = {
  cong_van: "Công văn", hop_dong: "Hợp đồng", quyet_dinh: "Quyết định", to_trinh: "Tờ trình",
  thong_bao: "Thông báo", bien_ban: "Biên bản", quy_che: "Quy chế / Quy định", ke_hoach: "Kế hoạch",
  bao_cao: "Báo cáo", khac: "Khác",
};

export const fmtDate = (d) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
export const fmtSize = (b) => (b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1024 / 1024).toFixed(1) + " MB");
export const ext = (name) => (name.split(".").pop() || "").slice(0, 4);
export const downloadUrl = (id) => `/api/documents/${id}/download`;

export function toast(msg, isErr = false) {
  const el = Object.assign(document.createElement("div"), { className: "toast" + (isErr ? " err" : ""), textContent: msg });
  document.body.append(el);
  setTimeout(() => el.remove(), 3500);
}

export async function boot(active) {
  const { user } = await api("/api/me");
  const initials = esc(user.name.trim().slice(0, 1).toUpperCase());
  document.querySelector("#site-header").innerHTML = `
    <header class="site-header"><div class="wrap">
      <a class="logo" href="/"><img src="/assets/logo.webp" alt="PILA"></a>
      <nav class="nav">
        <a href="/" class="${active === "home" ? "active" : ""}">Trang chủ</a>
        <a href="/documents.html" class="${active === "docs" ? "active" : ""}">Tra cứu văn bản</a>
        ${user.isAdmin ? `<a href="/admin.html" class="${active === "admin" ? "active" : ""}">Quản trị</a>` : ""}
      </nav>
      <div class="user">
        <div class="avatar">${user.picture ? `<img src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer">` : initials}</div>
        <div class="who">${esc(user.name)}<small>${user.isAdmin ? "Quản trị viên" : esc(user.email)}</small></div>
        <button class="btn small" id="logout">Đăng xuất</button>
      </div>
    </div></header>`;
  document.querySelector("#logout").onclick = async () => {
    await fetch("/auth/logout", { method: "POST" });
    location.href = "/login.html";
  };
  return user;
}

// ---- Document rendering & detail dialog --------------------------------------
export function docCard(d) {
  return `<article class="card ${d.featured ? "featured" : ""}" data-id="${d.id}">
    <div class="meta"><span class="badge">${esc(TYPE_LABELS[d.type] ?? "Khác")}</span>${d.featured ? '<span class="badge star">★ Nổi bật</span>' : ""}</div>
    <h3>${esc(d.title)}</h3>
    ${d.summary ? `<p class="summary">${esc(d.summary)}</p>` : ""}
    <div class="meta">${d.doc_number ? `<span>Số: ${esc(d.doc_number)}</span>` : ""}<span>${fmtDate(d.issued_date)}</span><span>${fmtSize(d.file_size)}</span></div>
  </article>`;
}

export function docRow(d) {
  return `<div class="row" data-id="${d.id}">
    <div class="fileicon">${esc(ext(d.file_name))}</div>
    <div class="main">
      <div class="title">${esc(d.title)}</div>
      <div class="meta"><span class="badge">${esc(TYPE_LABELS[d.type] ?? "Khác")}</span>${d.featured ? '<span class="badge star">★</span>' : ""}
        ${d.doc_number ? `<span>Số: ${esc(d.doc_number)}</span>` : ""}<span>Ban hành: ${fmtDate(d.issued_date)}</span><span>${fmtSize(d.file_size)}</span></div>
    </div>
    <a class="btn small" href="${downloadUrl(d.id)}" onclick="event.stopPropagation()">Tải về</a>
  </div>`;
}

/** Open the detail dialog when any [data-id] card/row inside `container` is clicked. */
export function bindDetail(container, lookup) {
  let dlg = document.querySelector("#detail");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "detail";
    document.body.append(dlg);
    dlg.addEventListener("click", (e) => e.target === dlg && dlg.close());
  }
  container.addEventListener("click", (e) => {
    const el = e.target.closest("[data-id]");
    const d = el && lookup(el.dataset.id);
    if (!d) return;
    dlg.innerHTML = `<div class="dlg">
      <span class="badge">${esc(TYPE_LABELS[d.type] ?? "Khác")}</span> ${d.featured ? '<span class="badge star">★ Nổi bật</span>' : ""}
      <h3>${esc(d.title)}</h3>
      ${d.summary ? `<p>${esc(d.summary)}</p>` : ""}
      <dl>
        <dt>Số / ký hiệu</dt><dd>${esc(d.doc_number) || "—"}</dd>
        <dt>Ngày ban hành</dt><dd>${fmtDate(d.issued_date)}</dd>
        <dt>Cập nhật</dt><dd>${fmtDate(d.updated_at)}</dd>
        <dt>Tệp</dt><dd>${esc(d.file_name)} · ${fmtSize(d.file_size)}</dd>
        <dt>Lượt tải</dt><dd>${d.downloads}</dd>
      </dl>
      <div class="actions">
        <button class="btn" value="close">Đóng</button>
        ${d.mime === "application/pdf" ? `<a class="btn" target="_blank" rel="noopener" href="${downloadUrl(d.id)}?inline=1">Xem trước</a>` : ""}
        <a class="btn primary" href="${downloadUrl(d.id)}">Tải về</a>
      </div></div>`;
    dlg.querySelector("[value=close]").onclick = () => dlg.close();
    dlg.showModal();
  });
}
