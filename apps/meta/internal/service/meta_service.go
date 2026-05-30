package service

import (
	"context"
	"log"
	"strings"
	"time"

	"Music_Streaming_System/apps/meta/internal/domain"
	"Music_Streaming_System/apps/meta/internal/repository"
	pb "Music_Streaming_System/packages/shared-proto/metadata"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// MetadataServer kế thừa từ UnimplementedMetadataServiceServer được tạo ra bởi Buf
type MetadataServer struct {
	pb.UnimplementedMetadataServiceServer
	repo *repository.MetadataRepository
}

// NewMetadataServer khởi tạo server mới với repository truyền vào
func NewMetadataServer(repo *repository.MetadataRepository) *MetadataServer {
	return &MetadataServer{repo: repo}
}

// UpdateTechnicalMeta: Worker (Rust) sẽ gọi hàm này để lưu thông tin bài hát
func (s *MetadataServer) UpdateTechnicalMeta(ctx context.Context, req *pb.UpdateMetaRequest) (*pb.EmptyResponse, error) {
	log.Printf("Received UpdateTechnicalMeta for Song ID: %s", req.SongId)

	if err := validateUpdateRequest(req); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	domainSegments := make([]domain.Segment, len(req.Segments))
	for i, seg := range req.Segments {
		domainSegments[i] = domain.Segment{
			StartByte:    seg.StartByte,
			Size:         seg.Size,
			DurationTs:   seg.DurationTs,
			StartTimeSec: seg.StartTimeSec,
		}
	}

	meta := domain.SongMetadata{
		SongID:                req.SongId,
		Duration:              req.Duration,
		EncryptionStartOffset: req.EncryptionStartOffset,
		SeektableVersion:      req.SeektableVersion,
		Timescale:             req.Timescale,
		MediaOffset:           req.MediaOffset,
		InitRange: domain.ByteRange{
			Start: req.InitRange.Start,
			End:   req.InitRange.End,
		},
		Segments: domainSegments,
		Waveform: req.Waveform,
		Version:  time.Now().UTC().UnixMilli(),
	}

	// Gọi repository để lưu (Upsert - nếu có rồi thì cập nhật, chưa có thì tạo mới)
	err := s.repo.Upsert(ctx, meta)
	if err != nil {
		log.Printf("Error upserting metadata: %v", err)
		if ctx.Err() != nil {
			return nil, status.Errorf(codes.DeadlineExceeded, "metadata upsert deadline exceeded")
		}
		return nil, status.Errorf(codes.Unavailable, "metadata storage unavailable")
	}

	return &pb.EmptyResponse{}, nil
}

// GetStreamData: API Gateway/Edge sẽ gọi hàm này để lấy dữ liệu phát nhạc
func (s *MetadataServer) GetStreamData(ctx context.Context, req *pb.GetStreamDataRequest) (*pb.StreamDataResponse, error) {
	log.Printf("Received GetStreamData for Song ID: %s", req.SongId)

	// Lấy dữ liệu từ MongoDB thông qua repository
	meta, err := s.repo.GetBySongID(ctx, req.SongId)
	if err != nil {
		log.Printf("Error retrieving metadata for ID %s: %v", req.SongId, err)
		if ctx.Err() != nil {
			return nil, status.Errorf(codes.DeadlineExceeded, "metadata lookup deadline exceeded")
		}
		return nil, status.Errorf(codes.Unavailable, "metadata storage unavailable")
	}
	if meta == nil {
		log.Printf("Metadata not found for ID %s", req.SongId)
		return nil, status.Errorf(codes.NotFound, "Metadata not found for song ID: %s", req.SongId)
	}

	pbSegments := make([]*pb.Segment, len(meta.Segments))
	for i, seg := range meta.Segments {
		pbSegments[i] = &pb.Segment{
			StartByte:    seg.StartByte,
			Size:         seg.Size,
			DurationTs:   seg.DurationTs,
			StartTimeSec: seg.StartTimeSec,
		}
	}

	return &pb.StreamDataResponse{
		SongId:                meta.SongID,
		Duration:              meta.Duration,
		EncryptionStartOffset: meta.EncryptionStartOffset,
		SeektableVersion:      meta.SeektableVersion,
		Timescale:             meta.Timescale,
		MediaOffset:           meta.MediaOffset,
		InitRange: &pb.ByteRange{
			Start: meta.InitRange.Start,
			End:   meta.InitRange.End,
		},
		Segments: pbSegments,
		Waveform: meta.Waveform,
	}, nil
}

func validateUpdateRequest(req *pb.UpdateMetaRequest) error {
	if req == nil {
		return status.Error(codes.InvalidArgument, "request is nil")
	}
	if strings.TrimSpace(req.SongId) == "" {
		return status.Error(codes.InvalidArgument, "song_id is required")
	}
	if req.Duration < 0 {
		return status.Error(codes.InvalidArgument, "duration must be >= 0")
	}
	if req.Timescale <= 0 {
		return status.Error(codes.InvalidArgument, "timescale must be > 0")
	}
	if req.MediaOffset < 0 || req.EncryptionStartOffset < 0 {
		return status.Error(codes.InvalidArgument, "offsets must be >= 0")
	}
	if req.InitRange == nil {
		return status.Error(codes.InvalidArgument, "init_range is required")
	}
	if req.InitRange.Start < 0 || req.InitRange.End < req.InitRange.Start {
		return status.Error(codes.InvalidArgument, "init_range is invalid")
	}
	if len(req.Segments) == 0 {
		return status.Error(codes.InvalidArgument, "segments is required")
	}

	var lastStart int64 = -1
	var lastTime float64 = -1
	for i, seg := range req.Segments {
		if seg == nil {
			return status.Errorf(codes.InvalidArgument, "segments[%d] is nil", i)
		}
		if seg.StartByte < 0 || seg.Size <= 0 || seg.DurationTs <= 0 || seg.StartTimeSec < 0 {
			return status.Errorf(codes.InvalidArgument, "segments[%d] has invalid values", i)
		}
		if seg.StartByte <= lastStart {
			return status.Errorf(codes.InvalidArgument, "segments[%d] start_byte not increasing", i)
		}
		if seg.StartTimeSec < lastTime {
			return status.Errorf(codes.InvalidArgument, "segments[%d] start_time_sec not monotonic", i)
		}
		lastStart = seg.StartByte
		lastTime = seg.StartTimeSec
	}

	return nil
}
