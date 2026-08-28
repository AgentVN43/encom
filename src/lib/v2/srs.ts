import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade,
} from "ts-fsrs";

/**
 * Lớp bọc quanh ts-fsrs.
 *
 * Chạy ở client (xem quyết định trong supabase/design_v2_pedagogy_schema.sql):
 * ts-fsrs là JS thuần nên chạy được cả hai phía, ở đây theo pattern v1 —
 * component tự tính rồi ghi thẳng Supabase qua RLS.
 *
 * Ranh giới của file này: chỉ chuyển đổi giữa hàng `v2_progress` và kiểu Card
 * của thư viện, không đụng tới Supabase. Nhờ vậy test được mà không cần DB.
 */

export { Rating, State };

/** Mức mặc định của FSRS: nhắm nhớ được 90% số thẻ tới hạn */
export const DEFAULT_REQUEST_RETENTION = 0.9;

/**
 * Các cột FSRS trên hàng `v2_progress`.
 *
 * Tên cột giữ nguyên tiền tố `fsrs_` như trong SQL để đọc code là biết đang
 * map sang cột nào, không phải tra chéo file khác.
 */
export interface V2ProgressRow {
  card_id: string;
  /** 0 = thẻ chưa qua bước "Đã hiểu", chưa vào lịch ôn */
  streak: number;
  fsrs_due: string | null;
  fsrs_stability: number | null;
  fsrs_difficulty: number | null;
  fsrs_elapsed_days: number;
  fsrs_scheduled_days: number;
  fsrs_learning_steps: number;
  fsrs_reps: number;
  fsrs_lapses: number;
  fsrs_state: number;
  last_review: string | null;
}

/** Phần hàng `v2_progress` cần ghi lại sau một lượt trả lời */
export type V2ProgressPatch = Omit<V2ProgressRow, "card_id">;

/**
 * Hàng chưa từng ôn — `fsrs_due` rỗng nghĩa là thẻ mới tinh.
 *
 * Cột nullable vì thẻ vừa tạo chưa có lịch; đọc lên phải dựng lại Card rỗng
 * chứ không được coi `null` là mốc thời gian 0 (1970) — làm vậy thì mọi thẻ
 * mới đều quá hạn 50 năm và bị nhồi hết vào phiên đầu tiên.
 */
function isUnscheduled(row: Pick<V2ProgressRow, "fsrs_due">): boolean {
  return row.fsrs_due === null;
}

/** Đọc mốc thời gian từ DB; giá trị hỏng coi như chưa có */
function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : new Date(t);
}

/** Hàng `v2_progress` → Card của ts-fsrs */
export function toFsrsCard(row: V2ProgressRow, now: Date = new Date()): FsrsCard {
  if (isUnscheduled(row)) return createEmptyCard(now);

  return {
    due: parseDate(row.fsrs_due) ?? now,
    stability: row.fsrs_stability ?? 0,
    difficulty: row.fsrs_difficulty ?? 0,
    elapsed_days: row.fsrs_elapsed_days,
    scheduled_days: row.fsrs_scheduled_days,
    learning_steps: row.fsrs_learning_steps,
    reps: row.fsrs_reps,
    lapses: row.fsrs_lapses,
    state: row.fsrs_state as State,
    last_review: parseDate(row.last_review),
  };
}

/** Card của ts-fsrs → phần hàng `v2_progress` cần ghi */
export function toProgressPatch(card: FsrsCard, streak: number): V2ProgressPatch {
  return {
    streak,
    fsrs_due: card.due.toISOString(),
    fsrs_stability: card.stability,
    fsrs_difficulty: card.difficulty,
    fsrs_elapsed_days: card.elapsed_days,
    fsrs_scheduled_days: card.scheduled_days,
    fsrs_learning_steps: card.learning_steps,
    fsrs_reps: card.reps,
    fsrs_lapses: card.lapses,
    fsrs_state: card.state,
    last_review: card.last_review?.toISOString() ?? null,
  };
}

/**
 * Bài ghép chunk chỉ chấm được đúng/sai, không có 4 nút tự đánh giá như Anki.
 *
 * Quy ước: sai → `Again` (học lại từ đầu), đúng → `Good` (mức chuẩn). Không tự
 * suy ra `Hard`/`Easy` từ thời gian trả lời — thời gian ở đây lẫn cả thao tác
 * kéo-thả nên không đo được độ khó thật. Muốn dùng đủ 4 mức thì truyền thẳng
 * `Rating` vào `reviewCard`, hàm này chỉ là lối tắt cho bài chấm nhị phân.
 */
export function gradeFromResult(isCorrect: boolean): Grade {
  return isCorrect ? Rating.Good : Rating.Again;
}

/**
 * Tính lịch ôn mới sau một lượt trả lời.
 *
 * `requestRetention` là mục tiêu % nhớ của người học (cột
 * `v2_user_settings.request_retention`): cao hơn = ôn dày hơn cho chắc, thấp
 * hơn = ôn thưa hơn cho đỡ tốn thời gian.
 *
 * `streak` vẫn đếm song song với FSRS vì nó mang nghĩa khác: `streak = 0` là
 * thẻ chưa qua bước "Đã hiểu" ở giai đoạn Học mới, chưa được đưa vào hàng chờ
 * ôn tập. FSRS không có khái niệm này.
 */
export function reviewCard(
  row: V2ProgressRow,
  grade: Grade,
  now: Date = new Date(),
  requestRetention: number = DEFAULT_REQUEST_RETENTION
): V2ProgressPatch {
  const scheduler = fsrs({ request_retention: requestRetention });
  const card = toFsrsCard(row, now);
  const { card: next } = scheduler.next(card, now, grade);

  const streak = grade === Rating.Again ? 0 : row.streak + 1;
  return toProgressPatch(next, streak);
}

/**
 * Hàng `v2_progress` cho thẻ vừa học xong ở giai đoạn Học mới.
 *
 * Bấm "Đã hiểu" không phải là trả lời đúng nên không chấm điểm — chỉ đặt lịch
 * ban đầu để thẻ bắt đầu xuất hiện trong hàng chờ ôn tập.
 */
export function startLearning(
  cardId: string,
  now: Date = new Date()
): V2ProgressRow {
  return {
    card_id: cardId,
    ...toProgressPatch(createEmptyCard(now), 1),
  };
}

/** Thẻ đã tới hạn ôn chưa */
export function isDue(
  row: Pick<V2ProgressRow, "fsrs_due">,
  now: Date = new Date()
): boolean {
  const due = parseDate(row.fsrs_due);
  if (!due) return false; // chưa qua bước Học mới thì không thuộc hàng chờ ôn
  return due.getTime() <= now.getTime();
}

/**
 * Thẻ cần ôn hôm nay, thẻ quá hạn lâu nhất lên trước.
 *
 * Interleaving (trộn xen kẽ nhiều chủ đề trong một phiên) là việc của tầng gọi
 * — hàm này chỉ lọc theo hạn, không biết thẻ thuộc topic nào.
 */
export function dueCards<T extends Pick<V2ProgressRow, "fsrs_due">>(
  rows: T[],
  now: Date = new Date()
): T[] {
  return rows
    .filter((r) => isDue(r, now))
    .sort(
      (a, b) =>
        (parseDate(a.fsrs_due)?.getTime() ?? 0) -
        (parseDate(b.fsrs_due)?.getTime() ?? 0)
    );
}
