package repository

import (
	"Music_Streaming_System/apps/meta/internal/domain"
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MetadataRepository struct {
	collection *mongo.Collection
}

func NewMetadataRepository(ctx context.Context, db *mongo.Database) (*MetadataRepository, error) {
	repo := &MetadataRepository{
		collection: db.Collection("song_metadata"),
	}
	if err := repo.ensureIndexes(ctx); err != nil {
		return nil, err
	}
	return repo, nil
}

func (r *MetadataRepository) Upsert(ctx context.Context, meta domain.SongMetadata) error {
	now := time.Now().UTC()
	if meta.Version <= 0 {
		return fmt.Errorf("metadata version must be > 0")
	}
	if meta.CreatedAt.IsZero() {
		meta.CreatedAt = now
	}
	meta.UpdatedAt = now

	filter := bson.M{
		"song_id": meta.SongID,
		"variant": meta.Variant,
		"$or": []bson.M{
			{"version": bson.M{"$lt": meta.Version}},
			{"version": bson.M{"$exists": false}},
		},
	}

	update := bson.M{
		"$set": bson.M{
			"song_id":                 meta.SongID,
			"variant":                 meta.Variant,
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
		// The conditional filter intentionally does not match an equal/newer
		// document. With upsert enabled Mongo then attempts an insert and the
		// unique (song_id, variant) index returns duplicate-key. That is the
		// expected idempotent/stale path, not a storage failure.
		if mongo.IsDuplicateKeyError(err) {
			var current struct {
				Version int64 `bson:"version"`
			}
			lookupErr := r.collection.FindOne(ctx, bson.M{
				"song_id": meta.SongID,
				"variant": meta.Variant,
			}).Decode(&current)
			if lookupErr == nil && current.Version >= meta.Version {
				return nil
			}
			if lookupErr != nil {
				return fmt.Errorf("read metadata after duplicate-key upsert: %w", lookupErr)
			}
		}
		return err
	}

	if result.MatchedCount == 0 && result.UpsertedCount == 0 {
		// stale update (older or same version) -> idempotent no-op
		return nil
	}

	return err
}

func (r *MetadataRepository) GetBySongID(ctx context.Context, songID string, variant string) (*domain.SongMetadata, error) {
	var meta domain.SongMetadata
	filter := bson.M{"song_id": songID}
	if variant == "" {
		// Metadata written before stem separation has no `variant` field. Treat
		// it as the legacy mixed stream so existing songs keep playing without
		// requiring a data migration.
		filter["$or"] = bson.A{
			bson.M{"variant": ""},
			bson.M{"variant": bson.M{"$exists": false}},
		}
	} else {
		filter["variant"] = variant
	}
	err := r.collection.FindOne(ctx, filter).Decode(&meta)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}
	return &meta, nil
}

func (r *MetadataRepository) ensureIndexes(ctx context.Context) error {
	// Existing deployments used a unique index on song_id. Its name was not
	// guaranteed, so find it by definition rather than assuming one name.
	cursor, err := r.collection.Indexes().List(ctx)
	if err != nil {
		return fmt.Errorf("list metadata indexes: %w", err)
	}
	legacyIndexNames := make([]string, 0, 1)
	for cursor.Next(ctx) {
		var index bson.M
		if err := cursor.Decode(&index); err != nil {
			return fmt.Errorf("decode metadata index: %w", err)
		}

		keys, ok := index["key"].(bson.M)
		if !ok || len(keys) != 1 || keys["song_id"] == nil || index["unique"] != true {
			continue
		}
		name, ok := index["name"].(string)
		if !ok || name == "" {
			return fmt.Errorf("legacy song_id index has no name")
		}
		legacyIndexNames = append(legacyIndexNames, name)
	}
	if err := cursor.Err(); err != nil {
		return fmt.Errorf("iterate metadata indexes: %w", err)
	}
	if err := cursor.Close(ctx); err != nil {
		return fmt.Errorf("close metadata index cursor: %w", err)
	}

	for _, name := range legacyIndexNames {
		if _, err := r.collection.Indexes().DropOne(ctx, name); err != nil && !isIndexNotFound(err) {
			// A concurrent pod can have already dropped the legacy index after
			// this pod listed it. That is the desired end state, not a failed boot.
			return fmt.Errorf("drop legacy song_id index %q: %w", name, err)
		}
	}

	model := mongo.IndexModel{
		Keys:    bson.D{{Key: "song_id", Value: 1}, {Key: "variant", Value: 1}},
		Options: options.Index().SetUnique(true).SetName("uniq_song_variant"),
	}
	_, err = r.collection.Indexes().CreateOne(ctx, model)
	if err != nil {
		return fmt.Errorf("create unique song_id/variant index (resolve duplicate metadata first): %w", err)
	}
	return nil
}

func isIndexNotFound(err error) bool {
	var commandError mongo.CommandError
	return errors.As(err, &commandError) && commandError.Code == 27
}
