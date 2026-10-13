import { normalize } from "./text";

export interface DocType {
  id: string;
  label: string;
  /** Abbreviations that appear as standalone tokens in a title, e.g. "CV-012/2026". */
  codes: string[];
  /** Full Vietnamese names (normalized, no diacritics). */
  names: string[];
}

// The first four are the ones requested; the rest are a best guess at what a
// company also files and can be edited freely.
export const DOC_TYPES: DocType[] = [
  { id: "cong_van", label: "Công văn", codes: ["cv"], names: ["cong van"] },
  { id: "hop_dong", label: "Hợp đồng", codes: ["hd", "hdld", "hdkt"], names: ["hop dong"] },
  { id: "quyet_dinh", label: "Quyết định", codes: ["qd"], names: ["quyet dinh"] },
  { id: "to_trinh", label: "Tờ trình", codes: ["ttr", "tt"], names: ["to trinh"] },
  { id: "thong_bao", label: "Thông báo", codes: ["tb"], names: ["thong bao"] },
  { id: "bien_ban", label: "Biên bản", codes: ["bb"], names: ["bien ban"] },
  { id: "quy_che", label: "Quy chế / Quy định", codes: ["qc"], names: ["quy che", "quy dinh"] },
  { id: "ke_hoach", label: "Kế hoạch", codes: ["kh"], names: ["ke hoach"] },
  { id: "bao_cao", label: "Báo cáo", codes: ["bc"], names: ["bao cao"] },
];

export const OTHER_TYPE: DocType = { id: "khac", label: "Khác", codes: [], names: [] };
export const ALL_TYPES: DocType[] = [...DOC_TYPES, OTHER_TYPE];

export function typeLabel(id: string): string {
  return ALL_TYPES.find((t) => t.id === id)?.label ?? OTHER_TYPE.label;
}

export function isValidType(id: string): boolean {
  return ALL_TYPES.some((t) => t.id === id);
}

/**
 * Guess the document type from its title / file name.
 * "CV 12/2026 ..." -> công văn, "QĐ-05" -> quyết định, "TTr ..." -> tờ trình.
 * Matches both abbreviations and full names; the keyword that appears
 * earliest in the title wins ("QĐ ban hành quy chế" is a quyết định).
 */
export function classify(title: string): DocType {
  const n = normalize(title);
  const tokens = n.split(/[^a-z0-9]+/).filter(Boolean);
  let best: { type: DocType; pos: number } | null = null;
  const consider = (type: DocType, pos: number) => {
    if (pos >= 0 && (!best || pos < best.pos)) best = { type, pos };
  };

  for (const t of DOC_TYPES) {
    for (const name of t.names) {
      const m = new RegExp(`(^|[^a-z0-9])${name}([^a-z0-9]|$)`).exec(n);
      if (m) consider(t, m.index + m[1].length);
    }
  }

  let offset = 0;
  for (const tok of tokens) {
    const pos = n.indexOf(tok, offset);
    offset = pos + tok.length;
    // Code alone ("qd") or glued to digits ("qd05", "cv012").
    const code = tok.match(/^([a-z]{2,4})\d*$/)?.[1];
    if (!code) continue;
    for (const t of DOC_TYPES) if (t.codes.includes(code)) consider(t, pos);
  }
  return best ? (best as { type: DocType }).type : OTHER_TYPE;
}
