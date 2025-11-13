# ==========================================
# 🐳 Dockerfile — FastAPI + YOLO (FaceGourd)
# ==========================================

# ---- 1. Base Python image (lightweight Linux + Python) ----
FROM python:3.12.9

# ---- 2. Create working directory inside container ----
WORKDIR /app

# ---- 3. Copy ONLY requirements first (faster caching) ----
COPY requirements.txt .

# ---- 4. Install system dependencies + Python packages ----
# libgl1 & libglib2.0-0 are required for OpenCV & Ultralytics
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && \
    pip install --no-cache-dir -r requirements.txt && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# ---- 5. Copy the backend code into the container ----
COPY . .

# ---- 6. Expose FastAPI port for Cloud Run ----
EXPOSE 8080

# ---- 7. Start FastAPI with Uvicorn ----
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
