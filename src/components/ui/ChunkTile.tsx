"use client";

export type ChunkTileState = "tray" | "placed" | "correct" | "wrong";

/**
 * Một mẩu câu bấm được trong bài ghép câu.
 *
 * Không dùng lại `OptionButton` vì hai thứ khác vai: OptionButton là một lựa
 * chọn loại trừ nhau (chọn A thì bỏ B), còn mẩu câu là một quân bài được xếp
 * vào chuỗi — không có huy hiệu A/B/C/D, và bấm lần nữa là gỡ ra chứ không
 * phải chọn lại.
 *
 * Mẩu `slot` (phần thay được) viền đậm hơn mẩu `frame` để người học dần nhận
 * ra chỗ nào của câu là khung cố định, chỗ nào đổi được — chính là thứ bài
 * Vận dụng sẽ hoán đổi ở bước sau.
 */
const SHELL: Record<ChunkTileState, string> = {
  tray: "bg-white border-cloud-deep text-ink [--push-shade:var(--color-cloud-deep)]",
  placed: "bg-grape-soft border-grape text-grape-dark [--push-shade:var(--color-grape)]",
  correct: "bg-leaf-soft border-leaf text-leaf-dark [--push-shade:var(--color-leaf)]",
  wrong: "bg-cherry-soft border-cherry text-cherry-dark [--push-shade:var(--color-cherry)]",
};

export default function ChunkTile({
  text,
  state = "tray",
  isSlot = false,
  disabled = false,
  onClick,
}: {
  text: string;
  state?: ChunkTileState;
  /** Mẩu thay được — vẽ viền nét đứt để phân biệt với khung cố định */
  isSlot?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`btn-push min-h-12 rounded-pill border-2 px-4 py-2 font-display
        text-base font-bold leading-snug disabled:cursor-default
        ${isSlot ? "border-dashed" : ""} ${SHELL[state]}`}
    >
      {text}
    </button>
  );
}
