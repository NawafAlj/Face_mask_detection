const video = document.getElementById("video");
const uploadedImg = document.getElementById("uploadedImage");
const startBtn = document.getElementById("startCamera");
const stopBtn = document.getElementById("stopCamera");
const uploadBtn = document.getElementById("uploadImage");
const detectBtn = document.getElementById("detectMask");
const fileInput = document.getElementById("fileInput");
const summaryList = document.getElementById("summaryList");

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let stream;
let detectionInterval;

//-----------------------------------------------------------
// ✅ Start live camera
//-----------------------------------------------------------
startBtn.addEventListener("click", async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    uploadedImg.style.display = "none";
    video.style.display = "block";

    summaryList.innerHTML = "<li>Camera started ✅</li>";

    // Capture every 2 seconds
    detectionInterval = setInterval(captureAndSendFrame, 2000);
  } catch (err) {
    summaryList.innerHTML = "<li>Error accessing camera ❌</li>";
    console.error(err);
  }
});

//-----------------------------------------------------------
// ✅ Stop camera
//-----------------------------------------------------------
stopBtn.addEventListener("click", () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    clearInterval(detectionInterval);
    summaryList.innerHTML = "<li>Camera stopped 📴</li>";
  }
});

//-----------------------------------------------------------
// ✅ Upload image and send immediately
//-----------------------------------------------------------
uploadBtn.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  video.style.display = "none";
  uploadedImg.style.display = "block";
  uploadedImg.src = url;

  summaryList.innerHTML = `<li>Image loaded: ${file.name}</li>`;

  // ✅ Send the original uploaded file to backend
  sendToBackend(file);
});

//-----------------------------------------------------------
// ✅ Manual detect button
//-----------------------------------------------------------
detectBtn.addEventListener("click", async () => {
  if (video.srcObject) {
    captureAndSendFrame();
  } else if (uploadedImg.src) {
    const response = await fetch(uploadedImg.src);
    const blob = await response.blob();
    const file = new File([blob], "uploaded.jpg", { type: "image/jpeg" });
    sendToBackend(file);
  } else {
    summaryList.innerHTML = "<li>No image or camera stream found ❌</li>";
  }
});

//-----------------------------------------------------------
// ✅ Capture one video frame
//-----------------------------------------------------------
async function captureAndSendFrame() {
  if (!video.videoWidth || !video.videoHeight) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg"));
  const file = new File([blob], "frame.jpg", { type: "image/jpeg" });
  sendToBackend(file);
}

//-----------------------------------------------------------
// ✅ Send image to FastAPI
//-----------------------------------------------------------
async function sendToBackend(file) {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("http://127.0.0.1:8000/detect/", {
      method: "POST",
      body: formData
    });

    const data = await response.json();
    console.log("Backend result:", data);
    drawDetections(data.detections);
    updateSummary(data.detections);
  } catch (error) {
    console.error("Error sending image:", error);
    summaryList.innerHTML = "<li>Error communicating with backend ❌</li>";
  }
}

//-----------------------------------------------------------
// ✅ Draw scaled bounding boxes
//-----------------------------------------------------------
function drawDetections(detections) {
  const displaySource = video.srcObject ? video : uploadedImg;
  if (!displaySource) return;

  const originalWidth = displaySource.videoWidth || displaySource.naturalWidth;
  const originalHeight = displaySource.videoHeight || displaySource.naturalHeight;
  const displayWidth = displaySource.clientWidth;
  const displayHeight = displaySource.clientHeight;

  canvas.width = displayWidth;
  canvas.height = displayHeight;

  ctx.drawImage(displaySource, 0, 0, displayWidth, displayHeight);
  ctx.lineWidth = 2;
  ctx.font = "16px Arial";

  const scaleX = displayWidth / originalWidth;
  const scaleY = displayHeight / originalHeight;

  detections.forEach(det => {
    const [x1, y1, x2, y2] = det.bbox;

    // ✅ Choose color based on label (robust matching)
    let color = "lime"; // default green
    const label = det.label.toLowerCase();

    if ((label.includes("no") && label.includes("mask")) || label.includes("without") || label.includes("off")) {
      color = "red"; // 🚫 No mask
    } else if (label.includes("incorrect") || label.includes("improper") || label.includes("partially")) {
      color = "orange"; // ⚠️ Incorrect
    } else if (label.includes("with") || label.includes("wearing")) {
      color = "lime"; // 😷 With mask
    }

    ctx.strokeStyle = color;

    const x = x1 * scaleX;
    const y = y1 * scaleY;
    const width = (x2 - x1) * scaleX;
    const height = (y2 - y1) * scaleY;

    ctx.strokeRect(x, y, width, height);

    // ✅ Label background for better visibility
    ctx.fillStyle = color;
    const text = `${det.label} (${(det.confidence * 100).toFixed(1)}%)`;
    const textWidth = ctx.measureText(text).width;
    const textHeight = 16;
    ctx.fillRect(x, y - textHeight, textWidth + 6, textHeight + 4);

    // ✅ Label text in black for contrast
    ctx.fillStyle = "black";
    ctx.fillText(text, x + 3, y - 5);
  });
}

//-----------------------------------------------------------
// ✅ Update detection summary
//-----------------------------------------------------------
function updateSummary(detections) {
  if (!detections || detections.length === 0) {
    summaryList.innerHTML = "<li>No mask violations detected 😷</li>";
  } else {
    summaryList.innerHTML = "";
    detections.forEach(det => {
      const item = document.createElement("li");
      item.textContent = `${det.label} — ${(det.confidence * 100).toFixed(1)}%`;
      summaryList.appendChild(item);
    });
  }
}
