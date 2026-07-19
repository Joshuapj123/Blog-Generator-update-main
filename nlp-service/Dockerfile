# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Build deps for spaCy C extensions
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install CPU-only PyTorch FIRST — prevents sentence-transformers from pulling
# the full CUDA build (~2.5 GB of NVIDIA libraries we don't need on Railway)
RUN pip install --no-cache-dir \
    torch==2.2.2 --index-url https://download.pytorch.org/whl/cpu

# Install all other requirements (torch already satisfied → no CUDA re-download)
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model and NLTK data at build time
RUN python -m spacy download en_core_web_sm \
    && python -m nltk.downloader -q stopwords wordnet averaged_perceptron_tagger punkt punkt_tab

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Copy only installed packages — no gcc or build tools in final image
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /root/nltk_data /root/nltk_data

# Copy application code
COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
