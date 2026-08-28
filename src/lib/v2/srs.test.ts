import { describe, expect, it } from "vitest";
import {
  DEFAULT_REQUEST_RETENTION,
  dueCards,
  gradeFromResult,
  isDue,
  Rating,
  reviewCard,
  startLearning,
  State,
  toFsrsCard,
  toProgressPatch,
  type V2ProgressRow,
} from "./srs";

const NOW = new Date("2026-08-28T09:00:00.000Z");

/** Hàng của thẻ chưa qua bước Học mới — chưa có lịch ôn nào */
function freshRow(cardId = "card1"): V2ProgressRow {
  return {
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
    fsrs_state: State.New,
    last_review: null,
  };
}

/** Hàng của thẻ đã ôn vài lần, tới hạn hôm nay */
function reviewingRow(overrides: Partial<V2ProgressRow> = {}): V2ProgressRow {
  return {
    ...freshRow(),
    streak: 3,
    fsrs_due: "2026-08-28T00:00:00.000Z",
    fsrs_stability: 12.5,
    fsrs_difficulty: 5.2,
    fsrs_elapsed_days: 10,
    fsrs_scheduled_days: 12,
    fsrs_learning_steps: 0,
    fsrs_reps: 4,
    fsrs_lapses: 1,
    fsrs_state: State.Review,
    last_review: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("toFsrsCard", () => {
  it("thẻ chưa có lịch dựng thành card mới, KHÔNG phải mốc 1970", () => {
    const card = toFsrsCard(freshRow(), NOW);
    expect(card.state).toBe(State.New);
    expect(card.reps).toBe(0);
    // Bug thật nếu sai: null → new Date(0) làm mọi thẻ mới quá hạn 50 năm
    expect(card.due.getFullYear()).toBe(2026);
  });

  it("giữ nguyên số liệu của thẻ đang ôn", () => {
    const card = toFsrsCard(reviewingRow(), NOW);
    expect(card.stability).toBe(12.5);
    expect(card.difficulty).toBe(5.2);
    expect(card.reps).toBe(4);
    expect(card.lapses).toBe(1);
    expect(card.state).toBe(State.Review);
  });

  it("giữ learning_steps — thiếu thì thẻ học dở bị nhảy về bước đầu", () => {
    const card = toFsrsCard(reviewingRow({ fsrs_learning_steps: 2 }), NOW);
    expect(card.learning_steps).toBe(2);
  });

  it("mốc thời gian hỏng không làm vỡ, coi như chưa ôn lần nào", () => {
    const card = toFsrsCard(
      reviewingRow({ last_review: "không phải ngày" }),
      NOW
    );
    expect(card.last_review).toBeUndefined();
  });

  it("fsrs_due hỏng thì lấy thời điểm hiện tại, không thành Invalid Date", () => {
    const card = toFsrsCard(reviewingRow({ fsrs_due: "hỏng" }), NOW);
    expect(Number.isNaN(card.due.getTime())).toBe(false);
  });
});

describe("toProgressPatch", () => {
  it("chuyển đủ mọi cột FSRS, ngày giờ ra chuỗi ISO", () => {
    const card = toFsrsCard(reviewingRow(), NOW);
    const patch = toProgressPatch(card, 3);
    expect(patch.fsrs_due).toBe("2026-08-28T00:00:00.000Z");
    expect(patch.fsrs_stability).toBe(12.5);
    expect(patch.fsrs_learning_steps).toBe(0);
    expect(patch.last_review).toBe("2026-08-16T00:00:00.000Z");
  });

  it("thẻ chưa ôn lần nào ghi last_review là null, không phải chuỗi rỗng", () => {
    const patch = toProgressPatch(toFsrsCard(freshRow(), NOW), 0);
    expect(patch.last_review).toBeNull();
  });

  it("đi vòng row → card → patch không mất dữ liệu", () => {
    const row = reviewingRow({ fsrs_learning_steps: 1 });
    const patch = toProgressPatch(toFsrsCard(row, NOW), row.streak);
    expect(patch).toEqual({
      streak: row.streak,
      fsrs_due: row.fsrs_due,
      fsrs_stability: row.fsrs_stability,
      fsrs_difficulty: row.fsrs_difficulty,
      fsrs_elapsed_days: row.fsrs_elapsed_days,
      fsrs_scheduled_days: row.fsrs_scheduled_days,
      fsrs_learning_steps: row.fsrs_learning_steps,
      fsrs_reps: row.fsrs_reps,
      fsrs_lapses: row.fsrs_lapses,
      fsrs_state: row.fsrs_state,
      last_review: row.last_review,
    });
  });
});

describe("gradeFromResult", () => {
  it("đúng thành Good, sai thành Again", () => {
    expect(gradeFromResult(true)).toBe(Rating.Good);
    expect(gradeFromResult(false)).toBe(Rating.Again);
  });
});

describe("reviewCard", () => {
  it("trả lời đúng đẩy hạn ôn ra sau thời điểm trả lời", () => {
    const patch = reviewCard(reviewingRow(), Rating.Good, NOW);
    expect(new Date(patch.fsrs_due!).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("trả lời đúng thì streak tăng", () => {
    const patch = reviewCard(reviewingRow({ streak: 3 }), Rating.Good, NOW);
    expect(patch.streak).toBe(4);
  });

  it("trả lời sai thì streak về 0", () => {
    const patch = reviewCard(reviewingRow({ streak: 7 }), Rating.Again, NOW);
    expect(patch.streak).toBe(0);
  });

  it("trả lời sai làm tăng số lần quên", () => {
    const row = reviewingRow({ fsrs_lapses: 1 });
    const patch = reviewCard(row, Rating.Again, NOW);
    expect(patch.fsrs_lapses).toBeGreaterThan(1);
  });

  it("mỗi lượt trả lời đều tính là một lần ôn", () => {
    const row = reviewingRow({ fsrs_reps: 4 });
    expect(reviewCard(row, Rating.Good, NOW).fsrs_reps).toBe(5);
  });

  it("Easy giãn cách xa hơn Good, Good xa hơn Hard", () => {
    const row = reviewingRow();
    const at = (g: Parameters<typeof reviewCard>[1]) =>
      new Date(reviewCard(row, g, NOW).fsrs_due!).getTime();
    expect(at(Rating.Easy)).toBeGreaterThan(at(Rating.Good));
    expect(at(Rating.Good)).toBeGreaterThan(at(Rating.Hard));
  });

  it("nhắm nhớ cao hơn thì ôn dày hơn — hạn gần hơn", () => {
    const row = reviewingRow();
    const strict = new Date(reviewCard(row, Rating.Good, NOW, 0.97).fsrs_due!);
    const relaxed = new Date(reviewCard(row, Rating.Good, NOW, 0.8).fsrs_due!);
    expect(strict.getTime()).toBeLessThan(relaxed.getTime());
  });

  it("dùng mức nhớ mặc định khi không truyền vào", () => {
    const row = reviewingRow();
    const implicit = reviewCard(row, Rating.Good, NOW);
    const explicit = reviewCard(row, Rating.Good, NOW, DEFAULT_REQUEST_RETENTION);
    expect(implicit.fsrs_due).toBe(explicit.fsrs_due);
  });

  it("ôn thẻ chưa có lịch vẫn chạy, không cần khởi tạo trước", () => {
    const patch = reviewCard(freshRow(), Rating.Good, NOW);
    expect(patch.fsrs_due).not.toBeNull();
    expect(patch.fsrs_reps).toBe(1);
  });

  it("ghi lại đúng thời điểm ôn của lượt này", () => {
    const patch = reviewCard(reviewingRow(), Rating.Good, NOW);
    expect(patch.last_review).toBe(NOW.toISOString());
  });
});

describe("startLearning", () => {
  it("đặt streak 1 — đã qua bước Học mới, vào hàng chờ ôn tập", () => {
    const row = startLearning("card1", NOW);
    expect(row.card_id).toBe("card1");
    expect(row.streak).toBe(1);
  });

  it("chưa tính là một lần ôn vì bấm 'Đã hiểu' không phải trả lời đúng", () => {
    expect(startLearning("card1", NOW).fsrs_reps).toBe(0);
  });

  it("có lịch ngay để thẻ xuất hiện trong hàng chờ", () => {
    expect(startLearning("card1", NOW).fsrs_due).not.toBeNull();
  });
});

describe("isDue", () => {
  it("quá hạn là tới hạn", () => {
    expect(isDue({ fsrs_due: "2026-08-27T00:00:00.000Z" }, NOW)).toBe(true);
  });

  it("đúng thời điểm hạn cũng tính là tới hạn", () => {
    expect(isDue({ fsrs_due: NOW.toISOString() }, NOW)).toBe(true);
  });

  it("chưa tới hạn thì không", () => {
    expect(isDue({ fsrs_due: "2026-09-05T00:00:00.000Z" }, NOW)).toBe(false);
  });

  it("thẻ chưa qua bước Học mới không thuộc hàng chờ ôn", () => {
    expect(isDue({ fsrs_due: null }, NOW)).toBe(false);
  });

  it("hạn hỏng không bị coi là tới hạn", () => {
    expect(isDue({ fsrs_due: "hỏng" }, NOW)).toBe(false);
  });
});

describe("dueCards", () => {
  it("chỉ lấy thẻ tới hạn, quá hạn lâu nhất lên trước", () => {
    const rows = [
      { card_id: "a", fsrs_due: "2026-08-27T00:00:00.000Z" },
      { card_id: "b", fsrs_due: "2026-09-10T00:00:00.000Z" }, // chưa tới hạn
      { card_id: "c", fsrs_due: "2026-08-01T00:00:00.000Z" }, // quá hạn lâu nhất
      { card_id: "d", fsrs_due: null }, // chưa học
    ];
    expect(dueCards(rows, NOW).map((r) => r.card_id)).toEqual(["c", "a"]);
  });

  it("không có thẻ nào tới hạn thì trả về rỗng", () => {
    const rows = [{ card_id: "a", fsrs_due: "2026-12-01T00:00:00.000Z" }];
    expect(dueCards(rows, NOW)).toEqual([]);
  });

  it("không sửa mảng đầu vào", () => {
    const rows = [
      { card_id: "a", fsrs_due: "2026-08-27T00:00:00.000Z" },
      { card_id: "c", fsrs_due: "2026-08-01T00:00:00.000Z" },
    ];
    const before = rows.map((r) => r.card_id);
    dueCards(rows, NOW);
    expect(rows.map((r) => r.card_id)).toEqual(before);
  });
});

describe("vòng đời một thẻ đầu-cuối", () => {
  it("Học mới → ôn đúng → giãn dần; ôn sai thì kéo hạn về gần", () => {
    let row: V2ProgressRow = startLearning("card1", NOW);
    expect(isDue(row, NOW)).toBe(true);

    // Ôn đúng ba lần, mỗi lần ôn ngay lúc tới hạn
    let previousGap = 0;
    for (let i = 0; i < 3; i++) {
      const at = new Date(row.fsrs_due!);
      const patch = reviewCard(row, Rating.Good, at);
      row = { card_id: row.card_id, ...patch };

      const gap = new Date(row.fsrs_due!).getTime() - at.getTime();
      expect(gap).toBeGreaterThan(previousGap);
      previousGap = gap;
    }
    expect(row.streak).toBe(4);

    // Quên một lần: hạn bị kéo về sát, streak reset
    const at = new Date(row.fsrs_due!);
    const lapsed = reviewCard(row, Rating.Again, at);
    expect(lapsed.streak).toBe(0);
    const lapsedGap = new Date(lapsed.fsrs_due!).getTime() - at.getTime();
    expect(lapsedGap).toBeLessThan(previousGap);
  });
});
