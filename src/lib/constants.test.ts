import { describe, expect, it } from "vitest";
import {
  UNLIMITED_CARDS_PER_SESSION,
  resolveSessionLimit,
} from "./constants";

describe("resolveSessionLimit", () => {
  it("sentinel 'học hết' trả về toàn bộ số thẻ của chủ đề", () => {
    expect(resolveSessionLimit(UNLIMITED_CARDS_PER_SESSION, 4000)).toBe(4000);
  });

  it("giá trị bình thường giữ nguyên, không đụng vào tổng số thẻ", () => {
    expect(resolveSessionLimit(10, 4000)).toBe(10);
    expect(resolveSessionLimit(40, 4000)).toBe(40);
  });

  it("chủ đề rỗng cùng sentinel 'học hết' trả về 0, không lỗi", () => {
    expect(resolveSessionLimit(UNLIMITED_CARDS_PER_SESSION, 0)).toBe(0);
  });
});
