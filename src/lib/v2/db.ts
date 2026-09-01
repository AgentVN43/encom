import { supabase } from "../supabase";
import {
  DEFAULT_REQUEST_RETENTION,
  reviewCard,
  startLearning,
  type V2ProgressRow,
} from "./srs";
import type { Grade } from "ts-fsrs";
import type { V2Card, V2Chunk, V2Context } from "./types";

/**
 * Truy cập Supabase cho v2.
 *
 * Giữ đúng pattern v1 (`src/lib/db.ts`): client gọi thẳng Supabase, RLS lo
 * phân quyền, không có route handler hay server action ở giữa.
 *
 * Mọi bảng ở đây mang tiền tố `v2_` và tách hẳn khỏi bảng v1 — trừ `profiles`
 * và `auth.users` dùng chung cho cả hai track.
 */

/** Danh sách cột của v2_progress — viết một lần để mọi truy vấn lấy đủ cột FSRS */
const PROGRESS_COLUMNS =
  "card_id, streak, fsrs_due, fsrs_stability, fsrs_difficulty, " +
  "fsrs_elapsed_days, fsrs_scheduled_days, fsrs_learning_steps, " +
  "fsrs_reps, fsrs_lapses, fsrs_state, last_review";

// ---------------------------------------------------------------------------
// Nội dung — đọc
// ---------------------------------------------------------------------------

export interface V2Category {
  id: string;
  name: string;
  description: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface V2Topic {
  id: string;
  category_id: string | null;
  name: string;
  description: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export async function getV2Categories() {
  const { data, error } = await supabase
    .from("v2_categories")
    .select("*")
    .order("position")
    .order("name");
  if (error) throw error;
  return data as V2Category[];
}

export async function getV2Topic(id: string) {
  const { data, error } = await supabase
    .from("v2_topics")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as V2Topic | null;
}

export async function getV2Topics(categoryId?: string) {
  let query = supabase.from("v2_topics").select("*");
  if (categoryId) query = query.eq("category_id", categoryId);
  const { data, error } = await query.order("position").order("name");
  if (error) throw error;
  return data as V2Topic[];
}

/**
 * Câu của một chủ đề, lọc thêm theo ngữ cảnh nếu cần.
 *
 * `contains` dịch thành toán tử `@>` của Postgres và dùng được index GIN trên
 * `context_tags` — đừng thay bằng lọc ở phía client.
 */
export async function getV2Cards(topicId: string, context?: V2Context) {
  let query = supabase.from("v2_cards").select("*").eq("topic_id", topicId);
  if (context) query = query.contains("context_tags", [context]);
  const { data, error } = await query.order("position");
  if (error) throw error;
  return data as V2Card[];
}

/**
 * Số thẻ của từng chủ đề, cho trang chủ.
 *
 * Chỉ lấy hai cột thay vì `*`: trang chủ chỉ cần đếm, mà câu tiếng Anh/Việt
 * của cả thư viện là payload lớn không dùng tới.
 */
export async function getV2CardCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("v2_cards").select("id, topic_id");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.topic_id] = (counts[row.topic_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Mẩu câu của một nhóm thẻ, đã xếp theo thứ tự ghép đúng.
 *
 * Lấy cả nhóm trong một lượt chứ không gọi từng thẻ: một phiên ôn tập trộn xen
 * kẽ hàng chục thẻ, gọi lẻ thành hàng chục request.
 */
export async function getV2Chunks(cardIds: string[]) {
  if (cardIds.length === 0) return [];
  const { data, error } = await supabase
    .from("v2_chunks")
    .select("*")
    .in("card_id", cardIds)
    .order("position");
  if (error) throw error;
  return data as V2Chunk[];
}

/** Toàn bộ mẩu của một chủ đề — nguồn mẩu nhiễu cho bài ghép câu */
export async function getTopicChunks(topicId: string) {
  const { data, error } = await supabase
    .from("v2_chunks")
    .select("*, v2_cards!inner(topic_id)")
    .eq("v2_cards.topic_id", topicId)
    .order("position");
  if (error) throw error;
  return (data ?? []) as unknown as V2Chunk[];
}

export interface V2SubstitutionFiller {
  id: string;
  slot_chunk_id: string;
  filler_text: string;
  position: number;
  created_at: string;
}

/** Nội dung thay thế đã duyệt cho các mẩu 'slot' của một thẻ */
export async function getSubstitutionFillers(slotChunkIds: string[]) {
  if (slotChunkIds.length === 0) return [];
  const { data, error } = await supabase
    .from("v2_substitution_fillers")
    .select("*")
    .in("slot_chunk_id", slotChunkIds)
    .order("position");
  if (error) throw error;
  return data as V2SubstitutionFiller[];
}

export interface V2AdjacencyPair {
  id: string;
  target_card_id: string;
  response_card_id: string;
  created_at: string;
}

/**
 * Cặp thoại hỏi-đáp có câu Target nằm trong nhóm thẻ đang xét.
 *
 * Nhận `cardIds` chứ không nhận `topicId` để KHÔNG phải join sang v2_cards:
 * bảng này có hai khoá ngoại cùng trỏ về v2_cards (target và response) nên mọi
 * lệnh embed đều phải chỉ đích danh tên khoá — một thứ dễ sai lặng lẽ khi đổi
 * schema. Tầng gọi vốn đã có sẵn danh sách thẻ của chủ đề.
 */
export async function getAdjacencyPairs(cardIds: string[]) {
  if (cardIds.length === 0) return [];
  const { data, error } = await supabase
    .from("v2_adjacency_pairs")
    .select("*")
    .in("target_card_id", cardIds);
  if (error) throw error;
  return data as V2AdjacencyPair[];
}

// ---------------------------------------------------------------------------
// Tiến độ người học
// ---------------------------------------------------------------------------

/** Mức nhớ mục tiêu của người học; chưa có cài đặt thì dùng mặc định FSRS */
export async function getRequestRetention(userId: string): Promise<number> {
  const { data } = await supabase
    .from("v2_user_settings")
    .select("request_retention")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.request_retention ?? DEFAULT_REQUEST_RETENTION;
}

export async function setRequestRetention(userId: string, value: number) {
  const { error } = await supabase
    .from("v2_user_settings")
    .upsert(
      { user_id: userId, request_retention: value },
      { onConflict: "user_id" }
    );
  if (error) throw error;
}

/** Tiến độ của user với riêng các thẻ đang hỏi */
export async function getProgressForCards(userId: string, cardIds: string[]) {
  if (cardIds.length === 0) return [];
  const { data, error } = await supabase
    .from("v2_progress")
    .select(PROGRESS_COLUMNS)
    .eq("user_id", userId)
    .in("card_id", cardIds);
  if (error) throw error;
  return (data ?? []) as unknown as V2ProgressRow[];
}

/**
 * Thẻ tới hạn ôn, TRỘN XEN KẼ nhiều chủ đề trong cùng một phiên.
 *
 * Không lọc theo topic là có chủ đích: ôn dồn từng chủ đề một thì người học
 * đoán được "đang ở bài Suggesting nên chắc dùng câu gợi ý", còn xen kẽ buộc
 * phải tự phân biệt dùng câu nào. Thứ tự do DB trả về theo hạn tăng dần, tầng
 * gọi trộn lại nếu muốn.
 */
export async function getDueCards(userId: string, limit: number) {
  if (limit <= 0) return [];
  const { data, error } = await supabase
    .from("v2_progress")
    .select(`${PROGRESS_COLUMNS}, v2_cards!inner(*)`)
    .eq("user_id", userId)
    .not("fsrs_due", "is", null)
    .lte("fsrs_due", new Date().toISOString())
    .order("fsrs_due")
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as (V2ProgressRow & { v2_cards: V2Card })[];
}

/**
 * Thẻ chưa từng học của một chủ đề.
 *
 * PostgREST không viết được `NOT EXISTS` nên phải lấy danh sách thẻ đã có tiến
 * độ rồi loại ra. Danh sách này chỉ gồm thẻ user đã đụng tới nên nhỏ, nhưng
 * đây vẫn là hai lượt gọi — nếu sau này thư viện câu lớn lên thì đổi sang một
 * RPC làm anti-join ngay trong Postgres.
 */
export async function getNewCards(
  userId: string,
  topicId: string,
  limit: number
) {
  if (limit <= 0) return [];

  const { data: seen, error: seenError } = await supabase
    .from("v2_progress")
    .select("card_id, v2_cards!inner(topic_id)")
    .eq("user_id", userId)
    .eq("v2_cards.topic_id", topicId);
  if (seenError) throw seenError;

  const seenIds = (seen ?? []).map((r) => r.card_id);

  let query = supabase.from("v2_cards").select("*").eq("topic_id", topicId);
  if (seenIds.length > 0) {
    query = query.not("id", "in", `(${seenIds.join(",")})`);
  }
  const { data, error } = await query.order("position").limit(limit);
  if (error) throw error;
  return data as V2Card[];
}

/**
 * Ghi nhận người học bấm "Đã hiểu" ở giai đoạn Học mới.
 *
 * Không chấm điểm — bấm "Đã hiểu" không phải trả lời đúng. Chỉ đặt lịch ban
 * đầu để thẻ bắt đầu xuất hiện trong hàng chờ ôn tập.
 *
 * `ignoreDuplicates` để học lại một thẻ đã học không xoá mất lịch ôn đang có.
 */
export async function markUnderstood(userId: string, cardId: string) {
  const { error } = await supabase
    .from("v2_progress")
    .upsert(
      { user_id: userId, ...startLearning(cardId) },
      { onConflict: "user_id, card_id", ignoreDuplicates: true }
    );
  if (error) throw error;
}

/**
 * Chấm một lượt ôn và ghi lịch mới.
 *
 * Đọc lại hàng hiện tại trước khi tính: FSRS cộng dồn từ trạng thái cũ
 * (stability, difficulty, số lần quên), tính từ hàng cũ trong bộ nhớ của màn
 * hình thì hai tab mở song song sẽ ghi đè lịch của nhau.
 *
 * Thẻ chưa có hàng tiến độ vẫn ôn được — coi như thẻ mới, FSRS tự khởi tạo.
 */
export async function saveReview(
  userId: string,
  cardId: string,
  grade: Grade,
  now: Date = new Date()
) {
  const [rows, retention] = await Promise.all([
    getProgressForCards(userId, [cardId]),
    getRequestRetention(userId),
  ]);

  const current: V2ProgressRow = rows[0] ?? {
    card_id: cardId,
    streak: 0,
    fsrs_due: null,
    fsrs_stability: null,
    fsrs_difficulty: null,
    fsrs_elapsed_days: 0,
    fsrs_scheduled_days: 0,
    fsrs_learning_steps: 0,
    fsrs_reps: 0,
    fsrs_lapses: 0,
    fsrs_state: 0,
    last_review: null,
  };

  const patch = reviewCard(current, grade, now, retention);

  const { error } = await supabase
    .from("v2_progress")
    .upsert(
      { user_id: userId, card_id: cardId, ...patch },
      { onConflict: "user_id, card_id" }
    );
  if (error) throw error;
  return patch;
}

/**
 * Log một lượt luyện giai đoạn Vận dụng hoặc Phản xạ.
 *
 * Chỉ để thống kê và tránh lặp lại ngay trong cùng phiên — hai giai đoạn này
 * không có lịch giãn cách riêng nên không đụng tới v2_progress.
 */
export async function logPracticeAttempt(
  userId: string,
  cardId: string,
  stage: "applying" | "quiz",
  isCorrect: boolean
) {
  const { error } = await supabase.from("v2_practice_attempts").insert({
    user_id: userId,
    card_id: cardId,
    stage,
    is_correct: isCorrect,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Admin — soạn nội dung
// ---------------------------------------------------------------------------

export async function createV2Category(input: Partial<V2Category>) {
  const { data, error } = await supabase
    .from("v2_categories")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as V2Category;
}

export async function updateV2Category(id: string, updates: Partial<V2Category>) {
  const { error } = await supabase
    .from("v2_categories")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

/**
 * Xoá nhóm. Chủ đề bên trong KHÔNG mất theo (khoá ngoại đặt ON DELETE SET
 * NULL) — chúng thành mồ côi và biến khỏi trang chủ cho tới khi được gán nhóm
 * khác. v2 không có nhóm "Chưa phân loại" như v1, nên tầng gọi phải cảnh báo.
 */
export async function deleteV2Category(id: string) {
  const { error } = await supabase.from("v2_categories").delete().eq("id", id);
  if (error) throw error;
}

/** Số chủ đề đang nằm trong một nhóm — để cảnh báo trước khi xoá */
export async function countTopicsInCategory(categoryId: string) {
  const { count, error } = await supabase
    .from("v2_topics")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);
  if (error) throw error;
  return count ?? 0;
}

export async function createV2Topic(input: Partial<V2Topic>) {
  const { data, error } = await supabase
    .from("v2_topics")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as V2Topic;
}

export async function updateV2Topic(id: string, updates: Partial<V2Topic>) {
  const { error } = await supabase
    .from("v2_topics")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

/** Xoá chủ đề — thẻ bên trong mất theo (ON DELETE CASCADE), cùng cả chunk */
export async function deleteV2Topic(id: string) {
  const { error } = await supabase.from("v2_topics").delete().eq("id", id);
  if (error) throw error;
}

/** Số thẻ trong một chủ đề — để cảnh báo trước khi xoá */
export async function countCardsInTopic(topicId: string) {
  const { count, error } = await supabase
    .from("v2_cards")
    .select("id", { count: "exact", head: true })
    .eq("topic_id", topicId);
  if (error) throw error;
  return count ?? 0;
}

export async function updateV2Card(id: string, updates: Partial<V2Card>) {
  const { error } = await supabase.from("v2_cards").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteV2Card(id: string) {
  const { error } = await supabase.from("v2_cards").delete().eq("id", id);
  if (error) throw error;
}

export async function createV2Card(input: Partial<V2Card>) {
  const { data, error } = await supabase
    .from("v2_cards")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as V2Card;
}

/**
 * Ghi lại toàn bộ mẩu của một thẻ.
 *
 * Xoá hết rồi chèn lại thay vì sửa từng mẩu: admin thường kéo thả đổi cả cách
 * chia câu, so khớp mẩu cũ với mẩu mới phức tạp hơn nhiều so với lợi ích.
 *
 * Đánh lại `position` theo thứ tự mảng truyền vào, để tầng gọi không phải tự
 * quản số — sai số này làm bài ghép câu chấm sai mà rất khó truy.
 */
export async function replaceChunks(
  cardId: string,
  chunks: Pick<V2Chunk, "text" | "kind">[]
) {
  const { error: delError } = await supabase
    .from("v2_chunks")
    .delete()
    .eq("card_id", cardId);
  if (delError) throw delError;

  if (chunks.length === 0) return [];

  const { data, error } = await supabase
    .from("v2_chunks")
    .insert(
      chunks.map((c, i) => ({
        card_id: cardId,
        text: c.text,
        kind: c.kind,
        position: i,
      }))
    )
    .select();
  if (error) throw error;
  return data as V2Chunk[];
}

/** Nội dung thay thế đã duyệt cho một mẩu 'slot' */
export async function replaceFillers(slotChunkId: string, fillers: string[]) {
  const { error: delError } = await supabase
    .from("v2_substitution_fillers")
    .delete()
    .eq("slot_chunk_id", slotChunkId);
  if (delError) throw delError;

  if (fillers.length === 0) return [];

  const { data, error } = await supabase
    .from("v2_substitution_fillers")
    .insert(
      fillers.map((text, i) => ({
        slot_chunk_id: slotChunkId,
        filler_text: text,
        position: i,
      }))
    )
    .select();
  if (error) throw error;
  return data as V2SubstitutionFiller[];
}

export async function createAdjacencyPair(
  targetCardId: string,
  responseCardId: string
) {
  const { error } = await supabase.from("v2_adjacency_pairs").insert({
    target_card_id: targetCardId,
    response_card_id: responseCardId,
  });
  if (error) throw error;
}
