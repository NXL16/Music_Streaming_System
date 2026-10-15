# 404Hz Lyrics Studio

Đây là Lyrics Studio độc lập của 404Hz. App nằm trong monorepo để phát triển cùng API và Song service, nhưng sẽ được build/deploy như một ứng dụng riêng.

## Trạng thái tích hợp

- Editor TTML gốc của AMLL được giữ nguyên.
- Branding và workspace package đã chuyển sang `@musical/lyrics-studio`.
- Menu **404Hz Lyrics…** có thể tải, lưu nháp và xuất bản lyric theo Song ID qua Artist Studio API. Tool lấy access token bằng refresh-cookie của phiên đăng nhập 404Hz; không lưu token trong localStorage hay project file.
- Mỗi lần lưu, Studio chỉ gửi **TTML nguyên gốc** trong `sourceTtml`. Backend lưu nguyên văn; không có LRC, JSON lines/words hay sync mode song song.
- Player lấy lyric qua đúng một endpoint public `GET /songs/:songId/lyrics`. Response theo cấu trúc Apple Music `data[0].attributes.ttmlLocalizations`; web lấy TTML từ field đó và tự parse khi tải. Artist Studio vẫn dùng JSON có `sourceTtml` để mở bản nháp hoặc lyric đã publish trong editor.
- Khi triển khai app ở origin riêng, đặt `VITE_MUSICAL_API_URL` tới API gateway và thêm origin của Lyrics Studio vào `CORS_ORIGIN` tại API. Nếu reverse proxy cùng origin thì không cần biến này.
- TTML metadata, background/duet, translation, romanization, ruby và empty beat được giữ nguyên trong source. Player hiện render primary line/word timing; các kiểu trình bày phụ có thể mở rộng trực tiếp từ TTML sau này mà không cần đổi schema.

## Chạy local

1. Copy `.env.example` thành `.env` và kiểm tra `VITE_MUSICAL_API_URL` trỏ đến API gateway.
2. Thêm origin local của Lyrics Studio vào `CORS_ORIGIN` của API (ví dụ `http://localhost:5173`).
3. Đăng nhập web 404Hz trên cùng trình duyệt, mở Lyrics Studio, vào **File → 404Hz Lyrics…**, nhập Song ID và chọn **Load**, **Save draft** hoặc **Publish**.

