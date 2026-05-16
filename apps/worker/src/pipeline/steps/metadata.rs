use crate::metadata::client;
use crate::pipeline::context::PipelineContext;
use crate::proto::metadata_service::{SeekPoint, Segment};

const SEEKTABLE_VERSION: i32 = 2;
const TIMESCALE: i32 = 44_100;
const FRAGMENT_DURATION_SECONDS: f64 = 2.0;

pub struct MetadataExtractor;

impl MetadataExtractor {
    fn parse_boxes(data: &[u8]) -> Vec<(usize, usize, usize, [u8; 4])> {
        let mut boxes = Vec::new();
        let mut pos = 0usize;

        while pos + 8 <= data.len() {
            let size32 =
                u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]])
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

    fn extract_timescale(data: &[u8]) -> Option<i32> {
        for (top_start, top_header, top_size, top_type) in Self::parse_boxes(data) {
            if &top_type != b"moov" {
                continue;
            }

            let moov_payload = data.get(top_start + top_header..top_start + top_size)?;
            for (trak_start, trak_header, trak_size, trak_type) in Self::parse_boxes(moov_payload) {
                if &trak_type != b"trak" {
                    continue;
                }

                let trak_payload =
                    moov_payload.get(trak_start + trak_header..trak_start + trak_size)?;
                for (mdia_start, mdia_header, mdia_size, mdia_type) in
                    Self::parse_boxes(trak_payload)
                {
                    if &mdia_type != b"mdia" {
                        continue;
                    }

                    let mdia_payload =
                        trak_payload.get(mdia_start + mdia_header..mdia_start + mdia_size)?;
                    for (mdhd_start, mdhd_header, mdhd_size, mdhd_type) in
                        Self::parse_boxes(mdia_payload)
                    {
                        if &mdhd_type != b"mdhd" {
                            continue;
                        }

                        let mdhd_payload =
                            mdia_payload.get(mdhd_start + mdhd_header..mdhd_start + mdhd_size)?;
                        let version = *mdhd_payload.first()?;

                        let timescale = if version == 1 {
                            Self::read_u32_be(mdhd_payload, 20)?
                        } else {
                            Self::read_u32_be(mdhd_payload, 12)?
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

        for (traf_start, traf_header, traf_size, traf_type) in Self::parse_boxes(moof_payload) {
            if &traf_type != b"traf" {
                continue;
            }

            let traf_payload =
                moof_payload.get(traf_start + traf_header..traf_start + traf_size)?;
            for (tfdt_start, tfdt_header, tfdt_size, tfdt_type) in Self::parse_boxes(traf_payload) {
                if &tfdt_type != b"tfdt" {
                    continue;
                }

                let tfdt_payload =
                    traf_payload.get(tfdt_start + tfdt_header..tfdt_start + tfdt_size)?;
                let version = *tfdt_payload.first()?;
                let base_time = if version == 1 {
                    Self::read_u64_be(tfdt_payload, 4)? as f64
                } else {
                    Self::read_u32_be(tfdt_payload, 4)? as f64
                };
                return Some(base_time / safe_timescale);
            }
        }

        None
    }

    pub fn extract_seek_points(data: &[u8]) -> Vec<SeekPoint> {
        let mut seek_points = Vec::new();
        let fallback_fragment_duration = FRAGMENT_DURATION_SECONDS;
        let timescale = Self::extract_timescale(data).unwrap_or(TIMESCALE);
        let mut current_time = 0.0_f64;

        for (offset, header_len, box_size, box_type) in Self::parse_boxes(data) {
            if &box_type == b"moof" {
                let moof_payload = data.get(offset + header_len..offset + box_size);
                let timestamp = moof_payload
                    .and_then(|payload| Self::extract_tfdt_seconds(payload, timescale))
                    .unwrap_or(current_time)
                    .max(0.0);

                seek_points.push(SeekPoint {
                    timestamp,
                    byte_offset: offset as i64,
                });

                current_time = if timestamp + fallback_fragment_duration > current_time {
                    timestamp + fallback_fragment_duration
                } else {
                    current_time + fallback_fragment_duration
                };
            }
        }

        seek_points
    }

    pub fn generate_waveform(_data: &[u8]) -> Vec<f32> {
        (0..100).map(|i| (i as f32 * 0.1).sin().abs()).collect()
    }
}

fn validate_seek_points(seek_points: &[SeekPoint]) -> anyhow::Result<()> {
    if seek_points.is_empty() {
        return Err(anyhow::anyhow!(
            "Metadata step: no seek points extracted from transcoded output"
        ));
    }

    let mut last_offset = -1_i64;
    let mut last_ts = -1.0_f64;

    for p in seek_points {
        if p.byte_offset < 0 {
            return Err(anyhow::anyhow!(
                "Metadata step: negative seek point offset: {}",
                p.byte_offset
            ));
        }
        if p.byte_offset <= last_offset {
            return Err(anyhow::anyhow!(
                "Metadata step: seek point offsets are not strictly increasing"
            ));
        }
        if p.timestamp < last_ts {
            return Err(anyhow::anyhow!(
                "Metadata step: seek point timestamps are not monotonic"
            ));
        }
        last_offset = p.byte_offset;
        last_ts = p.timestamp;
    }

    Ok(())
}

fn build_segments(
    seek_points: &[SeekPoint],
    file_size: usize,
    duration_sec: f64,
    timescale: i32,
) -> anyhow::Result<Vec<Segment>> {
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

    if segments.iter().all(|s| s.size <= 0) {
        return Err(anyhow::anyhow!(
            "Metadata step: all segment sizes are zero; invalid seek table"
        ));
    }

    Ok(segments)
}

pub async fn process(ctx: &mut PipelineContext) -> anyhow::Result<()> {
    let data = ctx
        .data
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("Metadata step: no data found in context"))?;

    let timescale = MetadataExtractor::extract_timescale(data).unwrap_or(TIMESCALE);
    let seek_points = MetadataExtractor::extract_seek_points(data);
    let waveform = MetadataExtractor::generate_waveform(data);
    let inferred_min_duration = seek_points
        .last()
        .map(|p| p.timestamp + FRAGMENT_DURATION_SECONDS)
        .unwrap_or(0.0);
    let duration = ctx.duration.unwrap_or(0.0).max(inferred_min_duration);
    validate_seek_points(&seek_points)?;
    let segments = build_segments(&seek_points, data.len(), duration, timescale)?;

    ctx.encryption_start_offset = seek_points.first().map(|p| p.byte_offset.max(0) as usize);
    let encryption_start = ctx.encryption_start_offset.unwrap_or(0) as i64;
    let init_range_end = (encryption_start - 1).max(0);

    client::update_technical_meta(
        ctx.job.song_id.clone(),
        duration,
        segments,
        waveform,
        encryption_start,
        SEEKTABLE_VERSION,
        timescale,
        encryption_start,
        0,
        init_range_end,
    )
    .await?;
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

    fn make_box_with_payload(box_type: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let size = (8 + payload.len()) as u32;
        let mut out = Vec::with_capacity(8 + payload.len());
        out.extend_from_slice(&size.to_be_bytes());
        out.extend_from_slice(box_type);
        out.extend_from_slice(payload);
        out
    }

    fn make_moof_with_tfdt(base_media_decode_time: u64) -> Vec<u8> {
        let mut tfdt_payload = Vec::with_capacity(12);
        tfdt_payload.extend_from_slice(&[1, 0, 0, 0]); // version=1, flags=0
        tfdt_payload.extend_from_slice(&base_media_decode_time.to_be_bytes());

        let tfdt = make_box_with_payload(b"tfdt", &tfdt_payload);
        let traf = make_box_with_payload(b"traf", &tfdt);
        make_box_with_payload(b"moof", &traf)
    }

    #[test]
    fn extract_seek_points_reads_real_moof_boxes_only() {
        let mut data = Vec::new();
        data.extend(make_box(b"ftyp", 12));
        data.extend(make_box(b"moov", 16));
        let moof1_start = data.len() as i64;
        data.extend(make_box(b"moof", 24));
        data.extend(make_box(b"mdat", 100));
        let moof2_start = data.len() as i64;
        data.extend(make_box(b"moof", 24));
        data.extend(make_box(b"mdat", 64));

        let seek_points = MetadataExtractor::extract_seek_points(&data);
        assert_eq!(seek_points.len(), 2);
        assert_eq!(seek_points[0].byte_offset, moof1_start);
        assert_eq!(seek_points[1].byte_offset, moof2_start);
        assert!((seek_points[1].timestamp - 2.0).abs() < f64::EPSILON);
    }

    #[test]
    fn extract_seek_points_prefers_tfdt_timestamps_when_present() {
        let mut data = Vec::new();
        data.extend(make_box(b"ftyp", 12));
        let moof1_start = data.len() as i64;
        data.extend(make_moof_with_tfdt(0));
        data.extend(make_box(b"mdat", 32));
        let moof2_start = data.len() as i64;
        data.extend(make_moof_with_tfdt(132_300)); // 3.0s at 44.1k timescale
        data.extend(make_box(b"mdat", 32));

        let seek_points = MetadataExtractor::extract_seek_points(&data);
        assert_eq!(seek_points.len(), 2);
        assert_eq!(seek_points[0].byte_offset, moof1_start);
        assert_eq!(seek_points[1].byte_offset, moof2_start);
        assert!((seek_points[0].timestamp - 0.0).abs() < f64::EPSILON);
        assert!((seek_points[1].timestamp - 3.0).abs() < f64::EPSILON);
    }

    #[test]
    fn build_segments_keeps_monotonic_sizes_and_2s_duration_ts() {
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

        let segments = build_segments(&seek_points, 90_000, 6.0, TIMESCALE).expect("segments");
        assert_eq!(segments.len(), 3);
        assert_eq!(segments[0].size, 33_000);
        assert_eq!(segments[1].size, 32_800);
        assert_eq!(segments[0].duration_ts, 88_200);
        assert_eq!(segments[1].duration_ts, 88_200);
        assert!(segments[2].duration_ts >= 88_000);
        assert!(segments.iter().all(|s| s.size > 0));
    }
}
