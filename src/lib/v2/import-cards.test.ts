import { describe, expect, it } from "vitest";
import { parseFillerBlock, parseV2ImportText } from "./import-cards";

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

  it("câu chưa chia mẩu thì cảnh báo, không chặn", () => {
    const r = one("Sounds good - Nghe hợp lý");
    expect(r.error).toBeUndefined();
    expect(r.warning).toContain("chưa chia mẩu");
  });

  it("gõ nhiều mức trang trọng là LỖI, không âm thầm nhét vào câu tiếng Việt", () => {
    const r = one(
      "That sounds like [a good plan] - Nghe có vẻ hợp lý. - trung tính, thân mật"
    );
    expect(r.error).toContain("chỉ chọn MỘT");
    // Cụm mức phải bị tách khỏi câu tiếng Việt, không dính lại thành đuôi rác
    expect(r.vietnamese_text).toBe("Nghe có vẻ hợp lý.");
  });

  it("dấu phẩy trong câu tiếng Việt không bị nhầm là danh sách mức", () => {
    const r = one("Well, ok - Được, cũng ổn thôi");
    expect(r.error).toBeUndefined();
    expect(r.vietnamese_text).toBe("Được, cũng ổn thôi");
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

  it("gõ trần tên chủ đề thì chỉ thẳng cách sửa, không báo 'thiếu câu tiếng Việt'", () => {
    const res = parse("Xin lỗi\nSorry - Xin lỗi nhé");
    expect(res.invalid[0].error).toContain("Thêm dấu #");
    expect(res.invalid[0].error).toContain("Xin lỗi");
  });

  it("chữ trần KHÔNG trùng tên chủ đề nào thì giữ nguyên lỗi gốc", () => {
    expect(parse("Linh tinh").invalid[0].error).toContain(
      "Thiếu câu tiếng Việt"
    );
  });
});

describe("dòng cụm thay thế", () => {
  const parse = (text: string) => parseV2ImportText(text, TOPICS, "t-suggest");
  const CARD = "Can we schedule [a call] next week? - Mình gọi tuần sau nhé?";

  it("gắn cụm vào câu ngay phía trên", () => {
    const res = parse(`${CARD}\n+ a quick chat = một buổi trao đổi nhanh`);
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0].fillers[0]).toEqual([
      { filler_text: "a quick chat", filler_vi: "một buổi trao đổi nhanh" },
    ]);
  });

  it("nhiều dòng cụm dồn vào cùng một chỗ trống", () => {
    const res = parse(`${CARD}\n+ a chat = trao đổi\n+ a review = rà soát`);
    expect(res.valid[0].fillers[0]).toHaveLength(2);
  });

  it("dòng cụm không tính vào số câu sẽ nhập", () => {
    const res = parse(`${CARD}\n+ a chat = trao đổi`);
    expect(res.valid).toHaveLength(1);
  });

  it("số thứ tự chỉ đúng chỗ trống cần gắn", () => {
    const two = "That [sounds] like [a good plan] - Nghe có vẻ hợp lý";
    const res = parse(`${two}\n+1 looks = trông có vẻ\n+2 a solid idea = ý chắc`);
    expect(res.valid[0].fillers[0]).toHaveLength(1);
    expect(res.valid[0].fillers[1]).toHaveLength(1);
    expect(res.valid[0].fillers[1][0].filler_text).toBe("a solid idea");
  });

  it("bỏ trống số thứ tự nghĩa là chỗ trống đầu tiên", () => {
    const two = "That [sounds] like [a good plan] - Nghe có vẻ hợp lý";
    const res = parse(`${two}\n+ looks = trông có vẻ`);
    expect(res.valid[0].fillers[0][0].filler_text).toBe("looks");
  });

  it("nghĩa tiếng Việt chứa dấu gạch ngang vẫn an toàn", () => {
    const res = parse(`${CARD}\n+ a chat = trao đổi - nói chuyện nhanh`);
    expect(res.valid[0].fillers[0][0].filler_vi).toBe(
      "trao đổi - nói chuyện nhanh"
    );
  });

  it("dòng cụm đứng trước mọi câu là lỗi", () => {
    expect(parse("+ a chat = trao đổi").invalid[0].error).toContain(
      "phải nằm ngay dưới một câu"
    );
  });

  it("câu phía trên không có chỗ trống là lỗi", () => {
    const res = parse("Sounds good - Nghe hợp lý\n+ a chat = trao đổi");
    expect(res.invalid[0].error).toContain("không có chỗ trống");
  });

  it("số thứ tự vượt quá số chỗ trống là lỗi", () => {
    const res = parse(`${CARD}\n+3 a chat = trao đổi`);
    expect(res.invalid[0].error).toContain("chỉ có 1 chỗ trống");
  });

  it("thiếu dấu bằng là lỗi", () => {
    expect(parse(`${CARD}\n+ a quick chat`).invalid[0].error).toContain("'='");
  });

  it("thiếu nghĩa tiếng Việt là lỗi — không nêu được tình huống thì vô dụng", () => {
    expect(parse(`${CARD}\n+ a chat =`).invalid[0].error).toContain(
      "Thiếu nghĩa tiếng Việt"
    );
  });

  it("câu phía trên đang lỗi thì không gắn cụm, báo rõ lý do", () => {
    const res = parse("thiếu cột tiếng Việt\n+ a chat = trao đổi");
    expect(
      res.invalid.some((r) => r.error?.includes("đang lỗi"))
    ).toBe(true);
  });

  it("dòng tiêu đề xen giữa không cắt đứt liên kết cụm với câu", () => {
    // Cụm vẫn thuộc câu gần nhất phía trên, tiêu đề chỉ đổi chủ đề
    const res = parse(`${CARD}\n+ a chat = trao đổi`);
    expect(res.valid[0].fillers[0]).toHaveLength(1);
  });
});

describe("parseFillerBlock", () => {
  it("đọc danh sách cụm dán vào ô sửa thẻ", () => {
    const res = parseFillerBlock(
      "a quick chat = một buổi trao đổi nhanh\na review = một buổi rà soát",
      1
    );
    expect(res.errors).toEqual([]);
    expect(res.fillers).toEqual([
      { filler_text: "a quick chat", filler_vi: "một buổi trao đổi nhanh" },
      { filler_text: "a review", filler_vi: "một buổi rà soát" },
    ]);
  });

  it("chấp nhận dấu + đầu dòng — kết quả AI mang sẵn dấu đó", () => {
    const res = parseFillerBlock("+ a quick chat = trao đổi nhanh", 1);
    expect(res.errors).toEqual([]);
    expect(res.fillers[0].filler_text).toBe("a quick chat");
  });

  it("số chỗ trống khớp thì nhận", () => {
    const res = parseFillerBlock("+2 a solid idea = ý chắc chắn", 2);
    expect(res.errors).toEqual([]);
    expect(res.fillers).toHaveLength(1);
  });

  it("dán nhầm ô thì báo lỗi, KHÔNG im lặng bỏ qua số", () => {
    const res = parseFillerBlock("+2 a solid idea = ý chắc chắn", 1);
    expect(res.fillers).toEqual([]);
    expect(res.errors[0].error).toContain("số 2");
  });

  it("bỏ qua dòng trống", () => {
    const res = parseFillerBlock("a = b\n\n   \nc = d", 1);
    expect(res.fillers).toHaveLength(2);
    expect(res.errors).toEqual([]);
  });

  it("dòng hỏng bị loại nhưng dòng lành vẫn nhận", () => {
    const res = parseFillerBlock("a quick chat\na review = rà soát", 1);
    expect(res.fillers).toHaveLength(1);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].line).toBe(1);
  });

  it("nghĩa tiếng Việt chứa dấu gạch ngang vẫn nguyên vẹn", () => {
    const res = parseFillerBlock("a chat = trao đổi - nói nhanh", 1);
    expect(res.fillers[0].filler_vi).toBe("trao đổi - nói nhanh");
  });

  it("thiếu nghĩa tiếng Việt là lỗi", () => {
    expect(parseFillerBlock("a chat =", 1).errors[0].error).toContain(
      "Thiếu nghĩa tiếng Việt"
    );
  });

  it("văn bản rỗng không sinh gì", () => {
    const res = parseFillerBlock("", 1);
    expect(res.fillers).toEqual([]);
    expect(res.errors).toEqual([]);
  });
});
