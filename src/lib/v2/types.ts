/**
 * Kiểu dữ liệu cho v2 (người đi làm, giao tiếp công sở).
 *
 * Tách hẳn khỏi `src/lib/types.ts` của v1 — hai track dùng bảng riêng
 * (`v2_*`), không chia sẻ kiểu nào. Xem
 * `supabase/design_v2_pedagogy_schema.sql` để đối chiếu cột.
 */

/**
 * Mức trang trọng của một câu — ĐƠN TRỊ và CÓ THỨ TỰ.
 *
 * Thay cho ngữ cảnh (email/gọi/chat) từng dùng trước đây. Kênh giao tiếp gắn
 * đúng gần hết mọi câu nên lọc theo nó không loại được gì; mức trang trọng thì
 * tự chia tập, và vì có thứ tự nên hiện được cùng một chức năng ở ba mức —
 * "Could you possibly…" / "Could you…" / "Can you…" — cho người học thấy cả
 * cái thang chứ không chỉ từng câu rời.
 */
export type V2Register = "formal" | "neutral" | "informal";

/** Từ trang trọng nhất tới thân mật nhất — thứ tự này là dữ liệu, đừng đảo */
export const REGISTER_ORDER: V2Register[] = ["formal", "neutral", "informal"];

export const REGISTER_LABEL: Record<V2Register, string> = {
  formal: "Trang trọng",
  neutral: "Trung tính",
  informal: "Thân mật",
};

/**
 * Vai trò của một mẩu câu.
 *
 * `frame` — khung cố định, giữ nguyên khi đổi tình huống ("Can we schedule").
 * `slot`  — phần thay được, chính là chỗ bài Substitution Drill hoán đổi
 *   ("a call" → "a quick chat").
 */
export type V2ChunkKind = "frame" | "slot";

/**
 * Câu cụ thể. Ba trục phân loại, mỗi trục một cơ chế khác nhau vì bản chất
 * khác nhau — xem `supabase/migration_v2_matrix.sql`:
 *   - Chức năng  → `topic_id`, đơn trị. Một câu có một mục đích chính.
 *   - Mức trang trọng → `register`, đơn trị, có thứ tự.
 *   - Lĩnh vực   → bảng nối `v2_card_categories`, ĐA TRỊ. Không nằm trên
 *     interface này vì là quan hệ nhiều-nhiều; lấy riêng qua db.
 */
export interface V2Card {
  id: string;
  topic_id: string;
  vietnamese_text: string;
  english_text: string;
  pronunciation_audio_url: string;
  register: V2Register;
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
