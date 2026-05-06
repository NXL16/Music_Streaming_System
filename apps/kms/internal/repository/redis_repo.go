package repository

import (
	"context"
	"encoding/binary"
	"time"

	"github.com/redis/go-redis/v9"
)

const keyRecordHeaderSize = 8

type KeyRecord struct {
	CreatedAt int64
	Data      []byte
}

type KeyRepository struct {
	client *redis.Client
}

func NewKeyRepository(addr, password string) *KeyRepository {
	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,

		PoolSize:     60,
		MinIdleConns: 6,
		ReadTimeout:  200 * time.Millisecond,
		WriteTimeout: 200 * time.Millisecond,
		PoolTimeout:  500 * time.Millisecond,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		panic("Redis connection failed: " + err.Error())
	}

	return &KeyRepository{client: rdb}
}

func (r *KeyRepository) SaveKey(ctx context.Context, id string, createdAt int64, data []byte) (bool, error) {
	encoded := make([]byte, keyRecordHeaderSize+len(data))
	binary.BigEndian.PutUint64(encoded[:keyRecordHeaderSize], uint64(createdAt))
	copy(encoded[keyRecordHeaderSize:], data)

	return r.client.SetNX(ctx, "kms:"+id, encoded, 0).Result()
}

func (r *KeyRepository) GetKey(ctx context.Context, id string) (*KeyRecord, error) {
	val, err := r.client.Get(ctx, "kms:"+id).Bytes()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, err
	}
	if len(val) < keyRecordHeaderSize {
		return nil, nil
	}

	createdAt := int64(binary.BigEndian.Uint64(val[:keyRecordHeaderSize]))
	data := make([]byte, len(val[keyRecordHeaderSize:]))
	copy(data, val[keyRecordHeaderSize:])

	return &KeyRecord{CreatedAt: createdAt, Data: data}, nil
}

func (r *KeyRepository) Close() error {
	return r.client.Close()
}
