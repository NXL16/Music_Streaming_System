package service

import (
	"context"
	"log"
	"math"
	"strings"

	"Music_Streaming_System/apps/meta/internal/domain"
	"Music_Streaming_System/apps/meta/internal/repository"
	pb "Music_Streaming_System/packages/shared-proto/metadata"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	maxMetadataSegments = 100_000
	maxWaveformSamples  = 100_000
)

type MetadataServer struct {
	pb.UnimplementedMetadataServiceServer
	repo *repository.MetadataRepository
}

func NewMetadataServer(repo *repository.MetadataRepository) *MetadataServer {
	return &MetadataServer{repo: repo}
}

func (s *MetadataServer) UpdateTechnicalMeta(ctx context.Context, req *pb.UpdateMetaRequest) (*pb.EmptyResponse, error) {
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
		Variant:               req.Variant,
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
		Version:  req.MetadataVersion,
	}

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

func (s *MetadataServer) GetStreamData(ctx context.Context, req *pb.GetStreamDataRequest) (*pb.StreamDataResponse, error) {
	meta, err := s.repo.GetBySongID(ctx, req.SongId, req.Variant)
	if err != nil {
		log.Printf("Error retrieving metadata for ID %s: %v", req.SongId, err)
		if ctx.Err() != nil {
			return nil, status.Errorf(codes.DeadlineExceeded, "metadata lookup deadline exceeded")
		}
		return nil, status.Errorf(codes.Unavailable, "metadata storage unavailable")
	}
	if meta == nil {
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
		Variant:               meta.Variant,
		Duration:              meta.Duration,
		EncryptionStartOffset: meta.EncryptionStartOffset,
		SeektableVersion:      meta.SeektableVersion,
		Timescale:             meta.Timescale,
		MediaOffset:           meta.MediaOffset,
		InitRange: &pb.ByteRange{
			Start: meta.InitRange.Start,
			End:   meta.InitRange.End,
		},
		Segments:        pbSegments,
		Waveform:        meta.Waveform,
		MetadataVersion: meta.Version,
	}, nil
}

func validateUpdateRequest(req *pb.UpdateMetaRequest) error {
	if req == nil {
		return status.Error(codes.InvalidArgument, "request is nil")
	}
	if strings.TrimSpace(req.SongId) == "" {
		return status.Error(codes.InvalidArgument, "song_id is required")
	}
	if !isFinite(req.Duration) || req.Duration <= 0 {
		return status.Error(codes.InvalidArgument, "duration must be finite and > 0")
	}
	if req.Timescale <= 0 {
		return status.Error(codes.InvalidArgument, "timescale must be > 0")
	}
	if req.SeektableVersion < 0 {
		return status.Error(codes.InvalidArgument, "seektable_version must be >= 0")
	}
	if req.MetadataVersion <= 0 {
		return status.Error(codes.InvalidArgument, "metadata_version must be > 0")
	}
	if req.MediaOffset < 0 || req.EncryptionStartOffset < 0 {
		return status.Error(codes.InvalidArgument, "offsets must be >= 0")
	}
	if !isKnownVariant(req.Variant) {
		return status.Error(codes.InvalidArgument, "variant is invalid")
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
	if len(req.Segments) > maxMetadataSegments {
		return status.Errorf(codes.InvalidArgument, "segments exceeds maximum of %d", maxMetadataSegments)
	}
	if len(req.Waveform) > maxWaveformSamples {
		return status.Errorf(codes.InvalidArgument, "waveform exceeds maximum of %d", maxWaveformSamples)
	}

	var lastStart int64 = -1
	var lastEnd int64 = -1
	var lastTime float64 = -1
	for i, seg := range req.Segments {
		if seg == nil {
			return status.Errorf(codes.InvalidArgument, "segments[%d] is nil", i)
		}
		if seg.StartByte < 0 || seg.Size <= 0 || seg.DurationTs <= 0 || seg.StartTimeSec < 0 || !isFinite(seg.StartTimeSec) {
			return status.Errorf(codes.InvalidArgument, "segments[%d] has invalid values", i)
		}
		if seg.StartByte <= lastStart {
			return status.Errorf(codes.InvalidArgument, "segments[%d] start_byte not increasing", i)
		}
		endByte := seg.StartByte + seg.Size
		if endByte <= seg.StartByte {
			return status.Errorf(codes.InvalidArgument, "segments[%d] byte range overflows", i)
		}
		if seg.StartByte < lastEnd {
			return status.Errorf(codes.InvalidArgument, "segments[%d] overlaps the previous segment", i)
		}
		if seg.StartTimeSec <= lastTime {
			return status.Errorf(codes.InvalidArgument, "segments[%d] start_time_sec not strictly increasing", i)
		}
		lastStart = seg.StartByte
		lastEnd = endByte
		lastTime = seg.StartTimeSec
	}

	for i, point := range req.Waveform {
		if !isFinite(float64(point)) {
			return status.Errorf(codes.InvalidArgument, "waveform[%d] must be finite", i)
		}
	}

	return nil
}

func isKnownVariant(variant string) bool {
	switch variant {
	case "", "high", "instrumental", "vocal", "instrumental-high", "vocal-high":
		return true
	default:
		return false
	}
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
