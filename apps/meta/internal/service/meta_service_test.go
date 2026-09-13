package service

import (
	"math"
	"testing"

	pb "Music_Streaming_System/packages/shared-proto/metadata"
)

func TestValidateUpdateRequest(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*pb.UpdateMetaRequest)
		valid  bool
	}{
		{
			name:  "accepts valid mixed metadata",
			valid: true,
		},
		{
			name: "accepts high-quality variants",
			mutate: func(request *pb.UpdateMetaRequest) {
				request.Variant = "instrumental-high"
			},
			valid: true,
		},
		{
			name: "rejects an unknown variant",
			mutate: func(request *pb.UpdateMetaRequest) {
				request.Variant = "surround"
			},
		},
		{
			name: "rejects non finite duration",
			mutate: func(request *pb.UpdateMetaRequest) {
				request.Duration = math.NaN()
			},
		},
		{
			name: "rejects missing authoritative metadata version",
			mutate: func(request *pb.UpdateMetaRequest) {
				request.MetadataVersion = 0
			},
		},
		{
			name: "rejects overlapping byte ranges",
			mutate: func(request *pb.UpdateMetaRequest) {
				request.Segments[1].StartByte = 50
			},
		},
		{
			name: "rejects repeated start time",
			mutate: func(request *pb.UpdateMetaRequest) {
				request.Segments[1].StartTimeSec = request.Segments[0].StartTimeSec
			},
		},
		{
			name: "rejects non finite waveform samples",
			mutate: func(request *pb.UpdateMetaRequest) {
				request.Waveform = []float32{float32(math.Inf(1))}
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := validUpdateRequest()
			if test.mutate != nil {
				test.mutate(request)
			}

			err := validateUpdateRequest(request)
			if test.valid && err != nil {
				t.Fatalf("validateUpdateRequest() error = %v", err)
			}
			if !test.valid && err == nil {
				t.Fatal("validateUpdateRequest() error = nil, want validation error")
			}
		})
	}
}

func validUpdateRequest() *pb.UpdateMetaRequest {
	return &pb.UpdateMetaRequest{
		SongId:                "song-1",
		Duration:              10,
		EncryptionStartOffset: 0,
		SeektableVersion:      1,
		MetadataVersion:       7,
		Timescale:             48_000,
		MediaOffset:           0,
		InitRange:             &pb.ByteRange{Start: 0, End: 99},
		Segments: []*pb.Segment{
			{StartByte: 100, Size: 100, DurationTs: 48_000, StartTimeSec: 0},
			{StartByte: 200, Size: 100, DurationTs: 48_000, StartTimeSec: 1},
		},
		Waveform: []float32{0, 0.5, 1},
	}
}
