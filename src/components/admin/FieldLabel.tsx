"use client";

import type { ReactNode } from "react";
import { Tooltip, Typography } from "antd";
import { Info } from "lucide-react";

const { Text } = Typography;

/**
 * Nhãn của một ô nhập, hướng dẫn giấu trong icon (i).
 *
 * Form soạn nội dung có nhiều ô, mỗi ô kèm hai ba dòng giải thích thì drawer
 * dài gấp đôi và người soạn quen việc phải cuộn qua đống chữ họ đã đọc thuộc.
 * Giấu vào tooltip giữ được hướng dẫn cho người mới mà không tốn diện tích.
 *
 * Chỉ dùng cho hướng dẫn TĨNH. Phản hồi theo dữ liệu đang gõ (cảnh báo, xem
 * trước) phải hiện thẳng ra — giấu đi thì không ai thấy lúc cần.
 *
 * Tooltip của antd mở được bằng cả chạm lẫn hover nên dùng được trên điện
 * thoại; icon bọc trong <button> để bàn phím tab tới được.
 */
export default function FieldLabel({
  label,
  hint,
}: {
  label: string;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-1 flex items-center gap-1.5">
      <Text className="font-medium">{label}</Text>
      {hint && (
        <Tooltip title={hint} trigger={["hover", "click"]}>
          <button
            type="button"
            aria-label={`Hướng dẫn cho ${label}`}
            className="inline-flex size-5 items-center justify-center text-slate-400 hover:text-slate-600"
          >
            <Info size={15} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
