FROM python:3.10-slim

# The published Essentia TensorFlow wheel is built against NumPy 1.x.
RUN pip install --no-cache-dir "numpy==1.26.4" \
 && pip install --no-cache-dir essentia-tensorflow==2.1b6.dev1110

WORKDIR /opt/mood-analyzer
RUN mkdir -p models \
 && python -c "import urllib.request; urllib.request.urlretrieve('https://essentia.upf.edu/models/music-style-classification/discogs-effnet/discogs-effnet-bs64-1.pb', 'models/discogs-effnet-bs64-1.pb')" \
 && python -c "import urllib.request; urllib.request.urlretrieve('https://essentia.upf.edu/models/classification-heads/mtg_jamendo_moodtheme/mtg_jamendo_moodtheme-discogs-effnet-1.pb', 'models/mtg_jamendo_moodtheme-discogs-effnet-1.pb')"

COPY analyze.py /opt/mood-analyzer/analyze.py
ENTRYPOINT ["python", "/opt/mood-analyzer/analyze.py"]
