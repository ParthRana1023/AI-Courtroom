# Use an official Python runtime as a parent image
FROM python:3.13-slim

# Run as an unprivileged user, not root.
RUN useradd --create-home --uid 1000 app

# Set the working directory in the container
WORKDIR /app

# The embedding model is downloaded at build time into a folder the app user owns.
ENV HF_HOME=/app/.cache/huggingface \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# CPU-only PyTorch first, so sentence-transformers doesn't pull the ~2 GB CUDA build.
RUN pip install --no-cache-dir torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

COPY . /app/
RUN chown -R app:app /app
USER app

# Expose the port FastAPI runs on
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
