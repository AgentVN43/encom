import { describe, expect, it } from "vitest";
import { parseV2ImportText } from "./import-cards";

const TOPICS = [
  { id: "t-suggest", name: "Đề nghị" },
  { id: "t-sorry", name: "Xin lỗi" },
];

/** Tách một dòng cho gọn — phần lớn test chỉ quan tâm một dòng */
const one = (text: string) =>
  parseV2ImportText(text, TOPICS, "t-suggest").rows[0];

describe("parseV2ImportText", () => {
  it("tách đủ ba cột", () => {
    const r = one("Can we schedule [a call]? - Mình gọi nhé? - trang trọng");
    expect(r.english_text).toBe("Can we schedule a call?");
    expect(r.vietnamese_text).toBe("Mình gọi nhé?");
    expect(r.register).toBe("formal");
    expect(r.error).toBeUndefined();
  });

  it("chia mẩu đúng frame/slot theo ngoặc vuông", () => {
    const r = one("Can we schedule [a call] next week? - Mình gọi tuần sau nhé?");
    expect(r.chunks).toEqual([
      { text: "Can we schedule", kind: "frame" },
      { text: "a call", kind: "slot" },
      { text: "next week?", kind: "frame" },
    ]);
  });

  it("thiếu cột mức thì mặc định trung tính", () => {
    const r = one("Sounds good - Nghe hợp lý");
    expect(r.register).toBe("neutral");
    expect(r.error).toBeUndefined();
  });

  it("nhận cả tên tiếng Anh lẫn tiếng Việt", () => {
    expect(one("Got a sec? - Rảnh chút không? - informal").register).toBe(
      "informal"
    );
    expect(one("Got a sec? - Rảnh chút không? - thân mật").register).toBe(
      "informal"
    );
  });

  it("bỏ qua hoa thường và khoảng trắng ở cột mức", () => {
    expect(one("Noted - Đã rõ -  FORMAL ").register).toBe("formal");
  });

  it("nhận cả bản không dấu", () => {
    expect(one("Noted - Đã rõ - trang trong").register).toBe("formal");
  });

  it("câu tiếng Việt chứa ' - ' vẫn ghép lại đủ, không bị cắt", () => {
    const r = one("Let me check - Để mình kiểm tra - rồi báo lại sau");
    expect(r.vietnamese_text).toBe("Để mình kiểm tra - rồi báo lại sau");
    expect(r.register).toBe("neutral");
  });

  it("cột cuối không phải tên mức thì thuộc về câu tiếng Việt", () => {
    const r = one("Talk later - Nói sau nhé - tuần sau");
    expect(r.vietnamese_text).toBe("Nói sau nhé - tuần sau");
    expect(r.register).toBe("neutral");
  });

  it("dòng hai cột không bị hiểu nhầm câu tiếng Việt thành mức", () => {
    // "trang trọng" ở đây là cả câu tiếng Việt, không phải cột mức
    const r = one("Formally speaking - trang trọng");
    expect(r.vietnamese_text).toBe("trang trọng");
    expect(r.register).toBe("neutral");
    expect(r.error).toBeUndefined();
  });

  it("bỏ qua dòng trống, không tính là lỗi", () => {
    const res = parseV2ImportText(
      "A - Câu A\n\n   \nB - Câu B",
      TOPICS,
      "t-suggest"
    );
    expect(res.rows).toHaveLength(2);
    expect(res.invalid).toHaveLength(0);
  });

  it("số dòng báo lỗi tính theo ô nhập, kể cả khi có dòng trống", () => {
    const res = parseV2ImportText(
      "A - Câu A\n\nthiếu cột tiếng Việt",
      TOPICS,
      "t-suggest"
    );
    expect(res.invalid[0].line).toBe(3);
  });

  it("thiếu câu tiếng Việt là lỗi", () => {
    expect(one("Just english").error).toContain("Thiếu câu tiếng Việt");
  });

  it("dòng chỉ có dấu phân cách là lỗi", () => {
    expect(one("- Câu tiếng Việt").error).toBeDefined();
  });

  it("câu tiếng Anh rỗng sau khi bỏ ngoặc là lỗi", () => {
    expect(one("[] - Câu tiếng Việt").error).toContain("rỗng");
  });

  it("ngoặc lệch thì cảnh báo nhưng vẫn nhập được", () => {
    const r = one("Can we [a call - Mình gọi nhé");
    expect(r.error).toBeUndefined();
    expect(r.warning).toContain("Ngoặc vuông không khớp");
  });

  it("câu một mẩu thì cảnh báo, không chặn", () => {
    const r = one("Sounds good - Nghe hợp lý");
    expect(r.error).toBeUndefined();
    expect(r.warning).toContain("một mẩu");
  });

  it("gạch ngang trong từ ghép không bị cắt nhầm", () => {
    const r = one("Send the e-mail - Gửi e-mail đi");
    expect(r.english_text).toBe("Send the e-mail");
    expect(r.vietnamese_text).toBe("Gửi e-mail đi");
  });

  it("gom đúng dòng hợp lệ và dòng lỗi", () => {
    const res = parseV2ImportText(
      "A - Câu A\nthiếu cột\nB - Câu B - thân mật",
      TOPICS,
      "t-suggest"
    );
    expect(res.valid).toHaveLength(2);
    expect(res.invalid).toHaveLength(1);
  });

  it("văn bản rỗng không sinh dòng nào", () => {
    expect(parseV2ImportText("").rows).toEqual([]);
    expect(parseV2ImportText("\n\n  \n").rows).toEqual([]);
  });
});

describe("dòng tiêu đề đổi chủ đề", () => {
  const parse = (text: string) => parseV2ImportText(text, TOPICS, "t-suggest");

  it("dòng dưới tiêu đề nhận chủ đề của tiêu đề đó", () => {
    const res = parse("# Xin lỗi\nSorry - Xin lỗi");
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0].topic_id).toBe("t-sorry");
  });

  it("dòng trước tiêu đề đầu tiên dùng chủ đề mặc định", () => {
    const res = parse("Can we meet - Gặp nhé\n# Xin lỗi\nSorry - Xin lỗi");
    expect(res.valid[0].topic_id).toBe("t-suggest");
    expect(res.valid[1].topic_id).toBe("t-sorry");
  });

  it("nhiều tiêu đề thì mỗi khối vào đúng chủ đề của nó", () => {
    const res = parse("# Đề nghị\nA - Câu A\nB - Câu B\n# Xin lỗi\nC - Câu C");
    expect(res.valid.map((r) => r.topic_id)).toEqual([
      "t-suggest",
      "t-suggest",
      "t-sorry",
    ]);
  });

  it("khớp tên bỏ qua hoa thường và khoảng trắng", () => {
    const res = parse("#   xin LỖI  \nSorry - Xin lỗi");
    expect(res.valid[0].topic_id).toBe("t-sorry");
  });

  it("tiêu đề hợp lệ không sinh dòng nào — nó chỉ đổi chủ đề", () => {
    const res = parse("# Xin lỗi\nSorry - Xin lỗi");
    expect(res.rows).toHaveLength(1);
    expect(res.valid).toHaveLength(1);
  });

  it("chỉ tiêu đề HỎNG mới thành dòng, để báo đúng số dòng", () => {
    const res = parse("# Sai tên\nSorry - Xin lỗi");
    expect(res.rows.filter((r) => r.isHeader)).toHaveLength(1);
  });

  it("tên chủ đề không có thì báo lỗi ngay tại dòng tiêu đề", () => {
    const res = parse("# Không tồn tại\nSorry - Xin lỗi");
    expect(res.invalid[0].line).toBe(1);
    expect(res.invalid[0].error).toContain("Không có chủ đề nào tên");
  });

  it("tiêu đề sai KHÔNG đổ tiếp vào chủ đề trước đó", () => {
    // Âm thầm gán sai chức năng cho cả khối là lỗi khó phát hiện nhất
    const res = parse("# Xin lỗi\nA - Câu A\n# Sai tên\nB - Câu B");
    expect(res.valid.map((r) => r.topic_id)).toEqual(["t-sorry"]);
    expect(res.invalid.some((r) => r.raw === "B - Câu B")).toBe(true);
  });

  it("tiêu đề rỗng là lỗi", () => {
    expect(parse("#\nA - Câu A").invalid[0].error).toContain("thiếu tên");
  });

  it("không có chủ đề mặc định và chưa có tiêu đề thì báo lỗi", () => {
    const res = parseV2ImportText("A - Câu A", TOPICS, "");
    expect(res.valid).toHaveLength(0);
    expect(res.invalid[0].error).toContain("Chưa rõ chủ đề");
  });

  it("dòng bắt đầu bằng # luôn là tiêu đề, không bị hiểu thành câu", () => {
    expect(parse("# Đề nghị - Câu gì đó").rows[0].isHeader).toBe(true);
  });
});
