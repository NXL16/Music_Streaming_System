export async function calculateFileSha256(file: File) {
  // Web Crypto (`crypto.subtle.digest`) KHÔNG có API băm tăng dần/streaming
  // trong trình duyệt: nó bắt buộc phải nhận toàn bộ buffer một lần. Vì vậy,
  // dù đọc file qua `file.stream()` theo từng chunk, chúng ta vẫn phải gom lại
  // thành một buffer đầy đủ để đưa vào `digest` — điều này không tiết kiệm bộ
  // nhớ hơn `file.arrayBuffer()` mà còn tốn thêm một lần cấp phát khi ghép chunk.
  //
  // Nếu sau này thêm một thư viện băm tăng dần thuần WASM (ví dụ `hash-wasm`),
  // hãy thay khối dưới bằng vòng lặp đọc `file.stream().getReader()` và
  // `hasher.update(chunk)` để tránh giữ toàn bộ file trong RAM. Hiện tại,
  // để không phụ thuộc nặng, ta dùng `arrayBuffer()` và giới hạn vòng đời của
  // buffer trong một block để nó được giải phóng (GC) ngay sau khi băm xong.
  let hashArray: number[];
  {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    hashArray = Array.from(new Uint8Array(hashBuffer));
  }

  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getAudioTitleFromFile(file: File) {
  return file.name.replace(/\.[^/.]+$/, "");
}
