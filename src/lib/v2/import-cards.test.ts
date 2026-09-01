import { describe, expect, it } from "vitest";
import { parseV2ImportText } from "./import-cards";

/** Tách một dòng cho gọn — phần lớn test chỉ quan tâm một dòng */
const one = (text: string) => parseV2ImportText(text).rows[0];

describe("parseV2ImportText", () => {
  it("tách đủ ba cột", () => {
    const r = one(
      "Can we schedule [a call]? - Mình gọi nhé? - meeting, call"
    );
    expect(r.english_text).toBe("Can we schedule a call?");
    expect(r.vietnamese_text).toBe("Mình gọi nhé?");
    expect(r.context_tags).toEqual(["meeting", "call"]);
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

  it("cột ngữ cảnh là không bắt buộc", () => {
    const r = one("Sounds good - Nghe hợp lý");
    expect(r.context_tags).toEqual([]);
    expect(r.error).toBeUndefined();
  });

  it("nhận nhãn ngữ cảnh tiếng Việt", () => {
    const r = one("Let me check - Để mình kiểm tra - họp, nhắn tin");
    expect(r.context_tags).toEqual(["meeting", "chat"]);
  });

  it("bỏ qua hoa thường và khoảng trắng trong cột ngữ cảnh", () => {
    const r = one("Noted - Đã rõ -  MEETING ,  Email ");
    expect(r.context_tags).toEqual(["meeting", "email"]);
  });

  it("không lặp ngữ cảnh khi khai trùng", () => {
    const r = one("Noted - Đã rõ - meeting, họp");
    expect(r.context_tags).toEqual(["meeting"]);
  });

  it("câu tiếng Việt chứa ' - ' vẫn ghép lại đủ, không bị cắt", () => {
    const r = one("Let me check - Để mình kiểm tra - rồi báo lại sau");
    expect(r.vietnamese_text).toBe("Để mình kiểm tra - rồi báo lại sau");
    expect(r.context_tags).toEqual([]);
  });

  it("cột cuối không phải ngữ cảnh thì thuộc về câu tiếng Việt", () => {
    // "tuần sau" không phải tên ngữ cảnh nên phải nằm trong câu tiếng Việt
    const r = one("Talk later - Nói sau nhé - tuần sau");
    expect(r.vietnamese_text).toBe("Nói sau nhé - tuần sau");
    expect(r.context_tags).toEqual([]);
  });

  it("một mục sai trong cột ngữ cảnh thì cả cột không tính là ngữ cảnh", () => {
    const r = one("Noted - Đã rõ - meeting, linh tinh");
    expect(r.context_tags).toEqual([]);
    expect(r.vietnamese_text).toBe("Đã rõ - meeting, linh tinh");
  });

  it("bỏ qua dòng trống, không tính là lỗi", () => {
    const res = parseV2ImportText("A - Câu A\n\n   \nB - Câu B");
    expect(res.rows).toHaveLength(2);
    expect(res.invalid).toHaveLength(0);
  });

  it("số dòng báo lỗi tính theo ô nhập, kể cả khi có dòng trống", () => {
    const res = parseV2ImportText("A - Câu A\n\nthiếu cột tiếng Việt");
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
      "A - Câu A\nthiếu cột\nB - Câu B - email"
    );
    expect(res.valid).toHaveLength(2);
    expect(res.invalid).toHaveLength(1);
  });

  it("văn bản rỗng không sinh dòng nào", () => {
    expect(parseV2ImportText("").rows).toEqual([]);
    expect(parseV2ImportText("\n\n  \n").rows).toEqual([]);
  });
});
