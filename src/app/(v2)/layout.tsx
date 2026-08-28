/**
 * Khung ngoài của khu v2 (người đi làm).
 *
 * `data-track="v2"` là thứ đổi toàn bộ bảng màu và họ chữ — xem scope cùng tên
 * trong globals.css. Không có nó thì mọi màn hình bên trong rơi về màu tươi
 * của v1.
 *
 * Thuộc tính phải đặt ở đây chứ không phải trên <html>: layout lồng nhau của
 * App Router không render được thẻ html, chỉ layout gốc mới làm được.
 */
export default function V2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div data-track="v2">{children}</div>;
}
