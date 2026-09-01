import { chunksToSentence, parseChunks, type DraftChunk } from "./session";
import type { V2Register } from "./types";

/**
 * Nhập hàng loạt câu cho v2.
 *
 * Giữ đúng dấu phân cách của v1 (`\s+-\s+`) để admin không phải nhớ hai cú
 * pháp: gạch ngang có khoảng trắng hai bên, không cắt nhầm từ ghép
 * ("T-shirt") hay link.
 *
 *   Can we schedule [a call]? - Mình sắp xếp một cuộc gọi nhé? - trang trọng
 *   └── tiếng Anh, ngoặc vuông     └── tiếng Việt              └── mức trang trọng
 *                                                                (không bắt buộc)
 *
 * Lĩnh vực (Work/Life/Social) KHÔNG nằm trong dòng nhập mà chọn một lần cho
 * cả loạt ở khu admin: một lần nhập gần như luôn cùng một lĩnh vực, và tên
 * lĩnh vực sửa được nên không kiểm tra trước được như mức trang trọng.
 */
const SEPARATOR = /\s+-\s+/;

/** Mức mặc định khi dòng nhập không ghi — phần lớn câu là trung tính */
const DEFAULT_REGISTER: V2Register = "neutral";

/** Tên mức trang trọng chấp nhận được, cả tiếng Anh lẫn tiếng Việt */
const REGISTER_ALIASES: Record<string, V2Register> = {
  formal: "formal",
  "trang trọng": "formal",
  "trang trong": "formal",
  neutral: "neutral",
  "trung tính": "neutral",
  "trung tinh": "neutral",
  informal: "informal",
  "thân mật": "informal",
  "than mat": "informal",
  casual: "informal",
};

export interface ParsedV2Row {
  /** Số dòng trong ô nhập, tính từ 1 — để báo lỗi cho đúng chỗ */
  line: number;
  raw: string;
  vietnamese_text: string;
  /** Câu hoàn chỉnh, đã bỏ ngoặc vuông */
  english_text: string;
  chunks: DraftChunk[];
  register: V2Register;
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
  "Could you possibly spare [a moment]? - Anh/chị cho em xin một phút được không? - trang trọng\n" +
  "Can we schedule [a call] next week? - Mình sắp xếp một cuộc gọi tuần sau nhé? - trung tính\n" +
  "Got [a sec]? - Rảnh chút không? - thân mật";

export const IMPORT_HINT =
  "Mỗi dòng một câu: câu tiếng Anh - câu tiếng Việt - mức trang trọng " +
  "(không bắt buộc, mặc định trung tính). Đặt trong [ ] phần đổi được.";

/**
 * Cột cuối có phải mức trang trọng không.
 *
 * Phải nhận diện bằng NỘI DUNG chứ không bằng vị trí: câu tiếng Việt có thể
 * chứa " - " nên số cột không cố định. Chỉ khi cột cuối đúng là một tên mức
 * hợp lệ thì mới tách ra — nếu không, nó là một phần của câu tiếng Việt.
 */
function readRegister(part: string): V2Register | null {
  return REGISTER_ALIASES[part.trim().toLowerCase()] ?? null;
}

function parseLine(raw: string, line: number): ParsedV2Row {
  const parts = raw.split(SEPARATOR).map((p) => p.trim());
  const englishLine = parts[0] ?? "";
  const rest = parts.slice(1);

  // Thử đọc cột cuối thành mức trang trọng; không phải thì trả lại cho câu
  // tiếng Việt. Chỉ xét khi còn ít nhất hai cột, để dòng hai cột không bị
  // hiểu nhầm câu tiếng Việt thành mức.
  let register: V2Register = DEFAULT_REGISTER;
  if (rest.length > 1) {
    const maybe = readRegister(rest[rest.length - 1]);
    if (maybe) {
      register = maybe;
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
    register,
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
