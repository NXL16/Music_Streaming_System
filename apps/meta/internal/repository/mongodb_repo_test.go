package repository

import (
	"errors"
	"testing"

	"go.mongodb.org/mongo-driver/mongo"
)

func TestIsIndexNotFound(t *testing.T) {
	if !isIndexNotFound(mongo.CommandError{Code: 27}) {
		t.Fatal("expected Mongo IndexNotFound command error to be tolerated")
	}
	if isIndexNotFound(errors.New("other failure")) {
		t.Fatal("unexpectedly treated an unrelated error as IndexNotFound")
	}
}
