import { describe, expect, it } from "vitest";
import { classify } from "../src/classify";
import { normalize } from "../src/text";

describe("classify", () => {
  it.each([
    ["CV 12/2026 v/v đề nghị cấp kinh phí", "cong_van"],
    ["CV-012_2026.pdf", "cong_van"],
    ["HĐ thuê văn phòng 2026", "hop_dong"],
    ["HD-045/2026/PILA", "hop_dong"],
    ["QĐ bổ nhiệm trưởng phòng", "quyet_dinh"],
    ["12/2026/QD-PILA ban hanh quy che", "quyet_dinh"],
    ["TTr xin phê duyệt ngân sách", "to_trinh"],
    ["ttr_ngan_sach.docx", "to_trinh"],
    ["Công văn gửi đối tác", "cong_van"],
    ["Hợp đồng lao động Nguyễn Văn A", "hop_dong"],
    ["Slide giới thiệu công ty", "khac"],
  ])("%s -> %s", (title, expected) => {
    expect(classify(title).id).toBe(expected);
  });
});

describe("normalize", () => {
  it("strips diacritics", () => {
    expect(normalize("Quyết định Đặc biệt")).toBe("quyet dinh dac biet");
  });
});
