(function () {
  'use strict';

  const BLACK = 0;
  const BLUE = 1;
  const EMPTY = 2;

  const DEFAULT_THICKNESS = {
    line: 2,
    ellipse: 2,
    scribble: 3,
    highlight: 24,
    fill: 1,
    'erase-fill': 1,
    border: 4,
    erase: 12
  };

  function createDrawingApp(canvas, onChange) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const width = () => canvas.width;
    const height = () => canvas.height;

    let tool = 'line';
    let drawing = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let snapshot = null;
    const thicknessByTool = { ...DEFAULT_THICKNESS };

    const buffer = document.createElement('canvas');
    const bufferCtx = buffer.getContext('2d', { willReadFrequently: true });

    function resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      buffer.width = w;
      buffer.height = h;
      clear();
    }

    function clear() {
      bufferCtx.fillStyle = '#ffffff';
      bufferCtx.fillRect(0, 0, width(), height());
      syncDisplay();
      onChange?.();
    }

    function syncDisplay() {
      ctx.clearRect(0, 0, width(), height());
      ctx.drawImage(buffer, 0, 0);
    }

    function getThickness() {
      return thicknessByTool[tool] ?? 2;
    }

    function setThickness(value) {
      if (tool === 'fill' || tool === 'erase-fill') return;
      thicknessByTool[tool] = value;
    }

    function getThicknessForTool(name) {
      return thicknessByTool[name] ?? DEFAULT_THICKNESS[name] ?? 2;
    }

    function setTool(name) {
      tool = name;
    }

    function getPixelData() {
      return bufferCtx.getImageData(0, 0, width(), height());
    }

    function putPixelData(imageData) {
      bufferCtx.putImageData(imageData, 0, 0);
      syncDisplay();
      onChange?.();
    }

    function classifyPixel(r, g, b, a) {
      if (a !== undefined && a < 128) return EMPTY;
      if (r < 64 && g < 64 && b < 64) return BLACK;
      if (b > 120 && r < 120 && g < 160) return BLUE;
      return EMPTY;
    }

    function getCellGrid() {
      const data = getPixelData().data;
      const w = width();
      const h = height();
      const grid = new Uint8Array(w * h);
      for (let i = 0, p = 0; i < grid.length; i++, p += 4) {
        grid[i] = classifyPixel(data[p], data[p + 1], data[p + 2], data[p + 3]);
      }
      return grid;
    }

    function restoreFromGrid(grid) {
      const w = width();
      const h = height();
      const image = bufferCtx.createImageData(w, h);
      const out = image.data;
      for (let i = 0, p = 0; i < grid.length; i++, p += 4) {
        if (grid[i] === BLACK) {
          out[p] = 0;
          out[p + 1] = 0;
          out[p + 2] = 0;
          out[p + 3] = 255;
        } else if (grid[i] === BLUE) {
          out[p] = 30;
          out[p + 1] = 90;
          out[p + 2] = 220;
          out[p + 3] = 255;
        } else {
          out[p] = 255;
          out[p + 1] = 255;
          out[p + 2] = 255;
          out[p + 3] = 255;
        }
      }
      putPixelData(image);
    }

    function canvasPoint(evt) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = width() / rect.width;
      const scaleY = height() / rect.height;
      const clientX = evt.clientX ?? evt.touches?.[0]?.clientX ?? 0;
      const clientY = evt.clientY ?? evt.touches?.[0]?.clientY ?? 0;
      return {
        x: Math.max(0, Math.min(width() - 1, (clientX - rect.left) * scaleX)),
        y: Math.max(0, Math.min(height() - 1, (clientY - rect.top) * scaleY))
      };
    }

    function strokeStyle(color) {
      bufferCtx.strokeStyle = color;
      bufferCtx.fillStyle = color;
      bufferCtx.lineCap = 'round';
      bufferCtx.lineJoin = 'round';
    }

    function configureStroke(color, lineWidth) {
      strokeStyle(color);
      bufferCtx.lineWidth = lineWidth;
    }

    function drawLine(x0, y0, x1, y1, color, lineWidth) {
      configureStroke(color, lineWidth);
      bufferCtx.beginPath();
      bufferCtx.moveTo(x0, y0);
      bufferCtx.lineTo(x1, y1);
      bufferCtx.stroke();
    }

    function drawContinuousStroke(x0, y0, x1, y1, color, lineWidth) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(1, lineWidth * 0.35);
      const steps = Math.max(1, Math.ceil(dist / step));
      configureStroke(color, lineWidth);
      bufferCtx.beginPath();
      bufferCtx.moveTo(x0, y0);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        bufferCtx.lineTo(x0 + dx * t, y0 + dy * t);
      }
      bufferCtx.stroke();
    }

    function drawEllipse(x0, y0, x1, y1, color, lineWidth) {
      const left = Math.min(x0, x1);
      const top = Math.min(y0, y1);
      const rw = Math.abs(x1 - x0);
      const rh = Math.abs(y1 - y0);
      configureStroke(color, lineWidth);
      bufferCtx.beginPath();
      bufferCtx.ellipse(left + rw / 2, top + rh / 2, Math.max(rw / 2, 0.5), Math.max(rh / 2, 0.5), 0, 0, Math.PI * 2);
      bufferCtx.stroke();
    }

    function eraseDisc(x, y, radius) {
      bufferCtx.save();
      bufferCtx.globalCompositeOperation = 'source-over';
      bufferCtx.fillStyle = '#ffffff';
      bufferCtx.beginPath();
      bufferCtx.arc(x, y, radius, 0, Math.PI * 2);
      bufferCtx.fill();
      bufferCtx.restore();
    }

    function eraseStroke(x0, y0, x1, y1, radius) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(1, radius * 0.5);
      const steps = Math.max(1, Math.ceil(dist / step));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        eraseDisc(x0 + dx * t, y0 + dy * t, radius);
      }
    }

    function kindAt(data, w, x, y) {
      const p = (y * w + x) * 4;
      return classifyPixel(data[p], data[p + 1], data[p + 2], data[p + 3]);
    }

    function floodFillMask(data, w, h, x, y, matchKind) {
      const mask = new Uint8Array(w * h);
      const stack = [[Math.floor(x), Math.floor(y)]];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        const idx = cy * w + cx;
        if (mask[idx]) continue;
        if (kindAt(data, w, cx, cy) !== matchKind) continue;
        mask[idx] = 1;
        if (cx > 0) stack.push([cx - 1, cy]);
        if (cx < w - 1) stack.push([cx + 1, cy]);
        if (cy > 0) stack.push([cx, cy - 1]);
        if (cy < h - 1) stack.push([cx, cy + 1]);
      }
      return mask;
    }

    function floodFill(x, y) {
      const w = width();
      const h = height();
      const image = getPixelData();
      const data = image.data;
      const sx = Math.floor(x);
      const sy = Math.floor(y);
      const startKind = kindAt(data, w, sx, sy);
      if (startKind !== EMPTY) return;

      const mask = floodFillMask(data, w, h, sx, sy, EMPTY);
      for (let idx = 0; idx < mask.length; idx++) {
        if (!mask[idx]) continue;
        const p = idx * 4;
        data[p] = 30;
        data[p + 1] = 90;
        data[p + 2] = 220;
        data[p + 3] = 255;
      }

      putPixelData(image);
    }

    function eraseFill(x, y) {
      const w = width();
      const h = height();
      const image = getPixelData();
      const data = image.data;
      const sx = Math.floor(x);
      const sy = Math.floor(y);
      const startKind = kindAt(data, w, sx, sy);
      if (startKind !== BLUE && startKind !== BLACK) return;

      const mask = floodFillMask(data, w, h, sx, sy, startKind);
      for (let idx = 0; idx < mask.length; idx++) {
        if (!mask[idx]) continue;
        const p = idx * 4;
        data[p] = 255;
        data[p + 1] = 255;
        data[p + 2] = 255;
        data[p + 3] = 255;
      }

      putPixelData(image);
    }

    function border(x, y) {
      const w = width();
      const h = height();
      const image = getPixelData();
      const data = image.data;
      const sx = Math.floor(x);
      const sy = Math.floor(y);
      const startKind = kindAt(data, w, sx, sy);
      if (startKind !== BLUE && startKind !== EMPTY) return;

      const region = floodFillMask(data, w, h, sx, sy, startKind);
      const maxDistance = Math.max(1, Math.floor(getThickness()));
      const dist = new Int32Array(w * h);
      dist.fill(-1);
      const queue = [];

      for (let cy = 0; cy < h; cy++) {
        for (let cx = 0; cx < w; cx++) {
          const idx = cy * w + cx;
          if (!region[idx]) continue;
          dist[idx] = 0;
          queue.push(idx);
        }
      }

      let head = 0;
      while (head < queue.length) {
        const idx = queue[head++];
        const currentDist = dist[idx];
        if (currentDist >= maxDistance) continue;

        const cx = idx % w;
        const cy = (idx - cx) / w;
        const nextDist = currentDist + 1;

        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1]
        ];

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nidx = ny * w + nx;
          if (dist[nidx] !== -1) continue;
          dist[nidx] = nextDist;
          if (nextDist <= maxDistance) queue.push(nidx);
        }
      }

      for (let idx = 0; idx < dist.length; idx++) {
        const d = dist[idx];
        if (d < 1 || d > maxDistance) continue;
        const p = idx * 4;
        data[p] = 0;
        data[p + 1] = 0;
        data[p + 2] = 0;
        data[p + 3] = 255;
      }

      putPixelData(image);
    }

    function pointerDown(evt) {
      evt.preventDefault();
      const { x, y } = canvasPoint(evt);
      if (tool === 'fill') {
        floodFill(x, y);
        return;
      }
      if (tool === 'erase-fill') {
        eraseFill(x, y);
        return;
      }
      if (tool === 'border') {
        border(x, y);
        return;
      }

      drawing = true;
      startX = x;
      startY = y;
      lastX = x;
      lastY = y;
      snapshot = bufferCtx.getImageData(0, 0, width(), height());

      if (tool === 'scribble' || tool === 'highlight' || tool === 'erase') {
        const radius = getThickness() / 2;
        if (tool === 'erase') {
          eraseDisc(x, y, radius);
        } else {
          configureStroke(tool === 'highlight' ? '#1e5adc' : '#000000', getThickness());
          bufferCtx.beginPath();
          bufferCtx.arc(x, y, Math.max(radius, 0.5), 0, Math.PI * 2);
          bufferCtx.fill();
        }
        syncDisplay();
      }
    }

    function pointerMove(evt) {
      if (!drawing) return;
      evt.preventDefault();
      const { x, y } = canvasPoint(evt);
      const t = getThickness();

      if (tool === 'line') {
        bufferCtx.putImageData(snapshot, 0, 0);
        drawLine(startX, startY, x, y, '#000000', t);
      } else if (tool === 'ellipse') {
        bufferCtx.putImageData(snapshot, 0, 0);
        drawEllipse(startX, startY, x, y, '#000000', t);
      } else if (tool === 'scribble') {
        drawContinuousStroke(lastX, lastY, x, y, '#000000', t);
      } else if (tool === 'highlight') {
        drawLine(lastX, lastY, x, y, '#1e5adc', t);
      } else if (tool === 'erase') {
        eraseStroke(lastX, lastY, x, y, t / 2);
      }

      lastX = x;
      lastY = y;
      syncDisplay();
    }

    function pointerUp(evt) {
      if (!drawing) return;
      evt.preventDefault();
      drawing = false;
      snapshot = null;
      onChange?.();
    }

    canvas.addEventListener('mousedown', pointerDown);
    canvas.addEventListener('mousemove', pointerMove);
    window.addEventListener('mouseup', pointerUp);
    canvas.addEventListener('touchstart', pointerDown, { passive: false });
    canvas.addEventListener('touchmove', pointerMove, { passive: false });
    window.addEventListener('touchend', pointerUp);

    return {
      resize,
      clear,
      setTool,
      getTool: () => tool,
      setThickness,
      getThickness,
      getThicknessForTool,
      getCellGrid,
      restoreFromGrid,
      syncDisplay,
      getContext: () => ctx,
      getBufferCanvas: () => buffer
    };
  }

  window.DrawingApp = {
    create: createDrawingApp,
    BLACK,
    BLUE,
    EMPTY,
    DEFAULT_THICKNESS
  };
})();
