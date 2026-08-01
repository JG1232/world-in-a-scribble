(function () {
  'use strict';

  const BLACK = 0;
  const BLUE = 1;

  function lonToMapX(lonDeg, mapWidth) {
    let lon = lonDeg;
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return ((lon + 180) / 360) * (mapWidth - 1);
  }

  function collectBlueXs(grid, width, y) {
    const xs = [];
    const rowStart = y * width;
    for (let x = 0; x < width; x++) {
      if (grid[rowStart + x] === BLUE) xs.push(x);
    }
    return xs;
  }

  /**
   * Average all source-map pixels in a rectangle of the rotated view where
   * x = 0..mapWidth spans longitudes [midLon - 180, midLon + 180].
   */
  function averageRotatedRegion(sourceData, mapWidth, mapHeight, midLon, x0, y0, x1, y1) {
    const ix0 = Math.max(0, Math.floor(x0));
    const ix1 = Math.min(mapWidth, Math.ceil(x1));
    const iy0 = Math.max(0, Math.floor(y0));
    const iy1 = Math.min(mapHeight, Math.ceil(y1));

    if (ix0 >= ix1 || iy0 >= iy1) {
      return [255, 255, 255];
    }

    let sr = 0;
    let sg = 0;
    let sb = 0;
    let count = 0;

    for (let my = iy0; my < iy1; my++) {
      for (let mx = ix0; mx < ix1; mx++) {
        const lon = midLon + (mx / (mapWidth - 1) - 0.5) * 360;
        const srcX = Math.max(0, Math.min(mapWidth - 1, Math.round(lonToMapX(lon, mapWidth))));
        const idx = (my * mapWidth + srcX) * 4;
        sr += sourceData[idx];
        sg += sourceData[idx + 1];
        sb += sourceData[idx + 2];
        count++;
      }
    }

    return [sr / count, sg / count, sb / count];
  }

  function renderFilledWorld({
    grid,
    width,
    height,
    sourceData,
    mapWidth,
    mapHeight,
    midLongitude
  }) {
    let totalBlue = 0;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === BLUE) totalBlue++;
    }

    const output = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      const rowStart = y * width;
      for (let x = 0; x < width; x++) {
        const cell = grid[rowStart + x];
        const p = (rowStart + x) * 4;
        if (cell === BLACK) {
          output[p] = 0;
          output[p + 1] = 0;
          output[p + 2] = 0;
          output[p + 3] = 255;
        } else {
          output[p] = 255;
          output[p + 1] = 255;
          output[p + 2] = 255;
          output[p + 3] = 255;
        }
      }
    }

    if (totalBlue <= 0) return output;

    let blueAccum = 0;

    for (let y = 0; y < height; y++) {
      const blueXs = collectBlueXs(grid, width, y);
      const rowBlue = blueXs.length;
      if (rowBlue === 0) continue;

      const mapY0 = (blueAccum / totalBlue) * mapHeight;
      const mapY1 = ((blueAccum + rowBlue) / totalBlue) * mapHeight;
      blueAccum += rowBlue;

      for (let i = 0; i < rowBlue; i++) {
        const mapX0 = (i / rowBlue) * mapWidth;
        const mapX1 = ((i + 1) / rowBlue) * mapWidth;
        const color = averageRotatedRegion(
          sourceData,
          mapWidth,
          mapHeight,
          midLongitude,
          mapX0,
          mapY0,
          mapX1,
          mapY1
        );

        const x = blueXs[i];
        const p = (y * width + x) * 4;
        output[p] = color[0];
        output[p + 1] = color[1];
        output[p + 2] = color[2];
        output[p + 3] = 255;
      }
    }

    return output;
  }

  async function loadSourceMap(url) {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    return {
      width: canvas.width,
      height: canvas.height,
      data: imageData.data
    };
  }

  window.MapTransform = {
    loadSourceMap,
    renderFilledWorld,
    BLACK,
    BLUE
  };
})();
