from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from ultralytics import YOLO
import numpy as np
import cv2
import psutil
import time
import csv
import os
from datetime import datetime, timedelta

# ---------------------------------------------------------
# ✅ Initialize FastAPI app
# ---------------------------------------------------------
app = FastAPI(title="ICU Smart Mask Detection API")

# ---------------------------------------------------------
# ✅ Allow requests from frontend (e.g., localhost or cloud)
# ---------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, replace "*" with your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# ✅ Load YOLO model once at startup
# ---------------------------------------------------------
MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "final_face_mask_best_sgd_v7.pt")
model = YOLO(MODEL_PATH)
print(f"✅ Model loaded successfully from: {MODEL_PATH}")

# ---------------------------------------------------------
# ✅ Initialize system tracking
# ---------------------------------------------------------
start_time = time.time()
detection_log = []  # store history of detections
mute_state = {"active": False, "until": None}

# ---------------------------------------------------------
# ✅ Mask detection endpoint
# ---------------------------------------------------------
@app.post("/detect/")
async def detect_mask(file: UploadFile = File(...)):
    """
    Receives an image, runs YOLO inference, and returns bounding boxes and labels.
    """
    try:
        image_bytes = await file.read()
        np_arr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if image is None:
            return JSONResponse({"error": "Invalid image data"}, status_code=400)

        # Convert BGR → RGB for YOLO
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = model(image)

        detections = []
        for r in results[0].boxes:
            box = r.xyxy[0].tolist()
            cls = int(r.cls)
            conf = float(r.conf)
            label = model.names[cls]
            detections.append({
                "label": label,
                "confidence": round(conf, 2),
                "bbox": [round(x, 2) for x in box]
            })

        # Log detections
        for d in detections:
            detection_log.append({
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "label": d["label"],
                "confidence": d["confidence"]
            })

        return JSONResponse({"detections": detections})

    except Exception as e:
        print("❌ Detection error:", e)
        return JSONResponse({"error": "Detection failed"}, status_code=500)

# ---------------------------------------------------------
# ✅ System status endpoint
# ---------------------------------------------------------
@app.get("/status")
def get_status():
    uptime = round(time.time() - start_time)
    cpu = psutil.cpu_percent(interval=0.2)
    ram = psutil.virtual_memory().percent
    model_name = os.path.basename(MODEL_PATH)
    return {
        "uptime": uptime,
        "cpu": cpu,
        "ram": ram,
        "model": model_name,
        "detections_logged": len(detection_log)
    }

# ---------------------------------------------------------
# ✅ Detection summary (for frontend stats)
# ---------------------------------------------------------
@app.get("/summary")
def get_summary():
    summary = {"with_mask": 0, "no_mask": 0, "incorrect": 0}
    for d in detection_log:
        label = d["label"].lower()
        if "no" in label or "without" in label:
            summary["no_mask"] += 1
        elif "incorrect" in label or "improper" in label:
            summary["incorrect"] += 1
        elif "mask" in label or "with" in label:
            summary["with_mask"] += 1
    return summary

# ---------------------------------------------------------
# ✅ Detection log list (for UI history)
# ---------------------------------------------------------
@app.get("/detections/log")
def get_log():
    return {"count": len(detection_log), "logs": detection_log[-20:]}  # last 20 entries

# ---------------------------------------------------------
# ✅ Export detections to CSV
# ---------------------------------------------------------
@app.get("/export")
def export_log():
    if not detection_log:
        return JSONResponse({"error": "No detections logged yet"}, status_code=400)

    csv_path = "detection_log.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=detection_log[0].keys())
        writer.writeheader()
        writer.writerows(detection_log)

    return FileResponse(csv_path, filename="detection_log.csv")

# ---------------------------------------------------------
# ✅ Mute / Alert Control (Manual Override)
# ---------------------------------------------------------
@app.post("/mute/")
def mute_alert():
    mute_state["active"] = True
    mute_state["until"] = datetime.now() + timedelta(minutes=5)
    print(f"🔕 Alerts muted until {mute_state['until'].strftime('%H:%M:%S')}")
    return {
        "message": "Alerts muted for 5 minutes",
        "until": mute_state["until"].isoformat()
    }

@app.get("/mute/status")
def get_mute_status():
    if mute_state["active"] and datetime.now() > mute_state["until"]:
        mute_state["active"] = False
        mute_state["until"] = None
        print("🔔 Alerts automatically re-enabled.")
    return mute_state

# ---------------------------------------------------------
# ✅ Serve Frontend (HTML, CSS, JS)
# ---------------------------------------------------------
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# ✅ Define absolute paths for Render & local compatibility
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# ✅ Mount static directory for CSS, JS, images, etc.
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# ✅ Serve main dashboard HTML
@app.get("/")
async def serve_dashboard():
    html_path = os.path.join(STATIC_DIR, "dashboard.html")
    return FileResponse(html_path)
