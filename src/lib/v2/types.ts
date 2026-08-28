/**
 * Kiểu dữ liệu cho v2 (người đi làm, giao tiếp công sở).
 *
 * Tách hẳn khỏi `src/lib/types.ts` của v1 — hai track dùng bảng riêng
 * (`v2_*`), không chia sẻ kiểu nào. Xem
 * `supabase/design_v2_pedagogy_schema.sql` để đối chiếu cột.
 */

/** Ngữ cảnh dùng được của một câu — đa chọn, phẳng, không phải hierarchy */
export type V2Context = "meeting" | "email" | "call" | "chat";

/**
 * Vai trò của một mẩu câu.
 *
 * `frame` — khung cố định, giữ nguyên khi đổi tình huống ("Can we schedule").
 * `slot`  — phần thay được, chính là chỗ bài Substitution Drill hoán đổi
 *   ("a call" → "a quick chat").
 */
export type V2ChunkKind = "frame" | "slot";

/** Câu cụ thể, thuộc đúng 1 topic (= 1 chức năng giao tiếp) */
export interface V2Card {
  id: string;
  topic_id: string;
  vietnamese_text: string;
  english_text: string;
  pronunciation_audio_url: string;
  context_tags: V2Context[];
  position: number;
  created_at: string;
  updated_at: string;
}

/**
 * Một mẩu của câu. Thứ tự ghép đúng là `position` tăng dần.
 *
 * Đây là dữ liệu vận hành thật chứ không phải để hiển thị cho đẹp: bước Học
 * mới tô màu theo `kind`, bước Ôn tập bắt ghép lại theo `position`, bước Vận
 * dụng chỉ hoán đổi mẩu `slot`.
 */
export interface V2Chunk {
  id: string;
  card_id: string;
  text: string;
  kind: V2ChunkKind;
  position: number;
  created_at: string;
  updated_at: string;
}
