package repository

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

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

func (r *KeyRepository) SaveKey(ctx context.Context, id string, data []byte) error {
	return r.client.Set(ctx, "kms:"+id, data, 0).Err()
}

func (r *KeyRepository) GetKey(ctx context.Context, id string) ([]byte, error) {
	val, err := r.client.Get(ctx, "kms:"+id).Bytes()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, err
	}
	return val, nil
}

func (r *KeyRepository) Close() error {
	return r.client.Close()
}
