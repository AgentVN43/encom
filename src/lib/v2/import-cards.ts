import { chunksToSentence, parseChunks, type DraftChunk } from "./session";
import type { V2Register } from "./types";
import type { DraftFiller } from "./db";

/**
 * Nhập hàng loạt câu cho v2.
 *
 * Giữ đúng dấu phân cách của v1 (`\s+-\s+`) để admin không phải nhớ hai cú
 * pháp: gạch ngang có khoảng trắng hai bên, không cắt nhầm từ ghép
 * ("T-shirt") hay link.
 *
 *   # Xin lỗi                          ← đổi chủ đề cho các dòng bên dưới
 *   Sorry, [my bad]! - Xin lỗi nhé! - thân mật
 *   + my mistake = lỗi của mình       ← cụm thay thế cho câu ngay phía trên
 *   └── tiếng Anh, ngoặc vuông  └── tiếng Việt  └── mức trang trọng
 *                                                 (không bắt buộc)
 *
 * Chủ đề đi bằng DÒNG TIÊU ĐỀ chứ không thêm cột: dòng nhập đã có ba cột mà
 * hai cột cuối đều tuỳ chọn và nhận diện bằng nội dung — thêm cột nữa thì
 * không ai nhớ nổi thứ tự, và chỉ cần câu tiếng Việt trùng tên chủ đề là tách
 * sai. Tiêu đề bắt đầu bằng '#' thì dứt khoát, không phải đoán.
 *
 * Lĩnh vực (Work/Life/Social) vẫn chọn một lần cho cả loạt ở khu admin.
 */
const SEPARATOR = /\s+-\s+/;

/**
 * Dòng cụm thay thế: dấu cộng, rồi số thứ tự chỗ trống (bỏ trống = chỗ đầu),
 * rồi `tiếng Anh = nghĩa tiếng Việt`.
 *
 *   + a quick chat = một buổi trao đổi nhanh      → chỗ trống thứ nhất
 *   +2 a solid idea = một ý tưởng chắc chắn       → chỗ trống thứ hai
 *
 * Dùng dấu `=` chứ không dùng lại ` - `: dòng câu đã lấy ` - ` làm dấu tách
 * cột, mà nghĩa tiếng Việt của cụm cũng có thể chứa gạch ngang.
 */
const FILLER_LINE = /^\+\s*(\d*)\s*(.*)$/;

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

/** Chủ đề đã có trong DB, để đối chiếu tên trong dòng tiêu đề */
export interface ImportTopic {
  id: string;
  name: string;
}

export interface ParsedV2Row {
  /** Số dòng trong ô nhập, tính từ 1 — để báo lỗi cho đúng chỗ */
  line: number;
  raw: string;
  /** Dòng tiêu đề '#' — không phải câu, chỉ đổi chủ đề cho phần bên dưới */
  isHeader?: boolean;
  /** Dòng cụm '+' — không phải câu, chỉ bổ sung cho câu phía trên */
  isFiller?: boolean;
  /**
   * Cụm thay thế cho từng chỗ trống, khoá theo VỊ TRÍ chỗ trống
   * (`fillers[0]` là cụm cho chỗ trống đầu tiên của câu).
   */
  fillers: DraftFiller[][];
  /** Chủ đề nhận được từ tiêu đề gần nhất phía trên, hoặc chủ đề mặc định */
  topic_id: string;
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
  "# Đề nghị\n" +
  "Could you possibly spare [a moment]? - Anh/chị cho em xin một phút được không? - trang trọng\n" +
  "Can we schedule [a call] next week? - Mình sắp xếp một cuộc gọi tuần sau nhé? - trung tính\n" +
  "\n" +
  "# Xin lỗi\n" +
  "Sorry, [my bad]! - Xin lỗi nhé! - thân mật\n" +
  "+ my mistake = lỗi của mình\n" +
  "+ my fault = tại mình";

export const IMPORT_HINT =
  "Mỗi dòng một câu: câu tiếng Anh - câu tiếng Việt - mức trang trọng " +
  "(không bắt buộc, mặc định trung tính). Dòng '# Tên chủ đề' đổi chủ đề cho " +
  "các dòng bên dưới. Đặt trong [ ] phần đổi được, rồi thêm dòng " +
  "'+ cụm tiếng Anh = nghĩa' cho bài Rèn luyện.";

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

/**
 * Cột cuối có phải một DANH SÁCH mức trang trọng không.
 *
 * Cần riêng hàm này vì mức là đơn trị: gõ "trung tính, thân mật" thì
 * `readRegister` trả null, và nếu không bắt lại thì cả cụm đó bị nối vào câu
 * tiếng Việt — người soạn tưởng đã gắn mức, thực ra vừa nhét rác vào câu mà
 * không có cảnh báo nào.
 */
function looksLikeRegisterList(part: string): boolean {
  const items = part
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 1 && items.every((i) => readRegister(i) !== null);
}

function parseLine(raw: string, line: number): ParsedV2Row {
  const parts = raw.split(SEPARATOR).map((p) => p.trim());
  const englishLine = parts[0] ?? "";
  const rest = parts.slice(1);

  // Thử đọc cột cuối thành mức trang trọng; không phải thì trả lại cho câu
  // tiếng Việt. Chỉ xét khi còn ít nhất hai cột, để dòng hai cột không bị
  // hiểu nhầm câu tiếng Việt thành mức.
  let register: V2Register = DEFAULT_REGISTER;
  let registerError: string | undefined;
  if (rest.length > 1) {
    const last = rest[rest.length - 1];
    const maybe = readRegister(last);
    if (maybe) {
      register = maybe;
      rest.pop();
    } else if (looksLikeRegisterList(last)) {
      // Bỏ cụm đó ra khỏi câu tiếng Việt luôn, để phần xem trước hiện đúng
      // câu người soạn định viết chứ không kèm đuôi rác
      rest.pop();
      registerError =
        "Mức trang trọng chỉ chọn MỘT. Câu dùng được ở nhiều mức thì tách thành nhiều dòng, mỗi dòng một mức";
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
  } else if (registerError) {
    error = registerError;
  } else {
    const opens = (englishLine.match(/\[/g) ?? []).length;
    const closes = (englishLine.match(/\]/g) ?? []).length;
    if (opens !== closes) {
      warning = "Ngoặc vuông không khớp — kiểm tra lại cách chia mẩu";
    } else if (chunks.length === 1) {
      // Vẫn ra được bài, chỉ là dạng dễ hơn: khay có mẩu nhiễu nên người học
      // CHỌN đúng câu thay vì XẾP lại thứ tự. Câu ngắn như "Sounds good" thì
      // để vậy là hợp lý, không cần cố chia.
      warning =
        "Câu chưa chia mẩu — người học sẽ chọn đúng câu thay vì xếp thứ tự (dễ hơn). Dùng [ ] để tách phần đổi được nếu câu đủ dài";
    }
  }

  return {
    line,
    raw,
    topic_id: "",
    vietnamese_text,
    english_text,
    chunks,
    register,
    fillers: [],
    error,
    warning,
  };
}

/** Dòng chỉ dẫn (# hoặc +) bị hỏng — giữ lại để báo đúng số dòng cho admin */
function directiveError(
  line: number,
  raw: string,
  error: string,
  kind: "header" | "filler"
): ParsedV2Row {
  return {
    line,
    raw,
    isHeader: kind === "header",
    isFiller: kind === "filler",
    topic_id: "",
    vietnamese_text: "",
    english_text: "",
    chunks: [],
    register: DEFAULT_REGISTER,
    fillers: [],
    error,
  };
}

/**
 * Đọc một dòng `+` và gắn cụm vào câu ngay phía trên.
 *
 * Trả về mảng rỗng khi thành công — dòng cụm không phải một thẻ nên không sinh
 * dòng nào; chỉ khi hỏng mới trả về một dòng lỗi để báo đúng số dòng.
 */
function readFillerLine(
  match: RegExpExecArray,
  raw: string,
  line: number,
  rows: ParsedV2Row[]
): ParsedV2Row[] {
  const fail = (msg: string) => [directiveError(line, raw, msg, "filler")];

  // Câu gần nhất phía trên, bỏ qua các dòng chỉ dẫn
  const target = [...rows]
    .reverse()
    .find((r) => !r.isHeader && !r.isFiller);
  if (!target) {
    return fail("Dòng cụm phải nằm ngay dưới một câu");
  }
  if (target.error) {
    return fail("Câu phía trên đang lỗi nên chưa gắn được cụm");
  }

  const slots = target.chunks.filter((c) => c.kind === "slot");
  if (slots.length === 0) {
    return fail(
      "Câu phía trên không có chỗ trống nào — đặt [ ] quanh phần đổi được trước"
    );
  }

  // Số thứ tự bỏ trống nghĩa là chỗ trống đầu tiên, tiện cho câu chỉ có một chỗ
  const slotIndex = match[1] ? Number(match[1]) - 1 : 0;
  if (slotIndex < 0 || slotIndex >= slots.length) {
    return fail(
      `Câu phía trên chỉ có ${slots.length} chỗ trống, không có chỗ số ${slotIndex + 1}`
    );
  }

  const body = match[2] ?? "";
  const eq = body.indexOf("=");
  if (eq === -1) {
    return fail("Thiếu dấu '=' giữa cụm tiếng Anh và nghĩa tiếng Việt");
  }
  const filler_text = body.slice(0, eq).trim();
  const filler_vi = body.slice(eq + 1).trim();
  if (!filler_text) return fail("Thiếu cụm tiếng Anh");
  if (!filler_vi) {
    // Không có nghĩa thì bài Rèn luyện không nêu được tình huống để hỏi
    return fail("Thiếu nghĩa tiếng Việt của cụm");
  }

  while (target.fillers.length <= slotIndex) target.fillers.push([]);
  target.fillers[slotIndex].push({ filler_text, filler_vi });
  return [];
}

/**
 * Tách văn bản dán vào thành danh sách thẻ.
 *
 * Bỏ qua dòng trống. Dòng lỗi được giữ lại kèm lý do để admin sửa.
 *
 * `defaultTopicId` áp cho các dòng đứng TRƯỚC tiêu đề đầu tiên — dán một loạt
 * cùng chức năng thì không cần gõ tiêu đề nào cả.
 */
export function parseV2ImportText(
  text: string,
  topics: ImportTopic[] = [],
  defaultTopicId = ""
): ParseV2Result {
  const rows: ParsedV2Row[] = [];
  let currentTopicId = defaultTopicId;

  text.split(/\r?\n/).forEach((raw, i) => {
    const trimmed = raw.trim();
    if (!trimmed) return; // dòng trống không tính là lỗi
    const line = i + 1;

    const header = /^#\s*(.*)$/.exec(trimmed);
    if (header) {
      const name = header[1].trim();
      const found = topics.find(
        (t) => t.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (!name) {
        // Đặt rỗng chứ không giữ chủ đề cũ: tiêu đề hỏng mà vẫn đổ tiếp vào
        // chủ đề trước đó là âm thầm gán sai chức năng cho cả khối bên dưới
        currentTopicId = "";
        rows.push(
          directiveError(
            line,
            trimmed,
            "Dòng tiêu đề thiếu tên chủ đề",
            "header"
          )
        );
      } else if (!found) {
        currentTopicId = "";
        rows.push(
          directiveError(
            line,
            trimmed,
            `Không có chủ đề nào tên "${name}"`,
            "header"
          )
        );
      } else {
        currentTopicId = found.id;
      }
      return;
    }

    const filler = FILLER_LINE.exec(trimmed);
    if (filler) {
      rows.push(...readFillerLine(filler, trimmed, line, rows));
      return;
    }

    const row = parseLine(trimmed, line);
    row.topic_id = currentTopicId;

    // Gõ trần tên chủ đề làm dòng phân cách là phản xạ rất tự nhiên. Báo
    // "Thiếu câu tiếng Việt" ở đây thì đúng về mặt máy nhưng vô dụng với
    // người — đoán ra ý định rồi chỉ thẳng cách sửa.
    if (row.error) {
      const asTopic = topics.find(
        (t) => t.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (asTopic) {
        row.error = `Có phải bạn muốn đổi chủ đề? Thêm dấu # ở đầu: "# ${asTopic.name}"`;
      }
    }

    if (!row.error && !row.topic_id) {
      row.error =
        "Chưa rõ chủ đề — thêm dòng '# Tên chủ đề' phía trên, hoặc chọn chủ đề mặc định";
    }
    rows.push(row);
  });

  return {
    rows,
    // Dòng chỉ dẫn (# và +) không phải câu nên không tính vào số sẽ nhập
    valid: rows.filter((r) => !r.error && !r.isHeader && !r.isFiller),
    invalid: rows.filter((r) => r.error),
  };
}
