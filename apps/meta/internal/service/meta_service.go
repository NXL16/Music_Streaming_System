package service

import (
	"context"
	"log"

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

	// Chuyển đổi từ Protobuf SeekPoint sang Domain SeekPoint
	domainSeekPoints := make([]domain.SeekPoint, len(req.SeekPoints))
	for i, sp := range req.SeekPoints {
		domainSeekPoints[i] = domain.SeekPoint{
			Timestamp:  sp.Timestamp,
			ByteOffset: sp.ByteOffset,
		}
	}

	// Tạo struct domain để lưu vào DB
	meta := domain.SongMetadata{
		SongID:     req.SongId,
		Duration:   req.Duration,
		SeekPoints: domainSeekPoints,
		Waveform:   req.Waveform,
	}

	// Gọi repository để lưu (Upsert - nếu có rồi thì cập nhật, chưa có thì tạo mới)
	err := s.repo.Upsert(ctx, meta)
	if err != nil {
		log.Printf("Error upserting metadata: %v", err)
		return nil, status.Errorf(codes.Internal, "Failed to upsert metadata: %v", err)
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
		return nil, status.Errorf(codes.Internal, "Failed to retrieve metadata: %v", err)
	}
	if meta == nil {
		log.Printf("Metadata not found for ID %s", req.SongId)
		return nil, status.Errorf(codes.NotFound, "Metadata not found for song ID: %s", req.SongId)
	}

	// Chuyển đổi ngược lại từ Domain sang Protobuf để trả về qua gRPC
	pbSeekPoints := make([]*pb.SeekPoint, len(meta.SeekPoints))
	for i, sp := range meta.SeekPoints {
		pbSeekPoints[i] = &pb.SeekPoint{
			Timestamp:  sp.Timestamp,
			ByteOffset: sp.ByteOffset,
		}
	}

	return &pb.StreamDataResponse{
		SongId:     meta.SongID,
		Duration:   meta.Duration,
		SeekPoints: pbSeekPoints,
		Waveform:   meta.Waveform,
	}, nil
}
