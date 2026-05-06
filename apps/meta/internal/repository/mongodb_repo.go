package repository

import (
	"Music_Streaming_System/apps/meta/internal/domain"
	"context"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MetadataRepository struct {
	collection *mongo.Collection
}

func NewMetadataRepository(db *mongo.Database) *MetadataRepository {
	return &MetadataRepository{
		collection: db.Collection("song_metadata"),
	}
}

func (r *MetadataRepository) Upsert(ctx context.Context, meta domain.SongMetadata) error {
	filter := bson.M{"song_id": meta.SongID}
	update := bson.M{"$set": meta}
	_, err := r.collection.UpdateOne(ctx, filter, update, options.Update().SetUpsert(true))
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
