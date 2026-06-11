const { Jimp, intToRGBA, rgbaToInt } = require('jimp');
const path = require('path');

async function removeBackground() {
  const imagePath = path.join(__dirname, '../assets/pharos_shield_logo.png');
  console.log(`Loading image from: ${imagePath}`);
  
  const image = await Jimp.read(imagePath);
  const width = image.width;
  const height = image.height;
  
  // Target color is the corner pixel (0,0)
  const targetColorHex = image.getPixelColor(0, 0);
  const targetRGBA = intToRGBA(targetColorHex);
  console.log(`Target background color (RGBA):`, targetRGBA);
  
  const visited = new Set();
  const queue = [];
  
  // Push 4 corners
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1]
  ];
  
  for (const [x, y] of corners) {
    queue.push([x, y]);
    visited.add(`${x},${y}`);
  }
  
  // Tolerance threshold for color similarity
  const tolerance = 45; 
  
  function isSimilar(rgba1, rgba2) {
    const dr = rgba1.r - rgba2.r;
    const dg = rgba1.g - rgba2.g;
    const db = rgba1.b - rgba2.b;
    const distance = Math.sqrt(dr*dr + dg*dg + db*db);
    return distance < tolerance;
  }
  
  let processedPixels = 0;
  
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    const currentColorHex = image.getPixelColor(x, y);
    const currentRGBA = intToRGBA(currentColorHex);
    
    // Set to transparent
    image.setPixelColor(rgbaToInt(0, 0, 0, 0), x, y);
    processedPixels++;
    
    // Check 4-way neighbors
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];
    
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const key = `${nx},${ny}`;
        if (!visited.has(key)) {
          const neighborColorHex = image.getPixelColor(nx, ny);
          const neighborRGBA = intToRGBA(neighborColorHex);
          
          if (isSimilar(targetRGBA, neighborRGBA)) {
            queue.push([nx, ny]);
            visited.add(key);
          }
        }
      }
    }
  }
  
  console.log(`Processed ${processedPixels} pixels to transparent.`);
  
  // Save the modified image back
  await image.write(imagePath);
  console.log(`Saved transparent image to: ${imagePath}`);
}

removeBackground().catch(err => {
  console.error('Error processing image:', err);
});
