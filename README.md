# Cephome: Bộ chuyển ngữ giọng hát Tiếng Việt

## Giới thiệu

`cephome` là bộ chuyển ngữ thành hệ thống phiên âm Tiếng Nhật, khi sử dụng với NEUTRINO, hệ thống hỗ trợ soạn thảo lời ca hoàn toàn bằng chữ quốc ngữ. Hệ thống dịch thành dạng đọc thô Tiếng Nhật và timming sao cho tiếng hát có âm điệu và phát âm chính xác, mượt mà.

Các VOICEBANK miễn phí <sub>`(c) SSS`</sub> đã được thử nghiệm với độ chính xác đọc tương đối cao:

- `ZUNKO` - Tohoku Zunko
- `KIRITAN` - Tohoku Kiritan
- `CHANKO` - Oedo Chanko
- `MERROW`

## Ứng dụng

- [Sài Gòn Đẹp Lắm - Tohoku Zunko](https://youtu.be/aRLEUu60MAc)
- [Lá thuyền ước mơ - Tohoku Zunko](https://www.youtube.com/shorts/9Bs_qtgM6NU)

## Hướng dẫn cài đặt nhanh

Chi tiết tải về và cấu hình có tại: **[Giao diện Cephome](https://huwutao.github.io/cephome)**

1. Tải tệp tin chương trình chạy `musicXMLtoLabel.exe` và bộ quy tắc dịch `rule.js` từ trang Giao diện Cephome.
2. Di chuyển cả 2 tệp vừa tải vào thư mục `NEUTRINO/bin` trong thư mục cài đặt `NEUTRINO` của bạn (hãy đổi tên hoặc sao lưu file `musicXMLtoLabel.exe` cũ).
3. Soạn tập nhạc musicXML (nên xuất từ Musescore) viết bằng kiểu quốc ngữ (kiểu UTF-8/UNICODE).
4. Chạy phần mềm tạo nhạc NEUTRINO để tạo giọng hát như bình thường.
