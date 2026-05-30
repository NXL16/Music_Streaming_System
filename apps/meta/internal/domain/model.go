package domain

import "time"

type SongMetadata struct {
	SongID                string    `bson:"song_id"`
	Duration              float64   `bson:"duration"`
	EncryptionStartOffset int64     `bson:"encryption_start_offset"`
	SeektableVersion      int32     `bson:"seektable_version"`
	Timescale             int32     `bson:"timescale"`
	MediaOffset           int64     `bson:"media_offset"`
	InitRange             ByteRange `bson:"init_range"`
	Segments              []Segment `bson:"segments"`
	Waveform              []float32 `bson:"waveform"`
	Version               int64     `bson:"version"`
	CreatedAt             time.Time `bson:"created_at"`
	UpdatedAt             time.Time `bson:"updated_at"`
}

type ByteRange struct {
	Start int64 `bson:"start"`
	End   int64 `bson:"end"`
}

type Segment struct {
	StartByte    int64   `bson:"start_byte"`
	Size         int64   `bson:"size"`
	DurationTs   int64   `bson:"duration_ts"`
	StartTimeSec float64 `bson:"start_time_sec"`
}
