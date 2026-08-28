import type { Metadata, Viewport } from "next";
import { Baloo_2, Inter, Nunito } from "next/font/google";
import "./globals.css";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";
import { antdTheme } from "@/theme/antdTheme";

// Baloo 2: tiêu đề bo tròn bụ bẫm, hợp trẻ em.
// Nunito: thân chữ mềm, dễ đọc ở cỡ nhỏ.
// Cả hai đều có bộ dấu tiếng Việt đầy đủ.
const baloo = Baloo_2({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700", "800"],
  variable: "--font-baloo",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

// Inter: chữ grotesque trung tính cho khu v2 (người đi làm). Baloo bo tròn
// bụ bẫm đọc ra chất trẻ em rõ hơn cả màu, nên v2 đổi cả tiêu đề lẫn thân chữ
// sang một họ duy nhất — phân cấp bằng độ đậm thay vì bằng hai kiểu chữ.
const inter = Inter({
  subsets: ["latin", "vietnamese"],
  // Có 800 vì base layer đặt h1–h4 ở 800 và nút dùng `font-extrabold`; thiếu
  // nét này thì trình duyệt tự bôi đậm giả, chữ nhoè và lệch so với v1.
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
  themeColor: "#7c4dff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      className={`${baloo.variable} ${nunito.variable} ${inter.variable}`}
    >
      <body>
        <AntdRegistry>
          <ConfigProvider theme={antdTheme}>{children}</ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
