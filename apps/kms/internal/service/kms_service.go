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

	combined := make([]byte, KeySize+IVSize)

	if _, err := rand.Read(combined); err != nil {
		return nil, status.Errorf(codes.Internal, "Entropy error: %v", err)
	}

	createdAt := time.Now().Unix()
	stored, err := s.repo.SaveKey(ctx, sid, createdAt, combined)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "Redis write failed: %v", err)
	}

	// If key already exists, retrieve and return the existing key (idempotent)
	if !stored {
		record, err := s.repo.GetKey(ctx, sid)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "Redis read failed: %v", err)
		}
		if record == nil {
			return nil, status.Error(codes.Internal, "Failed to retrieve existing key")
		}
		if len(record.Data) < KeySize+IVSize {
			return nil, status.Error(codes.DataLoss, "Corrupted key data")
		}
		return &kms.KeyResponse{
			SongId:        sid,
			EncryptionKey: record.Data[:KeySize],
			Iv:            record.Data[KeySize:],
			CreatedAt:     record.CreatedAt,
		}, nil
	}

	return &kms.KeyResponse{
		SongId:        sid,
		EncryptionKey: combined[:KeySize],
		Iv:            combined[KeySize:],
		CreatedAt:     createdAt,
	}, nil
}

func (s *KMSService) GetSongKey(ctx context.Context, req *kms.GetKeyRequest) (*kms.KeyResponse, error) {
	record, err := s.repo.GetKey(ctx, req.GetSongId())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "Redis read failed: %v", err)
	}
	if record == nil {
		return nil, status.Error(codes.NotFound, "Key not found")
	}

	if len(record.Data) < KeySize+IVSize {
		return nil, status.Error(codes.DataLoss, "Corrupted key data")
	}

	return &kms.KeyResponse{
		SongId:        req.GetSongId(),
		EncryptionKey: record.Data[:KeySize],
		Iv:            record.Data[KeySize:],
		CreatedAt:     record.CreatedAt,
	}, nil
}
