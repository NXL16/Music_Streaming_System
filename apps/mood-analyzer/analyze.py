#!/usr/bin/env python3
import json
import sys
from pathlib import Path

import numpy as np

from essentia.standard import MonoLoader, TensorflowPredict2D, TensorflowPredictEffnetDiscogs

MODEL_DIR = Path('/opt/mood-analyzer/models')
LABELS = [
    'action', 'adventure', 'advertising', 'background', 'ballad', 'calm', 'children', 'christmas', 'commercial', 'cool', 'corporate', 'dark', 'deep', 'documentary', 'drama', 'dramatic', 'dream', 'emotional', 'energetic', 'epic', 'fast', 'film', 'fun', 'funny', 'game', 'groovy', 'happy', 'heavy', 'holiday', 'hopeful', 'inspiring', 'love', 'meditative', 'melancholic', 'melodic', 'motivational', 'movie', 'nature', 'party', 'positive', 'powerful', 'relaxing', 'retro', 'romantic', 'sad', 'sexy', 'slow', 'soft', 'soundscape', 'space', 'sport', 'summer', 'trailer', 'travel', 'upbeat', 'uplifting'
]

def highest(scores, *names):
    return max((scores.get(name, 0.0) for name in names), default=0.0)

def main():
    if len(sys.argv) != 2:
        raise SystemExit('expected one audio path')
    audio = MonoLoader(filename=sys.argv[1], sampleRate=16000, resampleQuality=4)()
    embeddings = TensorflowPredictEffnetDiscogs(
        graphFilename=str(MODEL_DIR / 'discogs-effnet-bs64-1.pb'), output='PartitionedCall:1'
    )(audio)
    values = TensorflowPredict2D(
        graphFilename=str(MODEL_DIR / 'mtg_jamendo_moodtheme-discogs-effnet-1.pb'),
        input='model/Placeholder', output='model/Sigmoid'
    )(embeddings)
    # The classifier returns one 56-label vector per audio frame. Aggregate the
    # complete track before mapping it to one catalog-level mood result.
    aggregate = np.asarray(values, dtype=float).mean(axis=0)
    raw = {label: float(aggregate[index]) for index, label in enumerate(LABELS)}
    scores = {
        'focus': highest(raw, 'motivational', 'inspiring', 'background'),
        'feeling-blue': highest(raw, 'sad', 'melancholic'),
        'energy': highest(raw, 'energetic', 'party', 'upbeat', 'fast'),
        'heartbreak': min(raw['sad'], raw['emotional']),
        'relax': highest(raw, 'relaxing', 'calm', 'meditative', 'soft'),
        'feel-good': highest(raw, 'happy', 'positive', 'uplifting', 'fun'),
        'love': highest(raw, 'love', 'romantic'),
    }
    # Multi-label music models distribute probability across several themes;
    # 0.45 was too strict and left normal catalog tracks unlabelled. Keep only
    # confident candidates, with a conservative single-label fallback so each
    # successfully analysed track contributes to the mood catalog.
    mood_tags = [tag for tag, score in scores.items() if score >= 0.20]
    if not mood_tags:
        best_tag, best_score = max(scores.items(), key=lambda item: item[1])
        if best_score >= 0.08:
            mood_tags = [best_tag]
    print(json.dumps({'version': 'essentia-mtg-jamendo-moodtheme-1', 'moodTags': mood_tags, 'scores': scores}))

if __name__ == '__main__':
    main()
