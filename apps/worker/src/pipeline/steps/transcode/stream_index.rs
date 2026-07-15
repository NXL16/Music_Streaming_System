use crate::proto::metadata_service::{SeekPoint, Segment};

pub const SEEKTABLE_VERSION: i32 = 2;
pub const TIMESCALE_FALLBACK: i32 = 44_100;
pub const FRAGMENT_DURATION_SECONDS: f64 = 2.0;
/// Upper bound on how large the incremental box-parse buffer may grow. A single
/// fragmented-mp4 box (moov/moof/mdat) is normally well under this. If a box
/// declares a size larger than this — or its bytes never fully arrive — the
/// buffer would otherwise grow without bound, so we cap it and error out.
pub const MAX_PARSE_BUFFER_BYTES: usize = 64 * 1024 * 1024;

fn read_u32_be(data: &[u8], offset: usize) -> Option<u32> {
    let bytes = data.get(offset..offset + 4)?;
    Some(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

fn read_u64_be(data: &[u8], offset: usize) -> Option<u64> {
    let bytes = data.get(offset..offset + 8)?;
    Some(u64::from_be_bytes([
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
    ]))
}

fn parse_boxes(data: &[u8]) -> Vec<(usize, usize, usize, [u8; 4])> {
    let mut boxes = Vec::new();
    let mut pos = 0usize;

    while pos + 8 <= data.len() {
        let size32 = u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]])
            as usize;
        let box_type = [data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]];

        let (header_len, box_size) = if size32 == 1 {
            if pos + 16 > data.len() {
                break;
            }
            let size64 = u64::from_be_bytes([
                data[pos + 8],
                data[pos + 9],
                data[pos + 10],
                data[pos + 11],
                data[pos + 12],
                data[pos + 13],
                data[pos + 14],
                data[pos + 15],
            ]) as usize;
            (16usize, size64)
        } else if size32 == 0 {
            (8usize, data.len() - pos)
        } else {
            (8usize, size32)
        };

        if box_size < header_len || pos + box_size > data.len() {
            break;
        }

        boxes.push((pos, header_len, box_size, box_type));
        pos += box_size;
    }

    boxes
}

fn extract_timescale(data: &[u8]) -> Option<i32> {
    for (top_start, top_header, top_size, top_type) in parse_boxes(data) {
        if &top_type != b"moov" {
            continue;
        }

        let moov_payload = data.get(top_start + top_header..top_start + top_size)?;
        for (trak_start, trak_header, trak_size, trak_type) in parse_boxes(moov_payload) {
            if &trak_type != b"trak" {
                continue;
            }

            let trak_payload = moov_payload.get(trak_start + trak_header..trak_start + trak_size)?;
            for (mdia_start, mdia_header, mdia_size, mdia_type) in parse_boxes(trak_payload) {
                if &mdia_type != b"mdia" {
                    continue;
                }

                let mdia_payload = trak_payload.get(mdia_start + mdia_header..mdia_start + mdia_size)?;
                for (mdhd_start, mdhd_header, mdhd_size, mdhd_type) in parse_boxes(mdia_payload) {
                    if &mdhd_type != b"mdhd" {
                        continue;
                    }

                    let mdhd_payload = mdia_payload.get(mdhd_start + mdhd_header..mdhd_start + mdhd_size)?;
                    let version = *mdhd_payload.first()?;

                    let timescale = if version == 1 {
                        read_u32_be(mdhd_payload, 20)?
                    } else {
                        read_u32_be(mdhd_payload, 12)?
                    };

                    if timescale > 0 {
                        return Some(timescale as i32);
                    }
                }
            }
        }
    }

    None
}

fn extract_tfdt_seconds(moof_payload: &[u8], timescale: i32) -> Option<f64> {
    let safe_timescale = timescale.max(1) as f64;

    for (traf_start, traf_header, traf_size, traf_type) in parse_boxes(moof_payload) {
        if &traf_type != b"traf" {
            continue;
        }

        let traf_payload = moof_payload.get(traf_start + traf_header..traf_start + traf_size)?;
        for (tfdt_start, tfdt_header, tfdt_size, tfdt_type) in parse_boxes(traf_payload) {
            if &tfdt_type != b"tfdt" {
                continue;
            }

            let tfdt_payload = traf_payload.get(tfdt_start + tfdt_header..tfdt_start + tfdt_size)?;
            let version = *tfdt_payload.first()?;
            let base_time = if version == 1 {
                read_u64_be(tfdt_payload, 4)? as f64
            } else {
                read_u32_be(tfdt_payload, 4)? as f64
            };
            return Some(base_time / safe_timescale);
        }
    }

    None
}

pub struct IncrementalMetaParser {
    buffer: Vec<u8>,
    consumed_prefix: usize,
    pub seek_points: Vec<SeekPoint>,
    current_time: f64,
    pub timescale: Option<i32>,
}

impl IncrementalMetaParser {
    pub fn new() -> Self {
        Self {
            buffer: Vec::new(),
            consumed_prefix: 0,
            seek_points: Vec::new(),
            current_time: 0.0,
            timescale: None,
        }
    }

    pub fn push(&mut self, chunk: &[u8]) -> anyhow::Result<()> {
        if chunk.is_empty() {
            return Ok(());
        }

        self.buffer.extend_from_slice(chunk);

        loop {
            if self.buffer.len() < 8 {
                break;
            }

            let size32 = u32::from_be_bytes([
                self.buffer[0],
                self.buffer[1],
                self.buffer[2],
                self.buffer[3],
            ]) as usize;
            let box_type = [self.buffer[4], self.buffer[5], self.buffer[6], self.buffer[7]];

            let (header_len, box_size) = if size32 == 1 {
                if self.buffer.len() < 16 {
                    break;
                }
                let size64 = u64::from_be_bytes([
                    self.buffer[8],
                    self.buffer[9],
                    self.buffer[10],
                    self.buffer[11],
                    self.buffer[12],
                    self.buffer[13],
                    self.buffer[14],
                    self.buffer[15],
                ]) as usize;
                (16usize, size64)
            } else if size32 == 0 {
                break;
            } else {
                (8usize, size32)
            };

            if box_size < header_len || self.buffer.len() < box_size {
                break;
            }

            let box_data = &self.buffer[..box_size];
            if &box_type == b"moov" && self.timescale.is_none() {
                self.timescale = extract_timescale(box_data);
            }

            if &box_type == b"moof" {
                let ts = box_data
                    .get(header_len..)
                    .and_then(|payload| {
                        extract_tfdt_seconds(payload, self.timescale.unwrap_or(TIMESCALE_FALLBACK))
                    })
                    .unwrap_or(self.current_time)
                    .max(0.0);

                self.seek_points.push(SeekPoint {
                    timestamp: ts,
                    byte_offset: self.consumed_prefix as i64,
                });

                self.current_time = if ts + FRAGMENT_DURATION_SECONDS > self.current_time {
                    ts + FRAGMENT_DURATION_SECONDS
                } else {
                    self.current_time + FRAGMENT_DURATION_SECONDS
                };
            }

            self.buffer.drain(..box_size);
            self.consumed_prefix += box_size;
        }

        if self.buffer.len() > MAX_PARSE_BUFFER_BYTES {
            return Err(anyhow::anyhow!(
                "stream index parse buffer exceeded {} bytes (malformed or oversized mp4 box)",
                MAX_PARSE_BUFFER_BYTES
            ));
        }

        Ok(())
    }
}

pub fn build_segments(
    seek_points: &[SeekPoint],
    file_size: usize,
    duration_sec: f64,
    timescale: i32,
) -> anyhow::Result<Vec<Segment>> {
    if seek_points.is_empty() {
        return Err(anyhow::anyhow!("no seek points extracted from transcoded output"));
    }

    let mut segments = Vec::with_capacity(seek_points.len());
    for (idx, sp) in seek_points.iter().enumerate() {
        let start_byte = sp.byte_offset.max(0);
        let next_start = if idx + 1 < seek_points.len() {
            seek_points[idx + 1].byte_offset.max(start_byte)
        } else {
            file_size as i64
        };

        let size = (next_start - start_byte).max(0);
        let start_time_sec = sp.timestamp.max(0.0);
        let end_time_sec = if idx + 1 < seek_points.len() {
            seek_points[idx + 1].timestamp.max(start_time_sec)
        } else {
            duration_sec.max(start_time_sec)
        };
        let duration_sec_seg = (end_time_sec - start_time_sec).max(0.0);
        let duration_ts = (duration_sec_seg * timescale as f64).round() as i64;

        segments.push(Segment {
            start_byte,
            size,
            duration_ts,
            start_time_sec,
        });
    }

    Ok(segments)
}

pub fn validate_seek_points(seek_points: &[SeekPoint]) -> anyhow::Result<()> {
    if seek_points.is_empty() {
        return Err(anyhow::anyhow!(
            "no seek points extracted from transcoded output"
        ));
    }

    let mut last_offset = -1_i64;
    let mut last_ts = -1.0_f64;
    for p in seek_points {
        if p.byte_offset < 0 {
            return Err(anyhow::anyhow!("seek point has negative byte_offset"));
        }
        if p.byte_offset <= last_offset {
            return Err(anyhow::anyhow!(
                "seek point byte_offset is not strictly increasing"
            ));
        }
        if p.timestamp < last_ts {
            return Err(anyhow::anyhow!("seek point timestamp is not monotonic"));
        }
        last_offset = p.byte_offset;
        last_ts = p.timestamp;
    }

    Ok(())
}

pub fn validate_segments(segments: &[Segment]) -> anyhow::Result<()> {
    if segments.is_empty() {
        return Err(anyhow::anyhow!("segments is empty"));
    }

    let mut last_start = -1_i64;
    let mut last_time = -1.0_f64;
    for seg in segments {
        if seg.start_byte < 0 || seg.size <= 0 || seg.duration_ts <= 0 || seg.start_time_sec < 0.0 {
            return Err(anyhow::anyhow!("segment has invalid values"));
        }
        if seg.start_byte <= last_start {
            return Err(anyhow::anyhow!("segment start_byte is not strictly increasing"));
        }
        if seg.start_time_sec < last_time {
            return Err(anyhow::anyhow!("segment start_time_sec is not monotonic"));
        }
        last_start = seg.start_byte;
        last_time = seg.start_time_sec;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_box(box_type: &[u8; 4], payload_len: usize) -> Vec<u8> {
        let size = (8 + payload_len) as u32;
        let mut out = Vec::with_capacity(8 + payload_len);
        out.extend_from_slice(&size.to_be_bytes());
        out.extend_from_slice(box_type);
        out.extend(std::iter::repeat_n(0u8, payload_len));
        out
    }

    #[test]
    fn parser_extracts_moof_seek_points_with_monotonic_offsets() {
        let mut data = Vec::new();
        data.extend(make_box(b"ftyp", 12));
        data.extend(make_box(b"moov", 16));
        let moof1_start = data.len() as i64;
        data.extend(make_box(b"moof", 24));
        data.extend(make_box(b"mdat", 100));
        let moof2_start = data.len() as i64;
        data.extend(make_box(b"moof", 24));
        data.extend(make_box(b"mdat", 64));

        let mut parser = IncrementalMetaParser::new();
        parser.push(&data).expect("push should not exceed cap");

        assert_eq!(parser.seek_points.len(), 2);
        assert_eq!(parser.seek_points[0].byte_offset, moof1_start);
        assert_eq!(parser.seek_points[1].byte_offset, moof2_start);
        assert!(validate_seek_points(&parser.seek_points).is_ok());
    }

    #[test]
    fn build_segments_returns_positive_sizes_and_duration() {
        let seek_points = vec![
            SeekPoint {
                timestamp: 0.0,
                byte_offset: 729,
            },
            SeekPoint {
                timestamp: 2.0,
                byte_offset: 33729,
            },
            SeekPoint {
                timestamp: 4.0,
                byte_offset: 66529,
            },
        ];
        let segments =
            build_segments(&seek_points, 90_000, 6.0, TIMESCALE_FALLBACK).expect("segments");
        assert_eq!(segments.len(), 3);
        assert!(segments.iter().all(|s| s.size > 0 && s.duration_ts > 0));
        assert!(validate_segments(&segments).is_ok());
    }
}
