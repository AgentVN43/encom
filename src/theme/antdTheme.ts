import type { ThemeConfig } from "antd";

/**
 * Token Ant Design khớp với design system trong globals.css.
 *
 * Antd giờ chỉ còn dùng ở khu quản trị và vài tiện ích toàn cục (message,
 * Drawer, Tabs). Đặt token ở đây để không phải override bằng `!important`
 * rải rác trong CSS như bản cũ.
 *
 * PHẢI chép mã màu chứ không dùng được `var(--color-*)`: antd tự tính ra cả
 * dải màu dẫn xuất (hover, active, viền) từ mã gốc, mà tính thì cần giá trị
 * thật chứ không phải biến CSS. Đây là nơi DUY NHẤT được phép chép mã màu —
 * đổi token trong globals.css thì sửa luôn ở đây, cùng một commit.
 */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: "#574fb5",
    colorSuccess: "#35805a",
    colorError: "#c04a5c",
    colorWarning: "#c08d2b",
    colorInfo: "#2b7396",

    colorText: "#1f2333",
    colorTextSecondary: "#5a6076",
    colorTextTertiary: "#8b91a6",
    colorBgLayout: "#f7f8fa",

    borderRadius: 14,
    borderRadiusLG: 20,
    borderRadiusSM: 10,

    fontFamily: "var(--font-inter), system-ui, sans-serif",
    fontSize: 16,

    controlHeight: 44,
    controlHeightLG: 52,
  },
  components: {
    Button: {
      fontWeight: 700,
      primaryShadow: "none",
    },
    Tabs: {
      titleFontSize: 16,
      inkBarColor: "#574fb5",
    },
    Drawer: {
      paddingLG: 20,
    },
  },
};
