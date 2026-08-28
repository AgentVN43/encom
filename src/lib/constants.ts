/** Trả lời đúng liên tiếp bao nhiêu lần thì coi là đã thuộc */
export const MASTERY_STREAK = 3;

/** Số thẻ mỗi phiên khi người dùng chưa có cài đặt riêng */
export const DEFAULT_CARDS_PER_SESSION = 10;

/**
 * Giá trị đặc biệt của cards_per_session nghĩa là "học hết cả chủ đề, không
 * giới hạn số lượng". Dùng 0 làm sentinel vì cột DB không có CHECK constraint
 * và 0 vốn không phải số thẻ hợp lệ cho một phiên học.
 */
export const UNLIMITED_CARDS_PER_SESSION = 0;

/** Số thẻ thực sự lấy cho một phiên học, đã xử lý trường hợp "học hết" */
export function resolveSessionLimit(
  cardsPerSession: number,
  totalCards: number
): number {
  return cardsPerSession === UNLIMITED_CARDS_PER_SESSION
    ? totalCards
    : cardsPerSession;
}

/** Số đáp án hiển thị mỗi câu hỏi */
export const OPTION_COUNT = 4;

/** Số lần đọc đáp án đúng sau khi trẻ chọn — nghe lặp lại thì nhớ mặt chữ lâu hơn */
export const ANSWER_SPEAK_TIMES = 3;

/** Một thẻ được coi là đã thuộc khi chuỗi đúng đạt ngưỡng */
export function isMastered(streak: number | undefined | null): boolean {
  return (streak ?? 0) >= MASTERY_STREAK;
}
