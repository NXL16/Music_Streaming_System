package repository

import (
	"Music_Streaming_System/apps/meta/internal/domain"
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MetadataRepository struct {
	collection *mongo.Collection
}

func NewMetadataRepository(db *mongo.Database) *MetadataRepository {
	repo := &MetadataRepository{
		collection: db.Collection("song_metadata"),
	}
	_ = repo.ensureIndexes(context.Background())
	return repo
}

func (r *MetadataRepository) Upsert(ctx context.Context, meta domain.SongMetadata) error {
	now := time.Now().UTC()
	if meta.Version <= 0 {
		meta.Version = now.UnixMilli()
	}
	if meta.CreatedAt.IsZero() {
		meta.CreatedAt = now
	}
	meta.UpdatedAt = now

	filter := bson.M{
		"song_id": meta.SongID,
		"$or": []bson.M{
			{"version": bson.M{"$lt": meta.Version}},
			{"version": bson.M{"$exists": false}},
		},
	}

	update := bson.M{
		"$set": bson.M{
			"song_id":                 meta.SongID,
			"duration":                meta.Duration,
			"encryption_start_offset": meta.EncryptionStartOffset,
			"seektable_version":       meta.SeektableVersion,
			"timescale":               meta.Timescale,
			"media_offset":            meta.MediaOffset,
			"init_range":              meta.InitRange,
			"segments":                meta.Segments,
			"waveform":                meta.Waveform,
			"version":                 meta.Version,
			"updated_at":              meta.UpdatedAt,
		},
		"$setOnInsert": bson.M{"created_at": meta.CreatedAt},
	}
	result, err := r.collection.UpdateOne(ctx, filter, update, options.Update().SetUpsert(true))
	if err != nil {
		return err
	}

	if result.MatchedCount == 0 && result.UpsertedCount == 0 {
		// stale update (older or same version) -> idempotent no-op
		return nil
	}

	return err
}

func (r *MetadataRepository) GetBySongID(ctx context.Context, songID string) (*domain.SongMetadata, error) {
	var meta domain.SongMetadata
	err := r.collection.FindOne(ctx, bson.M{"song_id": songID}).Decode(&meta)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}
	return &meta, nil
}

func (r *MetadataRepository) ensureIndexes(ctx context.Context) error {
	model := mongo.IndexModel{
		Keys:    bson.D{{Key: "song_id", Value: 1}},
		Options: options.Index().SetUnique(true).SetName("uniq_song_id"),
	}
	_, err := r.collection.Indexes().CreateOne(ctx, model)
	return err
}
