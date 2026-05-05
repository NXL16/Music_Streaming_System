package service

import (
	"context"
	"crypto/rand"
	"time"

	"Music_Streaming_System/apps/kms/internal/repository"
	"Music_Streaming_System/packages/shared-proto/kms"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	KeySize = 32
	IVSize  = 16
)

type KMSService struct {
	kms.UnimplementedKeyManagementServiceServer
	repo *repository.KeyRepository
}

func NewKMSService(repo *repository.KeyRepository) *KMSService {
	return &KMSService{repo: repo}
}

func (s *KMSService) GenerateSongKey(ctx context.Context, req *kms.GenerateKeyRequest) (*kms.KeyResponse, error) {
	sid := req.GetSongId()

	if sid == "" {
		return nil, status.Error(codes.InvalidArgument, "SongId is required")
	}

	// Idempotency check
	if exist, _ := s.repo.GetKey(ctx, sid); exist != nil {
		return nil, status.Errorf(codes.AlreadyExists, "Key for %s exists", sid)
	}

	combined := make([]byte, KeySize+IVSize)

	if _, err := rand.Read(combined); err != nil {
		return nil, status.Errorf(codes.Internal, "Entropy error: %v", err)
	}

	if err := s.repo.SaveKey(ctx, sid, combined); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &kms.KeyResponse{
		SongId:        sid,
		EncryptionKey: combined[:KeySize],
		Iv:            combined[KeySize:],
		CreatedAt:     time.Now().Unix(),
	}, nil
}

func (s *KMSService) GetSongKey(ctx context.Context, req *kms.GetKeyRequest) (*kms.KeyResponse, error) {
	data, err := s.repo.GetKey(ctx, req.GetSongId())
	if err != nil || data == nil {
		return nil, status.Error(codes.NotFound, "Key not found")
	}

	if len(data) < KeySize+IVSize {
		return nil, status.Error(codes.DataLoss, "Corrupted key data")
	}

	return &kms.KeyResponse{
		SongId:        req.GetSongId(),
		EncryptionKey: data[:KeySize],
		Iv:            data[KeySize:],
	}, nil
}
