import { describe, expect, it } from "vitest";
import {
  buildChunkQuestion,
  chunksToSentence,
  formatChunks,
  isChunkOrderCorrect,
  parseChunks,
  slotChunks,
  CHUNK_DISTRACTOR_COUNT,
  type ChunkTile,
} from "./session";
import type { V2Chunk, V2ChunkKind } from "./types";

/** Trộn tất định để test kiểm được kết quả — giữ nguyên thứ tự đầu vào */
const noShuffle = <T,>(items: T[]): T[] => [...items];
/** Trộn tất định kiểu đảo ngược — để chắc code không phụ thuộc thứ tự */
const reverse = <T,>(items: T[]): T[] => [...items].reverse();

function chunk(
  id: string,
  cardId: string,
  text: string,
  position: number,
  kind: V2ChunkKind = "frame"
): V2Chunk {
  return {
    id,
    card_id: cardId,
    text,
    kind,
    position,
    created_at: "",
    updated_at: "",
  };
}

/** Câu đang hỏi: "Can we schedule | a call | next week?" */
const cardChunks = [
  chunk("c1", "card1", "Can we schedule", 0),
  chunk("c2", "card1", "a call", 1, "slot"),
  chunk("c3", "card1", "next week?", 2, "slot"),
];

/** Mẩu của các câu khác trong cùng topic — nguồn mẩu thừa */
const otherChunks = [
  chunk("o1", "card2", "Would you mind", 0),
  chunk("o2", "card2", "sending the deck", 1, "slot"),
  chunk("o3", "card3", "I'll follow up", 0),
  chunk("o4", "card3", "by Friday", 1, "slot"),
];

const pool = [...cardChunks, ...otherChunks];

describe("buildChunkQuestion", () => {
  it("đáp án xếp theo position tăng dần dù đầu vào lộn xộn", () => {
    const scrambled = [cardChunks[2], cardChunks[0], cardChunks[1]];
    const q = buildChunkQuestion(scrambled, pool, 0, noShuffle);
    expect(q.solution.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("khay chứa đủ mẩu của câu đúng cộng số mẩu thừa yêu cầu", () => {
    const q = buildChunkQuestion(cardChunks, pool, 2, noShuffle);
    expect(q.tiles).toHaveLength(5);
  });

  it("không lấy mẩu của chính câu đang hỏi làm mẩu thừa", () => {
    const q = buildChunkQuestion(cardChunks, pool, 2, noShuffle);
    const extra = q.tiles.filter(
      (t) => !cardChunks.some((c) => c.id === t.id)
    );
    expect(extra.every((t) => t.id.startsWith("o"))).toBe(true);
  });

  it("mẩu thừa trùng chữ với đáp án bị loại — tránh hai cách xếp cùng đúng", () => {
    const tricky = [
      ...cardChunks,
      chunk("dup", "card9", "a call", 0, "slot"), // trùng chữ mẩu c2
      chunk("ok", "card9", "về sau", 1),
    ];
    const q = buildChunkQuestion(cardChunks, tricky, 2, noShuffle);
    expect(q.tiles.filter((t) => t.text === "a call")).toHaveLength(1);
  });

  it("bỏ qua hoa thường và khoảng trắng khi lọc trùng", () => {
    const tricky = [
      ...cardChunks,
      chunk("dup", "card9", "  A CALL ", 0, "slot"),
    ];
    const q = buildChunkQuestion(cardChunks, tricky, 2, noShuffle);
    expect(q.tiles).toHaveLength(cardChunks.length);
  });

  it("mẩu thừa trùng chữ nhau chỉ lấy một", () => {
    const dupPool = [
      ...cardChunks,
      chunk("d1", "card2", "by Friday", 0),
      chunk("d2", "card3", "by Friday", 0),
    ];
    const q = buildChunkQuestion(cardChunks, dupPool, 2, noShuffle);
    expect(q.tiles.filter((t) => t.text === "by Friday")).toHaveLength(1);
  });

  it("topic ít mẩu thì lấy được bao nhiêu mẩu thừa hay bấy nhiêu, không vỡ", () => {
    const tiny = [...cardChunks, chunk("o1", "card2", "Would you mind", 0)];
    const q = buildChunkQuestion(cardChunks, tiny, 5, noShuffle);
    expect(q.tiles).toHaveLength(4);
  });

  it("nguồn chỉ có mỗi câu đang hỏi vẫn ra đề được, chỉ là không có mẩu thừa", () => {
    const q = buildChunkQuestion(cardChunks, cardChunks, 2, noShuffle);
    expect(q.tiles).toHaveLength(3);
  });

  it("distractorCount = 0 chỉ bày đúng mẩu của câu", () => {
    const q = buildChunkQuestion(cardChunks, pool, 0, noShuffle);
    expect(q.tiles.map((t) => t.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("distractorCount âm không làm vỡ", () => {
    const q = buildChunkQuestion(cardChunks, pool, -3, noShuffle);
    expect(q.tiles).toHaveLength(3);
  });

  it("câu một mẩu duy nhất vẫn ra đề được", () => {
    const single = [chunk("s1", "cardX", "Noted, thanks!", 0)];
    const q = buildChunkQuestion(single, [...single, ...otherChunks], 1, noShuffle);
    expect(q.solution).toHaveLength(1);
    expect(q.tiles).toHaveLength(2);
  });

  it("khay giữ nguyên kind của từng mẩu để tô màu frame/slot", () => {
    const q = buildChunkQuestion(cardChunks, pool, 0, noShuffle);
    expect(q.tiles.map((t) => t.kind)).toEqual(["frame", "slot", "slot"]);
  });

  it("đáp án không phụ thuộc chiều trộn", () => {
    const forward = buildChunkQuestion(cardChunks, pool, 2, noShuffle);
    const backward = buildChunkQuestion(cardChunks, pool, 2, reverse);
    expect(forward.solution.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(backward.solution.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(backward.tiles).toHaveLength(5);
  });

  it("mặc định ném thêm đúng số mẩu thừa quy định", () => {
    const q = buildChunkQuestion(cardChunks, pool, undefined, noShuffle);
    expect(q.tiles).toHaveLength(cardChunks.length + CHUNK_DISTRACTOR_COUNT);
  });
});

describe("isChunkOrderCorrect", () => {
  const solution = buildChunkQuestion(cardChunks, pool, 0, noShuffle).solution;
  const tile = (c: V2Chunk): ChunkTile => ({
    id: c.id,
    text: c.text,
    kind: c.kind,
  });

  it("xếp đúng thứ tự là đúng", () => {
    expect(isChunkOrderCorrect(solution.map(tile), solution)).toBe(true);
  });

  it("đảo thứ tự là sai", () => {
    const swapped = [solution[1], solution[0], solution[2]].map(tile);
    expect(isChunkOrderCorrect(swapped, solution)).toBe(false);
  });

  it("thiếu mẩu là sai", () => {
    expect(isChunkOrderCorrect(solution.slice(0, 2).map(tile), solution)).toBe(
      false
    );
  });

  it("thừa mẩu là sai", () => {
    const extra = [...solution.map(tile), tile(otherChunks[0])];
    expect(isChunkOrderCorrect(extra, solution)).toBe(false);
  });

  it("hai mẩu cùng chữ thì xếp mẩu nào vào chỗ nào cũng đúng", () => {
    // "I'd like to | talk to | you" — chữ "to" lặp lại
    const repeated = [
      chunk("r1", "cardR", "to", 0),
      chunk("r2", "cardR", "to", 1),
    ];
    const answer = [tile(repeated[1]), tile(repeated[0])];
    expect(isChunkOrderCorrect(answer, repeated)).toBe(true);
  });

  it("chấm bỏ qua hoa thường và khoảng trắng thừa", () => {
    const sloppy = solution.map((c) => ({
      id: c.id,
      text: `  ${c.text.toUpperCase()} `,
      kind: c.kind,
    }));
    expect(isChunkOrderCorrect(sloppy, solution)).toBe(true);
  });

  it("chưa xếp mẩu nào là sai", () => {
    expect(isChunkOrderCorrect([], solution)).toBe(false);
  });
});

describe("slotChunks", () => {
  it("chỉ trả mẩu thay được, theo đúng thứ tự trong câu", () => {
    expect(slotChunks(cardChunks).map((c) => c.id)).toEqual(["c2", "c3"]);
  });

  it("câu toàn khung cố định thì không có chỗ nào thay được", () => {
    const allFrame = [chunk("f1", "cardF", "Sounds good", 0)];
    expect(slotChunks(allFrame)).toEqual([]);
  });

  it("không sửa mảng đầu vào", () => {
    const input = [cardChunks[2], cardChunks[0], cardChunks[1]];
    const before = input.map((c) => c.id);
    slotChunks(input);
    expect(input.map((c) => c.id)).toEqual(before);
  });
});

describe("parseChunks", () => {
  it("chia câu theo ngoặc vuông, ngoài ngoặc là khung cố định", () => {
    expect(parseChunks("Can we schedule [a call] next week?")).toEqual([
      { text: "Can we schedule", kind: "frame" },
      { text: "a call", kind: "slot" },
      { text: "next week?", kind: "frame" },
    ]);
  });

  it("câu không có ngoặc là một mẩu khung duy nhất", () => {
    expect(parseChunks("Sounds good to me")).toEqual([
      { text: "Sounds good to me", kind: "frame" },
    ]);
  });

  it("nhiều chỗ thay được liền nhau", () => {
    expect(parseChunks("[Could you] send [the deck]?")).toEqual([
      { text: "Could you", kind: "slot" },
      { text: "send", kind: "frame" },
      { text: "the deck", kind: "slot" },
      { text: "?", kind: "frame" },
    ]);
  });

  it("cắt khoảng trắng thừa quanh mỗi mẩu", () => {
    expect(parseChunks("  Can we   [  a call  ]  ")).toEqual([
      { text: "Can we", kind: "frame" },
      { text: "a call", kind: "slot" },
    ]);
  });

  it("bỏ mẩu rỗng thay vì tạo mẩu trắng", () => {
    expect(parseChunks("[a call]")).toEqual([
      { text: "a call", kind: "slot" },
    ]);
    expect(parseChunks("[][]")).toEqual([]);
  });

  it("ngoặc mở chưa đóng không làm vỡ — admin đang gõ dở", () => {
    expect(parseChunks("Can we [a call")).toEqual([
      { text: "Can we", kind: "frame" },
      { text: "a call", kind: "slot" },
    ]);
  });

  it("ngoặc đóng thừa coi như chữ thường", () => {
    expect(parseChunks("Can we] talk")).toEqual([
      { text: "Can we] talk", kind: "frame" },
    ]);
  });

  it("chuỗi rỗng không sinh mẩu nào", () => {
    expect(parseChunks("")).toEqual([]);
    expect(parseChunks("   ")).toEqual([]);
  });
});

describe("formatChunks", () => {
  it("dựng lại đúng dòng đã gõ", () => {
    const line = "Can we schedule [a call] next week?";
    expect(formatChunks(parseChunks(line))).toBe(line);
  });

  it("đi vòng parse → format → parse cho kết quả như cũ", () => {
    const line = "[Could you] send [the deck] today?";
    const once = parseChunks(line);
    expect(parseChunks(formatChunks(once))).toEqual(once);
  });
});

describe("chunksToSentence", () => {
  it("ghép lại thành câu hoàn chỉnh, không còn dấu ngoặc", () => {
    const parsed = parseChunks("Can we schedule [a call] next week?");
    expect(chunksToSentence(parsed)).toBe("Can we schedule a call next week?");
  });

  it("không mẩu nào thì ra chuỗi rỗng", () => {
    expect(chunksToSentence([])).toBe("");
  });

  it("dấu câu đứng riêng vẫn dán sát chữ trước, không hở khoảng trắng", () => {
    // "Can we schedule [a call]?" chia thành 3 mẩu, "?" đứng một mình
    const parsed = parseChunks("Can we schedule [a call]?");
    expect(parsed).toHaveLength(3);
    expect(chunksToSentence(parsed)).toBe("Can we schedule a call?");
  });

  it("dán đúng cho mọi dấu câu thường gặp", () => {
    expect(chunksToSentence(parseChunks("Sure[,] thanks[.]"))).toBe(
      "Sure, thanks."
    );
    expect(chunksToSentence(parseChunks("Great[!]"))).toBe("Great!");
  });
});

describe("bài ghép câu đầu-cuối", () => {
  it("mọi câu trong topic đều ra được đề có đủ mẩu và chấm đúng được", () => {
    const cards = ["card1", "card2", "card3"];
    for (const cardId of cards) {
      const own = pool.filter((c) => c.card_id === cardId);
      const q = buildChunkQuestion(own, pool, 2, noShuffle);

      // Khay luôn chứa đủ mẩu để dựng lại câu đúng
      for (const s of q.solution) {
        expect(q.tiles.some((t) => t.id === s.id)).toBe(true);
      }
      // Không mẩu nào trên khay bị lặp chữ
      const texts = q.tiles.map((t) => t.text.trim().toLowerCase());
      expect(new Set(texts).size).toBe(texts.length);
      // Xếp theo đáp án thì chấm đúng
      const answer = q.solution.map((c) => ({
        id: c.id,
        text: c.text,
        kind: c.kind,
      }));
      expect(isChunkOrderCorrect(answer, q.solution)).toBe(true);
    }
  });
});
