# Design System — Funny English

Tài liệu chuẩn cho toàn hệ thống giao diện. Đọc file này trước khi viết bất kỳ UI nào.

## Ba nơi, ba vai trò — đừng lẫn

| Nơi | Vai trò |
|---|---|
| [src/app/globals.css](src/app/globals.css) | **Nguồn sự thật của giá trị.** Mọi hex, bo góc, font, easing khai báo ở đây và chỉ ở đây. |
| File này | **Nguồn sự thật của luật.** Dùng token nào cho việc gì, cấm gì, component nào cho tình huống nào. |
| [design-system.html](design-system.html) | **Bản xem cho mắt người.** File tĩnh ở gốc repo, mở bằng `file://`. Không khai báo gì cả. |

Quy tắc sống còn: **file md này không chép giá trị cụ thể**. Không viết `#7c4dff`, không viết `20px`. Chép giá trị vào đây là tạo ra bản sao sẽ lệch ngay lần đầu ai đó sửa CSS mà quên sửa doc. Cần biết màu grape là mã gì thì mở `globals.css`, hoặc mở `design-system.html` để nhìn tận mắt.

Bảng HTML đó **không được Next serve** — không phải route, không nằm trong `public/`. Chỉ người có repo mới xem được. Trước đây nó là route `/design-system`, ai biết URL cũng vào xem được nên đã bỏ.

Bảng HTML có chép giá trị (nó phải chép, vì Tailwind không chạy trong file tĩnh). Nên: **sửa token trong `globals.css` thì chép sang `design-system.html` cho khớp, trong cùng một commit.** Quên là bảng bắt đầu nói dối, mà nói dối lặng lẽ thì không ai phát hiện.

---

## Màu sắc

Tỉ lệ **60-30-10**: phần lớn diện tích là nền trung tính sáng, một màu chủ đạo, và màu nhấn dùng dè.

### 60% — Chữ và nền

| Token | Dùng cho |
|---|---|
| `cloud` | Nền trang |
| `cloud-deep` | Viền, nền skeleton, rãnh thanh tiến độ |
| `ink` | Chữ chính |
| `ink-soft` | Chữ phụ, mô tả |
| `ink-faint` | Chữ mờ nhất, placeholder |

Chữ dùng navy sâu chứ **không dùng đen thuần** — đen thuần trên nền sáng gây chói khi đọc lâu.

### 30% — Màu chủ đạo

`grape` là màu thương hiệu và hành động chính. `sky` là màu phụ, dùng cho hành động cấp hai hoặc để phân biệt khối.

### 10% — Màu nhấn, mỗi màu một nghĩa cố định

| Token | Nghĩa — **không dùng lẫn** |
|---|---|
| `leaf` | Đúng, hoàn thành, đã thuộc |
| `cherry` | Sai, xoá, cảnh báo |
| `sun` | Thưởng, huy hiệu, số thứ tự, điểm |

Đây là ràng buộc ngữ nghĩa, không phải gợi ý thẩm mỹ. Dùng `cherry` cho một nút "Lưu" chỉ vì thấy đỏ nổi là phá hệ thống — người học đã quen đỏ nghĩa là sai.

### Biến thể

Mỗi màu có ba dạng:

- **gốc** — nền khối đặc, chữ trên nền sáng
- **`-dark`** — bóng đặc của nút 3D (gán qua `--push-shade`), và chữ đậm trên nền `-soft`
- **`-soft`** — nền nhạt cho ô số liệu, trạng thái đáp án

### Một bảng màu duy nhất

Đã có lúc hệ thống chạy hai bảng màu qua scope `[data-track="v2"]`: tươi cho trẻ em, trầm cho người đi làm. **Đã bỏ.** Hệ thống không chia theo đối tượng người dùng nữa mà chia theo **đơn vị học** — học từ vựng hay học theo câu — và một người dùng cả hai, nên chỉ còn một giao diện.

Nếu thấy `data-track` ở đâu đó trong code, đó là tàn dư, xoá đi.

Bảng màu hiện tại hạ bão hoà so với bản đầu, dùng chung cho mọi người học. Chữ trắng trên `grape`/`sky`/`leaf`/`cherry` đạt tương phản AA; `sun` phải dùng chữ `ink`. Thêm hoặc đổi màu thì **kiểm tra lại tương phản**, đừng chọn bằng mắt.

**Ant Design là ngoại lệ chép mã màu.** [src/theme/antdTheme.ts](src/theme/antdTheme.ts) buộc phải ghi mã màu thật chứ không dùng được `var(--color-*)`, vì antd tự tính cả dải màu dẫn xuất (hover, active, viền) từ mã gốc. Đổi token trong `globals.css` thì sửa luôn file đó, cùng một commit — quên là khu admin lệch màu với phần còn lại.

### Hiệu ứng tương tác giữ nguyên cho mọi người

`.btn-push` và toàn bộ `.anim-*` không phân biệt ai đang dùng. Nút lún khi bấm và nảy khi trả lời đúng là *phản hồi thao tác* — người lớn cũng cần biết máy đã nhận lệnh. Bỏ chúng đi để trông "nghiêm túc" là hiểu nhầm chúng thành đồ trang trí trẻ con.

### Cấm

- Hex thô trong JSX, `style={{}}`, hay CSS.
- Class Tailwind mặc định: `bg-blue-500`, `text-gray-600`, `border-slate-200`, `rounded-lg`, `rounded-xl`.

Chỉ dùng token của dự án. Nếu không có token nào hợp, đó là dấu hiệu cần thêm token — xem [Thêm token mới](#thêm-token-mới) ở cuối.

---

## Bo góc

Bốn cấp, chọn theo kích thước khối:

| Token | Dùng cho |
|---|---|
| `rounded-blob` | Ô vuông nhỏ, khối icon, skeleton |
| `rounded-card` | Thẻ nội dung, ô số liệu |
| `rounded-pill` | Nút, ô nhập, đáp án |
| `rounded-jumbo` | Khối lớn: banner, hero |

Riêng huy hiệu tròn và thanh tiến độ dùng `rounded-full`.

---

## Chữ

| Font | Dùng cho |
|---|---|
| `font-display` (Inter) | Tiêu đề, nút, con số, nhãn ngắn |
| `font-body` (Inter) | Đoạn văn, mô tả dài |

Một họ chữ duy nhất, phân cấp bằng **độ đậm** chứ không bằng hai kiểu chữ. Trước đây là Baloo 2 + Nunito cho định hướng trẻ em — đã bỏ cùng lúc với việc bỏ hai bảng màu.

`h1`–`h4` đã tự nhận `font-display` + `font-weight: 800` từ base layer — không cần lặp lại class.

Chữ nghiêng về đậm: `font-bold` là mặc định cho chữ thường, `font-extrabold` cho tiêu đề và nút. Con số thống kê thêm `tabular-nums` để không nhảy cột khi đổi giá trị.

---

## Chuyển động

Class dùng sẵn, không tự viết `@keyframes` mới nếu một trong số này đủ dùng:

| Class | Khi nào |
|---|---|
| `.anim-pop-in` | Khối mới xuất hiện |
| `.anim-slide-in` | Thẻ tiếp theo trượt vào |
| `.anim-shake` | Trả lời **sai** |
| `.anim-bounce` | Trả lời **đúng** |
| `.anim-float` | Minh hoạ trôi nhẹ ở màn hình trống |
| `.anim-slide-up` | Tấm trượt lên từ đáy (`BottomSheet`) |

Easing nảy dùng `--ease-pop` — trừ `.anim-slide-up`, tấm trượt lên mà nảy trông như lỗi. Base layer đã có `prefers-reduced-motion` tắt toàn bộ animation — nếu viết hiệu ứng bằng JS hoặc inline style thì phải tự tôn trọng thiết lập này.

---

## Component

Tất cả ở [src/components/ui/](src/components/ui/). **Dùng lại, đừng viết mới.** Cần biến thể chưa có thì thêm `tone`/`size` vào component sẵn có, không tạo file song song.

### Button — [src/components/ui/Button.tsx](src/components/ui/Button.tsx)

Mọi hành động đều đi qua đây. Không viết `<button>` trần.

| Prop | Giá trị |
|---|---|
| `tone` | `grape` (mặc định) · `sky` · `sun` · `leaf` · `cherry` · `plain` |
| `size` | `lg` (mặc định) · `md` |
| `block` | Chiếm hết chiều ngang |
| `loading` | Hiện vòng quay, tự khoá nút |
| `icon` | Node đặt trước chữ |

### IconButton — [src/components/ui/IconButton.tsx](src/components/ui/IconButton.tsx)

Nút tròn chỉ có icon: quay lại, nghe lại, đóng. `label` bắt buộc — nút không có chữ thì trình đọc màn hình chỉ còn cái tên này.

| Prop | Giá trị |
|---|---|
| `tone` | `plain` (mặc định, viền trắng) · `grape` · `sun` |
| `icon` | Node lucide |
| `label` | Câu mô tả hành động, dùng cho `aria-label` lẫn `title` |

### Card / TappableCard — [src/components/ui/Card.tsx](src/components/ui/Card.tsx)

Khối trắng bo tròn viền dày. `TappableCard` đã gắn sẵn `role="button"`, `tabIndex`, và xử lý phím Enter/Space — dùng nó cho thẻ bấm được thay vì tự thêm `onClick` vào `Card`.

### OptionButton — [src/components/ui/OptionButton.tsx](src/components/ui/OptionButton.tsx)

Một lựa chọn đáp án: huy hiệu chữ cái A/B/C/D + chữ đậm. Chữ cái nhận diện nhanh hơn số thứ tự, và khớp với phím tắt 1–4.

Props: `index`, `text`, `state` (`idle` · `correct` · `wrong` · `dimmed`), `size`, `disabled`, `onClick`.

| `size` | Dùng cho |
|---|---|
| `pill` (mặc định) | Đáp án ngắn — một từ tiếng Anh |
| `block` | Đáp án là câu dài — bo góc vuông hơn, cao hơn, chữ nhỏ hơn, huy hiệu căn lên đỉnh |

Màu và icon của từng `state` đã khớp ngữ nghĩa màu ở trên — không override bằng className.

### ChunkTile — [src/components/ui/ChunkTile.tsx](src/components/ui/ChunkTile.tsx)

Một mẩu câu bấm được trong bài ghép câu. **Không dùng `OptionButton` thay thế** — hai thứ khác vai: `OptionButton` là lựa chọn loại trừ nhau (chọn A thì bỏ B), còn mẩu câu là quân bài xếp vào chuỗi, bấm lần nữa là gỡ ra.

Props: `text`, `state` (`tray` · `placed` · `correct` · `wrong`), `isSlot`, `disabled`, `onClick`.

`isSlot` vẽ viền nét đứt cho phần thay được của câu. Nét đứt mang nghĩa cố định trong toàn hệ thống: **chỗ này đổi được sang tình huống khác**.

### Drawer đáy ở khu admin — class `bottom-sheet`

Khu quản trị dùng `Drawer` của antd với `rootClassName="bottom-sheet"`.

**Tên class của antd 6 khác antd 5** — lớp giữa là `.ant-drawer-section`, không phải `.ant-drawer-content`. Viết nhầm thì luật CSS im lặng không có tác dụng, không báo lỗi gì. Nâng cấp antd thì **kiểm lại danh sách class** trong `node_modules/@rc-component/drawer` trước khi tin CSS cũ còn chạy.

Ba lớp: `.ant-drawer-content-wrapper` → `.ant-drawer-section` → `.ant-drawer-body`. Lớp giữa phải có `max-height` + `display: flex`, và body phải có `min-height: 0` + `overflow-y: auto`. Thiếu bất kỳ mảnh nào thì thân drawer dài ra rồi bị cắt cụt **không kèm thanh cuộn**, nút Lưu biến mất khỏi màn hình và chỉ zoom nhỏ trình duyệt mới thấy.

Form dài thì chia hai cột từ `lg` (xem [admin/v2/cards](<src/app/(dashboard)/admin/v2/cards/page.tsx>)), chứ đừng ba cột: trong drawer đáy ở màn laptop, ba cột còn ~300px mỗi cột — hẹp hơn một ô nhập đôi.

### BottomSheet — [src/components/ui/BottomSheet.tsx](src/components/ui/BottomSheet.tsx)

Tấm trượt lên từ đáy. Props: `open`, `title`, `onClose`, `children`. Đã khoá cuộn nền, đóng bằng Esc và bằng cách chạm ra ngoài.

Chỉ dùng cho nội dung **phụ mà người học tự chọn xem** — gợi ý, ví dụ, chú thích. Thứ bắt buộc phải đọc thì để thẳng trên trang; giấu đi là người cần nhất lại không thấy.

Trượt từ đáy chứ không hiện giữa màn hình: trên điện thoại đáy là chỗ ngón cái với tới, mà đây là thứ mở ra đóng lại liên tục. Không dùng `Drawer` của antd — antd chỉ còn ở khu quản trị.

### ProgressBar — [src/components/ui/ProgressBar.tsx](src/components/ui/ProgressBar.tsx)

Props: `percent` (tự kẹp 0–100), `tone` (`leaf` · `grape` · `sun` · `sky`), `label`. Đã có đủ thuộc tính ARIA.

### StatTile — [src/components/ui/StatTile.tsx](src/components/ui/StatTile.tsx)

Ô số liệu tóm tắt: số đứng trước nhãn và to gấp đôi, lướt mắt là đọc được. Props: `icon`, `value`, `label`, `tone` (`grape` · `sky` · `sun` · `leaf`).

### Layout — [src/components/ui/Layout.tsx](src/components/ui/Layout.tsx)

`Screen` là khung nội dung của **mọi** trang. Chọn `width` theo nội dung:

| `width` | Dùng cho |
|---|---|
| `narrow` | Form, luồng học — hẹp cho dễ đọc |
| `default` | Mặc định |
| `wide` | Trang chủ, lưới nhiều cột |

Cùng file: `Loader` (đang tải), `Skeleton` (giữ chỗ, tránh giật layout), `EmptyState` (màn hình trống — có `emoji`, `title`, `hint`, `action`).

### Icon

Chỉ dùng `lucide-react`. Không thêm bộ icon thứ hai. Nút chỉ có icon phải có `aria-label`.

---

## Hai chữ ký hình ảnh

**Nút 3D.** Class `.btn-push` tạo bóng đặc ở đáy, bấm thì nút lún xuống đúng `--push` và bóng biến mất. Mỗi biến thể tự đặt `--push-shade` bằng màu `-dark` của mình. Cảm giác "sờ được" này là phản hồi cho biết máy đã nhận thao tác — nút phẳng làm mất nó.

**Viền đặc thay đổ bóng mờ.** Khối trắng mặc định là `border-2 border-cloud-deep`. Viền đặc làm khối trông chắc và giữ được ranh giới rõ trên màn hình nhỏ, khác với shadow mờ.

Ngoài ra `.dotted-bg` cho nền hoạ tiết chấm mờ — vui mắt mà không ồn.

---

## Nguyên tắc chung

- **Mobile-first.** Viết layout mobile trước rồi mở rộng bằng `lg:`. Không viết desktop trước rồi thu nhỏ.
- **Vùng bấm tối thiểu 48px** — `min-h-12` trở lên cho mọi thứ bấm được.
- **Tiếng Việt** cho toàn bộ chữ hiển thị và comment trong code.
- **Focus nhìn thấy được.** Base layer đã có `:focus-visible` viền grape — đừng tắt outline.
- **Ant Design chỉ còn ở khu admin.** Màn hình học viên dùng component trong `ui/`. Không kéo antd vào trang mới của học viên; không override antd bằng `!important`.

---

## Thêm token mới

1. Khai báo trong `@theme` của [globals.css](src/app/globals.css). Màu thì thêm đủ bộ ba: gốc, `-dark`, `-soft`.
2. Chép token đó vào `:root` của [design-system.html](design-system.html), thêm utility `.bg-*` / `.text-*` / `.border-*` tương ứng, rồi thêm một ô màu vào đúng nhóm 60/30/10.
3. Nếu token mang nghĩa cố định (như `leaf` = đúng), ghi nghĩa đó vào file này.

Ba bước, cùng một commit. Bỏ bước 2 thì bảng tra thiếu token mới, và người sau sẽ tưởng nó không tồn tại.

## Kiểm tra sau khi sửa UI

```bash
npm run lint
npm run typecheck
```
