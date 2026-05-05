use crate::pipeline::context::PipelineContext;
use crate::transcoder::ffmpeg::transcode_stream;

pub async fn transcode(ctx: &mut PipelineContext) -> anyhow::Result<()> {
    println!("🎵 Step: Transcoding & Extracting Duration");

    // 1. Lấy stream đầu vào từ context
    // Sử dụng .take() để lấy quyền sở hữu stream vì chúng ta chỉ đọc nó một lần
    let input = ctx.input_stream.take()
        .ok_or_else(|| anyhow::anyhow!("Transcode Step: No input stream found in context"))?;

    // 2. Gọi hàm transcode xử lý luồng
    // Hàm này hiện tại trả về Result<(Vec<u8>, f64)>
    let (output, duration) = transcode_stream(input).await
        .map_err(|e| anyhow::anyhow!("FFmpeg transcode failed: {}", e))?;

    // 3. Kiểm tra dữ liệu đầu ra
    if output.is_empty() {
        return Err(anyhow::anyhow!("Transcode Step: Output data is empty"));
    }

    // 4. Lưu kết quả vào context để các step sau (Metadata, Encrypt) sử dụng
    ctx.data = Some(output);
    ctx.duration = Some(duration);

    println!("✅ Transcode finished!");
    println!("   - Duration: {:.2} seconds", duration);
    println!("   - Data size: {} bytes", ctx.data.as_ref().unwrap().len());

    Ok(())
}