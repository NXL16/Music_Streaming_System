package domain

type SongMetadata struct {
	SongID     string      `bson:"song_id"`
	Duration   float64     `bson:"duration"`
	SeekPoints []SeekPoint `bson:"seek_points"`
	Waveform   []float32   `bson:"waveform"`
}

type SeekPoint struct {
	Timestamp  float64 `bson:"timestamp"`
	ByteOffset int64   `bson:"byte_offset"`
}
