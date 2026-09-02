import { supabase } from "../supabase";
import {
  DEFAULT_REQUEST_RETENTION,
  reviewCard,
  startLearning,
  type V2ProgressRow,
} from "./srs";
import type { Grade } from "ts-fsrs";
import type { V2Card, V2Chunk, V2Register } from "./types";

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

/**
 * Chủ đề = MỘT chức năng giao tiếp (Đề nghị, Đồng ý, Làm rõ...).
 *
 * Không còn `category_id`: lĩnh vực đã chuyển xuống từng câu và thành đa trị.
 * Giữ cả hai sẽ có hai đường phân loại chồng nhau và lúc lọc thì mâu thuẫn.
 */
export interface V2Topic {
  id: string;
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

export async function getV2Topics() {
  const { data, error } = await supabase
    .from("v2_topics")
    .select("*")
    .order("position")
    .order("name");
  if (error) throw error;
  return data as V2Topic[];
}

/** Câu của một chủ đề, lọc thêm theo mức trang trọng nếu cần */
export async function getV2Cards(topicId: string, register?: V2Register) {
  let query = supabase.from("v2_cards").select("*").eq("topic_id", topicId);
  if (register) query = query.eq("register", register);
  const { data, error } = await query.order("position");
  if (error) throw error;
  return data as V2Card[];
}

/**
 * Lĩnh vực của từng câu, gom theo card_id.
 *
 * Tách khỏi `getV2Cards` chứ không nhúng sẵn: phần lớn màn hình (luồng học,
 * bài ôn) không cần biết lĩnh vực, chỉ khu admin và bộ lọc cần. Nhúng vào mọi
 * truy vấn là bắt cả app trả thêm một join không dùng tới.
 */
export async function getCardCategories(
  cardIds: string[]
): Promise<Record<string, string[]>> {
  if (cardIds.length === 0) return {};
  const { data, error } = await supabase
    .from("v2_card_categories")
    .select("card_id, category_id")
    .in("card_id", cardIds);
  if (error) throw error;

  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    (map[row.card_id] ??= []).push(row.category_id);
  }
  return map;
}

/**
 * Đặt lại danh sách lĩnh vực của một câu.
 *
 * Xoá hết rồi chèn lại thay vì tính phần chênh: danh sách chỉ vài dòng, mà so
 * khớp thêm/bớt là chỗ dễ sinh lỗi lệch trạng thái hơn nhiều so với lợi ích.
 */
export async function setCardCategories(cardId: string, categoryIds: string[]) {
  const { error: delError } = await supabase
    .from("v2_card_categories")
    .delete()
    .eq("card_id", cardId);
  if (delError) throw delError;

  if (categoryIds.length === 0) return;

  const { error } = await supabase
    .from("v2_card_categories")
    .insert(categoryIds.map((id) => ({ card_id: cardId, category_id: id })));
  if (error) throw error;
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

/**
 * Một cụm thay thế đã duyệt cho mẩu `slot`.
 *
 * `filler_vi` là điều kiện để ra được đề: bài drill nêu tình huống bằng tiếng
 * Việt rồi hỏi dùng cụm tiếng Anh nào. Thiếu nó thì mọi cụm đều đúng như nhau
 * và bài tập vô nghĩa.
 */
export interface V2SubstitutionFiller {
  id: string;
  slot_chunk_id: string;
  filler_text: string;
  filler_vi: string;
  position: number;
  created_at: string;
}

/** Cụm thay thế admin đang soạn, chưa có id */
export interface DraftFiller {
  filler_text: string;
  filler_vi: string;
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

/**
 * Thẻ theo danh sách id.
 *
 * Khác `getV2Cards` (lấy cả một chủ đề): bài Rèn luyện chỉ cần đúng những thẻ
 * đã có cụm thay thế, rải rác khắp các chủ đề.
 */
export async function getV2CardsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("v2_cards")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  return data as V2Card[];
}

/** Một mẩu `slot` đã có cụm thay thế — đơn vị ra đề của bài Rèn luyện */
export interface DrillSlot {
  slot_chunk_id: string;
  card_id: string;
  fillers: V2SubstitutionFiller[];
}

/**
 * Các mẩu `slot` đã có đủ cụm thay thế để ra đề.
 *
 * Đi từ bảng filler ngược lên chứ không duyệt từ thẻ xuống: phần lớn câu chưa
 * có cụm nào, quét từ thẻ là tải cả thư viện về rồi vứt gần hết.
 *
 * Lọc bỏ slot có dưới hai cụm ngay tại đây: một cụm thì không có gì để chọn,
 * mà để lọt ra màn hình mới loại thì đề bài đã dựng dở dang rồi.
 */
export async function getDrillSlots(): Promise<DrillSlot[]> {
  const { data, error } = await supabase
    .from("v2_substitution_fillers")
    .select("*, v2_chunks!inner(id, card_id)")
    .order("position");
  if (error) throw error;

  const rows = (data ?? []) as unknown as (V2SubstitutionFiller & {
    v2_chunks: { id: string; card_id: string };
  })[];

  const bySlot = new Map<string, DrillSlot>();
  for (const row of rows) {
    // Cụm chưa dịch thì không nêu được tình huống, bỏ qua
    if (!row.filler_vi.trim()) continue;
    const slot = bySlot.get(row.slot_chunk_id) ?? {
      slot_chunk_id: row.slot_chunk_id,
      card_id: row.v2_chunks.card_id,
      fillers: [],
    };
    slot.fillers.push(row);
    bySlot.set(row.slot_chunk_id, slot);
  }

  return [...bySlot.values()].filter((s) => s.fillers.length >= 2);
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
 * Mở một buổi ôn v2 trong bảng `study_sessions` dùng chung với v1.
 *
 * Ghi chung một bảng chứ không lập bảng riêng, vì màn hình lịch sử phải là
 * MỘT dòng thời gian: người học không quan tâm hôm qua mình học bằng cơ chế
 * nào, chỉ quan tâm đã học gì.
 *
 * `topic_id` để null: phiên ôn trộn xen kẽ nhiều chủ đề nên không thuộc chủ đề
 * nào, mà cột đó lại là khoá ngoại trỏ sang bảng `topics` của v1 — nhét id v2
 * vào là hỏng ràng buộc. `topic_name` giữ nhãn để lịch sử vẫn đọc được.
 *
 * Gọi ở câu trả lời ĐẦU TIÊN chứ không phải lúc mở trang, để người chỉ mở ra
 * xem rồi thoát không sinh dòng rác.
 */
export async function startV2ReviewSession(userId: string, isCorrect: boolean) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("study_sessions")
    .insert({
      user_id: userId,
      topic_id: null,
      topic_name: "Ôn tập theo câu",
      total_questions: 1,
      correct_count: isCorrect ? 1 : 0,
      wrong_count: isCorrect ? 0 : 1,
      started_at: now,
      ended_at: now,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Một dòng tiến độ v2 kèm câu và chủ đề, cho màn hình Tiến độ */
export interface V2ProgressDetail {
  card_id: string;
  streak: number;
  fsrs_due: string | null;
  fsrs_state: number;
  fsrs_reps: number;
  fsrs_lapses: number;
  v2_cards: {
    english_text: string;
    vietnamese_text: string;
    topic_id: string;
    v2_topics: { name: string } | null;
  };
}

/** Toàn bộ tiến độ v2 của một người, kèm câu và tên chủ đề */
export async function getV2ProgressDetail(userId: string) {
  const { data, error } = await supabase
    .from("v2_progress")
    .select(
      "card_id, streak, fsrs_due, fsrs_state, fsrs_reps, fsrs_lapses, " +
        "v2_cards!inner(english_text, vietnamese_text, topic_id, v2_topics(name))"
    )
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as unknown as V2ProgressDetail[];
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
 * Xoá lĩnh vực. Câu KHÔNG mất theo — chỉ các dòng trong bảng nối bị xoá
 * (ON DELETE CASCADE trên `v2_card_categories`), nghĩa là những câu đó mất
 * nhãn lĩnh vực này nhưng vẫn còn nguyên và vẫn học được. Đây là khác biệt
 * quan trọng so với xoá chủ đề — xoá chủ đề thì mất cả câu.
 */
export async function deleteV2Category(id: string) {
  const { error } = await supabase.from("v2_categories").delete().eq("id", id);
  if (error) throw error;
}

/** Số câu đang gắn một lĩnh vực — để cảnh báo trước khi xoá */
export async function countCardsInCategory(categoryId: string) {
  const { count, error } = await supabase
    .from("v2_card_categories")
    .select("card_id", { count: "exact", head: true })
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

/** Một thẻ kèm mẩu của nó, dùng cho nhập hàng loạt */
export interface V2CardWithChunks {
  vietnamese_text: string;
  english_text: string;
  register: V2Register;
  chunks: Pick<V2Chunk, "text" | "kind">[];
  /** Cụm thay thế theo VỊ TRÍ chỗ trống — `[0]` là chỗ trống đầu tiên */
  fillers?: DraftFiller[][];
}

/**
 * Thêm nhiều thẻ kèm mẩu, chỉ hai request bất kể bao nhiêu dòng.
 *
 * Id sinh ở CLIENT bằng `crypto.randomUUID()` chứ không để Postgres sinh. Lý
 * do: mẩu cần biết `card_id` trước khi ghi, mà nếu để DB sinh thì phải chèn
 * thẻ xong đọc id trả về rồi mới ghép — và thứ tự mảng trả về của một lệnh
 * INSERT nhiều dòng KHÔNG được đảm bảo. Ghép sai thì mẩu của câu này dính vào
 * câu khác, một lỗi rất khó lần ra sau này. Tự sinh id thì không còn chỗ để
 * ghép sai.
 *
 * Chưa dùng transaction: PostgREST không mở transaction qua nhiều request.
 * Ghi thẻ xong mà ghi mẩu hỏng thì còn lại thẻ chưa chia mẩu — danh sách admin
 * gắn nhãn đỏ "Chưa chia mẩu" nên nhìn ra ngay, sửa tay được. Đổi sang một RPC
 * bọc cả hai lệnh nếu về sau thấy tình huống này xảy ra thật.
 */
export async function createV2CardsWithChunks(
  topicId: string,
  rows: V2CardWithChunks[],
  startPosition = 0,
  /** Lĩnh vực gán cho CẢ loạt — một lần nhập thường cùng một lĩnh vực */
  categoryIds: string[] = []
) {
  if (rows.length === 0) return 0;

  const cards = rows.map((r, i) => ({
    id: crypto.randomUUID(),
    topic_id: topicId,
    vietnamese_text: r.vietnamese_text,
    english_text: r.english_text,
    register: r.register,
    position: startPosition + i,
  }));

  const { error: cardError } = await supabase.from("v2_cards").insert(cards);
  if (cardError) throw cardError;

  if (categoryIds.length > 0) {
    const links = cards.flatMap((c) =>
      categoryIds.map((id) => ({ card_id: c.id, category_id: id }))
    );
    const { error: linkError } = await supabase
      .from("v2_card_categories")
      .insert(links);
    if (linkError) throw linkError;
  }

  // Id mẩu cũng sinh ở client, cùng lý do như id thẻ: cụm thay thế cần biết
  // `slot_chunk_id` TRƯỚC khi ghi, mà thứ tự mảng trả về của INSERT nhiều dòng
  // không được đảm bảo nên không ghép ngược lại được.
  const chunks = rows.flatMap((r, i) =>
    r.chunks.map((c, j) => ({
      id: crypto.randomUUID(),
      card_id: cards[i].id,
      text: c.text,
      kind: c.kind,
      position: j,
    }))
  );
  if (chunks.length > 0) {
    const { error: chunkError } = await supabase.from("v2_chunks").insert(chunks);
    if (chunkError) throw chunkError;
  }

  // Cụm thay thế khoá theo vị trí chỗ trống, nên phải lọc ra riêng mẩu `slot`
  // của từng thẻ rồi đếm theo thứ tự xuất hiện
  const fillerRows = rows.flatMap((r, i) => {
    if (!r.fillers?.length) return [];
    const slots = chunks.filter(
      (c) => c.card_id === cards[i].id && c.kind === "slot"
    );
    return r.fillers.flatMap((group, slotIndex) => {
      const slot = slots[slotIndex];
      if (!slot) return [];
      return group.map((f, pos) => ({
        slot_chunk_id: slot.id,
        filler_text: f.filler_text,
        filler_vi: f.filler_vi,
        position: pos,
      }));
    });
  });
  if (fillerRows.length > 0) {
    const { error: fillerError } = await supabase
      .from("v2_substitution_fillers")
      .insert(fillerRows);
    if (fillerError) throw fillerError;
  }

  return cards.length;
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
export async function replaceFillers(
  slotChunkId: string,
  fillers: DraftFiller[]
) {
  const { error: delError } = await supabase
    .from("v2_substitution_fillers")
    .delete()
    .eq("slot_chunk_id", slotChunkId);
  if (delError) throw delError;

  if (fillers.length === 0) return [];

  const { data, error } = await supabase
    .from("v2_substitution_fillers")
    .insert(
      fillers.map((f, i) => ({
        slot_chunk_id: slotChunkId,
        filler_text: f.filler_text,
        filler_vi: f.filler_vi,
        position: i,
      }))
    )
    .select();
  if (error) throw error;
  return data as V2SubstitutionFiller[];
}

/**
 * Ghi lại cụm thay thế cho MỌI mẩu slot của một thẻ, khoá theo VỊ TRÍ slot.
 *
 * Phải khoá theo vị trí chứ không theo id: `replaceChunks` xoá sạch chunk rồi
 * chèn lại mỗi lần lưu thẻ, mà `v2_substitution_fillers.slot_chunk_id` là khoá
 * ngoại ON DELETE CASCADE — nên id chunk cũ không còn, và nếu không ghi lại
 * theo vị trí thì sửa một chữ trong câu là mất sạch cụm đã nhập, không cảnh
 * báo gì.
 *
 * `bySlotIndex[0]` là cụm cho mẩu slot ĐẦU TIÊN của câu, tính theo thứ tự
 * xuất hiện — không phải theo vị trí trong toàn bộ chunk.
 */
export async function replaceAllFillers(
  chunks: V2Chunk[],
  bySlotIndex: DraftFiller[][]
) {
  const slots = [...chunks]
    .sort((a, b) => a.position - b.position)
    .filter((c) => c.kind === "slot");

  for (let i = 0; i < slots.length; i++) {
    await replaceFillers(slots[i].id, bySlotIndex[i] ?? []);
  }
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
