import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";
import { antdTheme } from "@/theme/antdTheme";

// Một họ chữ duy nhất cho cả ứng dụng, phân cấp bằng độ đậm.
// Trước đây dùng Baloo 2 (tiêu đề) + Nunito (thân chữ) cho định hướng trẻ em;
// bỏ cả hai khi hệ thống chuyển sang chia theo đơn vị học thay vì theo đối
// tượng — tải hai họ chữ không ai dùng chỉ tốn băng thông.
const inter = Inter({
  subsets: ["latin", "vietnamese"],
  // Có 800 vì base layer đặt h1–h4 ở 800 và nút dùng `font-extrabold`; thiếu
  // nét này thì trình duyệt tự bôi đậm giả và chữ bị nhoè.
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Funny Learn English",
  description: "Học tiếng Anh vui nhộn",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Funny English",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Không chặn phóng to — người dùng cần zoom là quyền của họ
  // Khớp --color-grape trong globals.css — thanh trạng thái trình duyệt lấy màu này
  themeColor: "#574fb5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={inter.variable}>
      <body>
        <AntdRegistry>
          <ConfigProvider theme={antdTheme}>{children}</ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
