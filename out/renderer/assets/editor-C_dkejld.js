const canvas = document.getElementById("editor-canvas");
const ctx = canvas.getContext("2d");
const toolbar = document.getElementById("toolbar");
const undoButton = document.getElementById("undo-button");
const finishButton = document.getElementById("finish-button");
const ocrButton = document.getElementById("ocr-button");
const uploadButton = document.getElementById("upload-button");
document.getElementById("color-display");
let backgroundImage = null;
const strokes = [];
function resizeCanvasToImage() {
  if (!backgroundImage) return;
  const maxWidth = window.innerWidth - 40;
  const maxHeight = window.innerHeight - 80;
  let width = backgroundImage.width;
  let height = backgroundImage.height;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  width *= scale;
  height *= scale;
  canvas.width = width;
  canvas.height = height;
}
function redraw() {
  if (!backgroundImage) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#f97316";
  ctx.fillStyle = "#f97316";
  for (const stroke of strokes) {
    if (stroke.type === "pen") {
      ctx.beginPath();
      stroke.points.forEach((p, index) => {
        if (index === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      });
      ctx.stroke();
    } else if (stroke.type === "rect") {
      ctx.strokeRect(stroke.x, stroke.y, stroke.w, stroke.h);
    } else if (stroke.type === "arrow") {
      const headLength = 10;
      const dx = stroke.x2 - stroke.x1;
      const dy = stroke.y2 - stroke.y1;
      const angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(stroke.x1, stroke.y1);
      ctx.lineTo(stroke.x2, stroke.y2);
      ctx.moveTo(
        stroke.x2 - headLength * Math.cos(angle - Math.PI / 6),
        stroke.y2 - headLength * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(stroke.x2, stroke.y2);
      ctx.lineTo(
        stroke.x2 - headLength * Math.cos(angle + Math.PI / 6),
        stroke.y2 - headLength * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    } else if (stroke.type === "text") {
      ctx.fillText(stroke.text, stroke.x, stroke.y);
    }
  }
}
toolbar.addEventListener("click", (event) => {
  const target = event.target;
  const value = target.getAttribute("data-tool");
  if (!value) return;
});
undoButton.addEventListener("click", () => {
  strokes.pop();
  redraw();
});
finishButton.addEventListener("click", () => {
  if (!backgroundImage) return;
  const dataUrl = canvas.toDataURL("image/png");
  window.editorApi.saveToClipboardAndPersist(dataUrl).catch(() => {
  });
  window.close();
});
ocrButton.addEventListener("click", () => {
  console.log("OCR 功能预留：可在此处接入第三方 OCR 服务");
});
uploadButton.addEventListener("click", () => {
  console.log("图床上传功能预留：可在此处接入图床或自定义接口");
});
window.editorApi.onImage((dataUrl) => {
  backgroundImage = new Image();
  backgroundImage.src = dataUrl;
  backgroundImage.onload = () => {
    resizeCanvasToImage();
    redraw();
  };
});
window.addEventListener("resize", () => {
  if (!backgroundImage) return;
  resizeCanvasToImage();
  redraw();
});
