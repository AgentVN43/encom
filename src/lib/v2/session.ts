import { shuffleArray } from "../utils";
import type { V2Chunk, V2ChunkKind } from "./types";

/** Hàm trộn mảng — tách ra để test truyền bản tất định vào */
type Shuffle = <T>(items: T[]) => T[];

/** Số mẩu thừa ném thêm vào khay ở bài ghép câu */
export const CHUNK_DISTRACTOR_COUNT = 2;

/** Một mẩu hiện trên khay để người học kéo vào chỗ trống */
export interface ChunkTile {
  id: string;
  text: string;
  kind: V2ChunkKind;
}

/** Đề bài ghép câu: khay mẩu đã trộn + đáp án đúng để chấm */
export interface ChunkQuestion {
  /** Các mẩu bày ra cho người học, đã trộn — gồm cả mẩu thừa */
  tiles: ChunkTile[];
  /** Mẩu của câu đúng, đã xếp theo `position` tăng dần */
  solution: V2Chunk[];
}

/** So chữ bỏ qua hoa thường và khoảng trắng thừa */
function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Dựng đề bài ghép câu cho bước Ôn tập.
 *
 * `pool` phải là TOÀN BỘ mẩu của cả topic (không riêng câu đang hỏi) — nhiễu
 * rút từ cùng một chức năng giao tiếp thì đủ giống để phải đọc kỹ, nhưng không
 * lẫn sang chức năng khác khiến mẩu thừa lộ liễu.
 *
 * Mẩu thừa bị loại nếu trùng chữ với bất kỳ mẩu nào của câu đúng: hai mẩu cùng
 * chữ nằm trên khay thì có hai cách xếp cùng đúng mà máy lại chấm sai một cách.
 */
export function buildChunkQuestion(
  cardChunks: V2Chunk[],
  pool: V2Chunk[],
  distractorCount: number = CHUNK_DISTRACTOR_COUNT,
  shuffle: Shuffle = shuffleArray
): ChunkQuestion {
  const solution = [...cardChunks].sort((a, b) => a.position - b.position);

  const cardIds = new Set(solution.map((c) => c.card_id));
  const seen = new Set(solution.map((c) => normalize(c.text)));

  const candidates: V2Chunk[] = [];
  for (const chunk of pool) {
    // Mẩu của chính câu đang hỏi đã nằm sẵn trong đáp án
    if (cardIds.has(chunk.card_id)) continue;
    const text = normalize(chunk.text);
    if (seen.has(text)) continue;
    seen.add(text);
    candidates.push(chunk);
  }

  const distractors = shuffle(candidates).slice(0, Math.max(0, distractorCount));

  return {
    tiles: shuffle(
      [...solution, ...distractors].map((c) => ({
        id: c.id,
        text: c.text,
        kind: c.kind,
      }))
    ),
    solution,
  };
}

/**
 * Chấm bài ghép câu: dãy mẩu người học xếp ra có đúng thứ tự không.
 *
 * So bằng chữ chứ không bằng id — một câu có thể chứa hai mẩu cùng chữ (VD
 * "to" xuất hiện hai lần), khi đó xếp mẩu nào vào chỗ nào cũng ra đúng một câu
 * và phải được tính đúng.
 */
export function isChunkOrderCorrect(
  answer: ChunkTile[],
  solution: V2Chunk[]
): boolean {
  if (answer.length !== solution.length) return false;
  return answer.every(
    (tile, i) => normalize(tile.text) === normalize(solution[i].text)
  );
}

/** Mẩu do admin soạn, chưa có id vì chưa ghi xuống DB */
export type DraftChunk = Pick<V2Chunk, "text" | "kind">;

/**
 * Chia câu thành mẩu theo dấu ngoặc vuông của admin.
 *
 *   "Can we schedule [a call] next week?"
 *   → frame "Can we schedule" · slot "a call" · frame "next week?"
 *
 * Chọn cú pháp gõ tay thay vì giao diện kéo thả vì soạn nội dung là việc lặp
 * hàng trăm lần: gõ một dòng nhanh hơn nhiều so với bấm chia từng mẩu, và dán
 * được cả loạt câu từ file soạn sẵn.
 *
 * Ngoặc thừa hoặc thiếu không làm vỡ — phần dư coi như chữ thường, để admin gõ
 * dở chừng vẫn thấy xem trước thay vì gặp lỗi đỏ.
 */
export function parseChunks(text: string): DraftChunk[] {
  const chunks: DraftChunk[] = [];
  let buffer = "";
  let inSlot = false;

  const flush = (kind: DraftChunk["kind"]) => {
    const trimmed = buffer.trim();
    if (trimmed) chunks.push({ text: trimmed, kind });
    buffer = "";
  };

  for (const ch of text) {
    if (ch === "[" && !inSlot) {
      flush("frame");
      inSlot = true;
    } else if (ch === "]" && inSlot) {
      flush("slot");
      inSlot = false;
    } else {
      buffer += ch;
    }
  }
  // Ngoặc mở chưa đóng: phần đuôi vẫn là chỗ thay được theo đúng ý admin đang gõ
  flush(inSlot ? "slot" : "frame");

  return chunks;
}

/** Dựng lại dòng có ngoặc từ mẩu đã lưu — để sửa thẻ cũ không phải gõ lại */
export function formatChunks(chunks: DraftChunk[]): string {
  return chunks
    .map((c) => (c.kind === "slot" ? `[${c.text}]` : c.text))
    .join(" ");
}

/**
 * Câu tiếng Anh hoàn chỉnh ghép từ các mẩu.
 *
 * Dùng làm `english_text` để không bắt admin gõ câu hai lần — gõ hai lần là
 * hai bản dễ lệch nhau, mà lệch thì bài ôn chấm một đằng hiển thị một nẻo.
 */
export function chunksToSentence(chunks: DraftChunk[]): string {
  return chunks.map((c) => c.text).join(" ");
}

/**
 * Các mẩu thay thế cho một bài Substitution Drill.
 *
 * Giữ nguyên mẩu `frame`, chỉ đổi mẩu `slot` — nên hàm này chỉ trả về vị trí
 * các mẩu thay được. Nội dung thay thế (`v2_substitution_fillers`) do admin
 * nhập tay, không sinh từ đây.
 */
export function slotChunks(cardChunks: V2Chunk[]): V2Chunk[] {
  return [...cardChunks]
    .sort((a, b) => a.position - b.position)
    .filter((c) => c.kind === "slot");
}
