# Cephome: Bộ chuyển ngữ giọng hát Tiếng Việt

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/hUwUtao/cephome)

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

## Chế độ Talkaloid

Đầu vào văn bản thuần được tự động xử lý ở **Talk Mode**. Khác với Flat-TTS cũ,
Talkaloid đọc toàn bộ đoạn văn thành một chuỗi nói có ngữ điệu:

- giữ thanh điệu của từng âm tiết nhưng không ép giai điệu cấp câu vào nốt nhạc;
- bắt đầu bằng một giây `pau`, giữ một thanh ghi nói trung tính và tăng biên độ
  dấu bên trong từng âm tiết;
- kéo dài âm tiết cuối cụm và nhấn câu cảm thán;
- tạo khoảng nghỉ khác nhau cho dấu phẩy, phân câu, kết câu và xuống đoạn;
- tự chèn nhịp lấy hơi nếu một cụm không dấu câu dài quá 12 âm tiết;
- dự đoán độ dài từng âm tiết theo ngữ cảnh bằng TTM chạy trên ONNX Runtime Web/WASM
  một luồng; nếu model không tải được thì tự quay về bộ định thời heuristic;
- đọc số nguyên, số âm và số thập phân thành chữ tiếng Việt trước khi phiên âm;
- dùng chung bộ phân vai âm vị và bộ định thời với pipeline MusicXML.

```bash
echo "Xin chào bạn, hôm nay bạn khỏe không?" | \
  bun run engine/vsinsy/lab/talkaloid.ts --full talk.full.lab --mono talk.mono.lab
```

API model-backed chính là `parseTextToTalkScoreWithTimingModel()` và
`talkaloidToLabelAuto()`. API đồng bộ `parseTextToTalkScore()` và
`talkaloidToLabel()` dùng bộ định thời heuristic. Hai tên cũ
`parseTextToScore()` và `flatTtsToLabel()` vẫn được giữ làm alias tương thích.

CLI dùng TTM mặc định. Thêm `--heuristic` để bỏ qua model. Có thể đổi thư mục
model bằng biến môi trường `CEPHOME_TTM_MODEL_DIR`; thư mục phải chứa
`ttm.onnx`, `ttm.onnx.data`, `vocab.json` và `ort-wasm-simd-threaded.wasm`.
Gauge `--speed 1.25` đọc nhanh hơn 25%; rule host có thể đặt `globalThis.talk_speed`
với cùng ý nghĩa. Hệ số này chỉ áp dụng sau khi TTM dự đoán độ dài.
