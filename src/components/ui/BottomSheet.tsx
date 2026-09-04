"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Tấm trượt lên từ đáy màn hình.
 *
 * Dùng cho nội dung PHỤ mà người học tự chọn xem: gợi ý, ví dụ, chú thích.
 * Đừng dùng cho thứ bắt buộc phải đọc — cái đó để thẳng trên trang.
 *
 * Không dùng Drawer của antd: antd chỉ còn ở khu quản trị, màn hình học viên
 * dùng component trong `ui/`.
 *
 * Trượt từ đáy chứ không hiện giữa màn hình: trên điện thoại, đáy là chỗ ngón
 * cái với tới được, mà đây là thứ người học mở ra rồi đóng lại liên tục.
 */
export default function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Khoá cuộn nền khi tấm đang mở, và đóng bằng phím Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="anim-slide-up relative max-h-[80dvh] overflow-y-auto rounded-t-jumbo
          border-t-2 border-cloud-deep bg-white pb-[max(1.25rem,var(--safe-bottom))]"
      >
        {/* Thanh nắm — dấu hiệu quen thuộc rằng tấm này kéo/đóng được */}
        <div className="sticky top-0 bg-white pt-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-cloud-deep" />
          <div className="mt-2 flex items-center justify-between gap-3 px-5 pb-3">
            <h2 className="text-lg text-ink">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Đóng"
              className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-cloud"
            >
              <X size={22} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="px-5">{children}</div>
      </div>
    </div>
  );
}
