import { chunksToSentence, parseChunks, type DraftChunk } from "./session";
import type { V2Context } from "./types";

/**
 * Nhập hàng loạt câu cho v2.
 *
 * Giữ đúng dấu phân cách của v1 (`\s+-\s+`) để admin không phải nhớ hai cú
 * pháp: gạch ngang có khoảng trắng hai bên, không cắt nhầm từ ghép
 * ("T-shirt") hay link.
 *
 *   Can we schedule [a call]? - Mình sắp xếp một cuộc gọi nhé? - meeting, call
 *   └── tiếng Anh, ngoặc vuông     └── tiếng Việt              └── ngữ cảnh
 *                                                                (không bắt buộc)
 */
const SEPARATOR = /\s+-\s+/;

/** Tên ngữ cảnh chấp nhận được, cả khoá tiếng Anh lẫn nhãn tiếng Việt */
const CONTEXT_ALIASES: Record<string, V2Context> = {
  meeting: "meeting",
  hop: "meeting",
  "họp": "meeting",
  email: "email",
  call: "call",
  goi: "call",
  "gọi": "call",
  "điện thoại": "call",
  "dien thoai": "call",
  chat: "chat",
  "nhắn tin": "chat",
  "nhan tin": "chat",
};

export interface ParsedV2Row {
  /** Số dòng trong ô nhập, tính từ 1 — để báo lỗi cho đúng chỗ */
  line: number;
  raw: string;
  vietnamese_text: string;
  /** Câu hoàn chỉnh, đã bỏ ngoặc vuông */
  english_text: string;
  chunks: DraftChunk[];
  context_tags: V2Context[];
  /** Dòng không dùng được, kèm lý do */
  error?: string;
  /** Dòng vẫn nhập được nhưng có chỗ đáng ngờ */
  warning?: string;
}

export interface ParseV2Result {
  rows: ParsedV2Row[];
  valid: ParsedV2Row[];
  invalid: ParsedV2Row[];
}

export const IMPORT_PLACEHOLDER =
  "Can we schedule [a call] next week? - Mình sắp xếp một cuộc gọi tuần sau nhé? - meeting, call\n" +
  "[Could you] send me [the deck]? - Bạn gửi mình bộ slide được không? - email";

export const IMPORT_HINT =
  "Mỗi dòng một câu: câu tiếng Anh - câu tiếng Việt - ngữ cảnh (không bắt buộc). " +
  "Đặt trong [ ] phần đổi được sang tình huống khác.";

/**
 * Cột cuối có phải danh sách ngữ cảnh không.
 *
 * Phải nhận diện bằng NỘI DUNG chứ không bằng vị trí: câu tiếng Việt có thể
 * chứa " - " nên số cột không cố định. Chỉ khi mọi mục trong cột cuối đều là
 * tên ngữ cảnh hợp lệ thì mới coi đó là cột ngữ cảnh — nếu không, nó là một
 * phần của câu tiếng Việt.
 */
function readContexts(part: string): V2Context[] | null {
  const items = part
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (items.length === 0) return null;

  const tags: V2Context[] = [];
  for (const item of items) {
    const tag = CONTEXT_ALIASES[item];
    if (!tag) return null;
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function parseLine(raw: string, line: number): ParsedV2Row {
  const parts = raw.split(SEPARATOR).map((p) => p.trim());
  const englishLine = parts[0] ?? "";
  const rest = parts.slice(1);

  // Thử đọc cột cuối thành ngữ cảnh; không phải thì trả lại cho câu tiếng Việt
  let context_tags: V2Context[] = [];
  if (rest.length > 1) {
    const maybe = readContexts(rest[rest.length - 1]);
    if (maybe) {
      context_tags = maybe;
      rest.pop();
    }
  }

  const vietnamese_text = rest.join(" - ").trim();
  const chunks = parseChunks(englishLine);
  const english_text = chunksToSentence(chunks);

  let error: string | undefined;
  let warning: string | undefined;

  if (!englishLine) {
    error = "Thiếu câu tiếng Anh";
  } else if (!vietnamese_text) {
    error = "Thiếu câu tiếng Việt (dùng dấu ' - ' để ngăn cách)";
  } else if (chunks.length === 0) {
    // Gõ đúng "[]" hoặc chỉ toàn ngoặc rỗng
    error = "Câu tiếng Anh rỗng sau khi bỏ ngoặc";
  } else {
    const opens = (englishLine.match(/\[/g) ?? []).length;
    const closes = (englishLine.match(/\]/g) ?? []).length;
    if (opens !== closes) {
      warning = "Ngoặc vuông không khớp — kiểm tra lại cách chia mẩu";
    } else if (chunks.length === 1) {
      warning = "Chỉ một mẩu, bài ghép câu sẽ không có gì để xếp";
    }
  }

  return {
    line,
    raw,
    vietnamese_text,
    english_text,
    chunks,
    context_tags,
    error,
    warning,
  };
}

/**
 * Tách văn bản dán vào thành danh sách thẻ.
 * Bỏ qua dòng trống. Dòng lỗi được giữ lại kèm lý do để admin sửa.
 */
export function parseV2ImportText(text: string): ParseV2Result {
  const rows: ParsedV2Row[] = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    const trimmed = raw.trim();
    if (!trimmed) return; // dòng trống không tính là lỗi
    rows.push(parseLine(trimmed, i + 1));
  });

  return {
    rows,
    valid: rows.filter((r) => !r.error),
    invalid: rows.filter((r) => r.error),
  };
}
