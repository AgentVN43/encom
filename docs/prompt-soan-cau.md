# Prompt cho AI soạn câu — dán thẳng vào ô nhập hàng loạt

Dán khối dưới đây vào ChatGPT/Claude, thay `<DANH SÁCH CHỦ ĐỀ>` bằng tên các chủ
đề đang có trong `/admin/v2/topics`. Sau đó gõ một câu tiếng Anh bất kỳ, nó trả
về đúng định dạng dán được vào ô "Nhập câu hàng loạt".

Viết theo lối cộc lốc (caveman) là có chủ đích: câu mệnh lệnh ngắn, không có
chữ thừa, nên mô hình khó hiểu chệch và ít bịa thêm.

Ba chỗ dễ sai nhất đã được chặn thẳng trong prompt:

- **Dấu `-` trong câu tiếng Anh** làm vỡ cách tách cột.
- **Hai mức trang trọng trên một dòng** — hệ thống chỉ nhận một, gõ hai sẽ báo lỗi.
- **Dấu câu thành mẩu riêng** — `[a call] [next week]?` để dấu `?` đứng một mình
  thành một ô rời trong bài ghép câu.

---

```
YOU = ENGLISH PHRASE BUILDER FOR IMPORT. OUTPUT LINES ONLY. NO TALK.

TOPIC LIST. USE ONLY THESE NAMES:
<DANH SÁCH CHỦ ĐỀ>

INPUT = one english sentence.
OUTPUT = 3 lines. same meaning. same function. three politeness levels.

LINE SHAPE:
ENGLISH - VIETNAMESE - LEVEL

SEPARATOR:
- exactly space dash space. " - ".
- ENGLISH must NOT contain " - ". rewrite sentence if it does.
- VIETNAMESE may contain " - ". fine.

LEVEL. ONE WORD ONLY. NEVER TWO:
- trang trọng
- trung tính
- thân mật

BRACKETS. MARK SWAPPABLE PART:
- [ ] = part you swap for other situation. noun, object, time, place.
- outside [ ] = skeleton. verb, question frame, politeness word. stays fixed.
- total 2 to 4 pieces. not more.
- punctuation glued to word. NEVER alone.
  GOOD: Can we schedule [a call] next week?
  BAD:  Can we schedule [a call] [next week]?
- sentence under 4 words = no brackets. fine. leave plain.

FIRST LINE = TOPIC HEADER:
- write "# Name". Name from TOPIC LIST above. exact spelling.
- topic = what speaker WANTS TO DO. fits "I want to ___".
- NEVER use situation as topic. no Meeting. no Email. no Phone.
- if no topic in list fits, write "# ???" and stop. do not invent topic.

LAST LINE = DOMAIN NOTE. NOT FOR PASTE:
- write "DOMAIN: " then any of Work, Life, Social that truly fit.
- pick where person REALLY says this. not where possible.

EXAMPLE
input: Can we schedule a call?
output:
# Suggest
Could we possibly arrange [a call]? - Mình có thể sắp xếp một cuộc gọi được không? - trang trọng
Can we schedule [a call] next week? - Mình sắp xếp một cuộc gọi tuần sau nhé? - trung tính
Wanna hop on [a quick call]? - Gọi nhanh chút nhé? - thân mật
DOMAIN: Work, Social

NO explanation. NO code fence. NO extra words. LINES ONLY.
```

---

## Dùng kết quả

1. Chép từ dòng `#` tới dòng cuối cùng **trước** `DOMAIN:` — dán vào ô nhập.
2. Dòng `DOMAIN:` **không dán**. Đọc nó rồi chọn tay ở ô "Lĩnh vực cho cả loạt".
3. Xem phần xem trước: mỗi câu hiện các mẩu đã chia, mẩu `slot` màu hổ phách.
   Chia sai thì sửa ngoặc ngay trong ô nhập, không cần hỏi lại AI.

## Gom nhiều câu một lượt

Hỏi AI nhiều câu liên tiếp rồi ghép kết quả, gom các dòng cùng chủ đề lại dưới
một tiêu đề `#`. Tiêu đề chỉ cần viết một lần cho cả khối bên dưới nó.

```
# Agree
Sounds good - Nghe hợp lý - trung tính
That works for me - Vậy cũng được - trung tính

# Apologize
I do apologise for [the delay] - Tôi thành thật xin lỗi vì sự chậm trễ - trang trọng
Sorry about [that] - Xin lỗi nhé - thân mật
```

## Đừng tin AI ở hai chỗ

- **Câu tiếng Việt.** AI hay dịch sát chữ. Câu tiếng Việt là mặt trước thẻ,
  người học đọc nó để tự nghĩ ra câu tiếng Anh — nên phải là câu người Việt
  thật sự nói, không phải bản dịch máy móc.
- **Mức thân mật.** AI thường viết "thân mật" vẫn còn trang trọng. Câu thân mật
  thật thường ngắn hơn nhiều và có rút gọn (*"Wanna…"*, *"Got a sec?"*).
