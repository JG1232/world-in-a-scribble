(function () {
  'use strict';

  const canvas = document.getElementById('board');
  const drawControls = document.getElementById('draw-controls');
  const playControls = document.getElementById('play-controls');
  const thicknessInput = document.getElementById('thickness');
  const thicknessValue = document.getElementById('thickness-value');
  const rotateInput = document.getElementById('rotate');
  const rotateValue = document.getElementById('rotate-value');
  const toolButtons = Array.from(document.querySelectorAll('.tool'));
  const clearBtn = document.getElementById('clear-btn');
  const startBtn = document.getElementById('start-btn');
  const returnBtn = document.getElementById('return-btn');

  const drawing = DrawingApp.create(canvas);
  let mapSource = null;
  let playMode = false;
  let savedGrid = null;
  let savedWidth = 0;
  let savedHeight = 0;

  function canvasSize() {
    const wrap = document.getElementById('canvas-wrap');
    const rect = wrap.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    return {
      width: Math.max(320, Math.floor(rect.width * scale)),
      height: Math.max(200, Math.floor(rect.height * scale))
    };
  }

  function resizeCanvas() {
    const { width, height } = canvasSize();
    if (!playMode) {
      const grid = drawing.getCellGrid();
      drawing.resize(width, height);
      if (grid.length === width * height) {
        drawing.restoreFromGrid(grid);
      }
      return;
    }

    drawing.resize(width, height);
    if (savedGrid && savedWidth === width && savedHeight === height) {
      renderPlayMode(Number(rotateInput.value));
    }
  }

  function updateThicknessUI() {
    const tool = drawing.getTool();
    const value = drawing.getThicknessForTool(tool);
    thicknessInput.value = String(value);
    thicknessValue.textContent = String(value);
    thicknessInput.disabled = tool === 'fill' || tool === 'erase-fill';
  }

  function setActiveTool(name) {
    drawing.setTool(name);
    toolButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === name);
    });
    updateThicknessUI();
  }

  function renderPlayMode(longitude) {
    if (!mapSource || !savedGrid) return;

    const ctx = drawing.getContext();
    const pixels = MapTransform.renderFilledWorld({
      grid: savedGrid,
      width: savedWidth,
      height: savedHeight,
      sourceData: mapSource.data,
      mapWidth: mapSource.width,
      mapHeight: mapSource.height,
      midLongitude: longitude
    });

    const image = new ImageData(pixels, savedWidth, savedHeight);
    ctx.putImageData(image, 0, 0);
  }

  function enterPlayMode() {
    const { width, height } = canvasSize();
    savedWidth = width;
    savedHeight = height;
    savedGrid = drawing.getCellGrid();
    const blueCount = savedGrid.reduce((sum, cell) => sum + (cell === DrawingApp.BLUE ? 1 : 0), 0);
    if (blueCount === 0) {
      window.alert('Add some blue highlight or fill before starting the demo.');
      return;
    }

    playMode = true;
    drawControls.classList.add('hidden');
    playControls.classList.remove('hidden');
    canvas.style.cursor = 'default';
    canvas.style.pointerEvents = 'none';
    renderPlayMode(Number(rotateInput.value));
  }

  function exitPlayMode() {
    playMode = false;
    playControls.classList.add('hidden');
    drawControls.classList.remove('hidden');
    canvas.style.cursor = 'crosshair';
    canvas.style.pointerEvents = 'auto';
    if (savedGrid) {
      drawing.restoreFromGrid(savedGrid);
    } else {
      drawing.syncDisplay();
    }
  }

  toolButtons.forEach((btn) => {
    btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
  });

  thicknessInput.addEventListener('input', () => {
    const value = Number(thicknessInput.value);
    drawing.setThickness(value);
    thicknessValue.textContent = String(value);
  });

  clearBtn.addEventListener('click', () => {
    drawing.clear();
  });

  startBtn.addEventListener('click', () => {
    enterPlayMode();
  });

  returnBtn.addEventListener('click', () => {
    exitPlayMode();
  });

  rotateInput.addEventListener('input', () => {
    const value = Number(rotateInput.value);
    rotateValue.textContent = String(value);
    renderPlayMode(value);
  });

  window.addEventListener('resize', resizeCanvas);

  async function init() {
    setActiveTool('line');
    resizeCanvas();
    mapSource = await MapTransform.loadSourceMap('Lambert_cylindrical_equal-area_projection_SW.jpg');
  }

  init().catch((error) => {
    console.error(error);
    window.alert('Could not load the equal-area map image.');
  });
})();
