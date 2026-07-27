export function exportBoardAsImage(pieces, boardName) {
  const CELL_SIZE = 50;
  const HEADER_HEIGHT = 80;
  const FOOTER_HEIGHT = 40;
  const GRID_SIZE = 8 * CELL_SIZE;
  const WIDTH = GRID_SIZE + 40; // 20px padding sides
  const HEIGHT = GRID_SIZE + HEADER_HEIGHT + FOOTER_HEIGHT;

  let svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <defs>
        <filter id="glow-mirror">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      <!-- Background -->
      <rect width="100%" height="100%" fill="#0a0a0c" />
      
      <!-- Header -->
      <text x="50%" y="35" font-family="monospace" font-size="22" fill="#00f0ff" text-anchor="middle" font-weight="bold" letter-spacing="2">
        LAZER SHOWDOWN
      </text>
      <text x="50%" y="60" font-family="sans-serif" font-size="14" fill="#ffffff" text-anchor="middle" font-weight="bold" opacity="0.8" letter-spacing="4">
        ${boardName.toUpperCase()}
      </text>

      <!-- Grid Group -->
      <g transform="translate(20, ${HEADER_HEIGHT})">
  `;

  // Draw grid
  for(let r = 0; r < 8; r++) {
    for(let c = 0; c < 8; c++) {
      svg += `<rect x="${c*CELL_SIZE}" y="${r*CELL_SIZE}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="rgba(255,255,255,0.02)" stroke="#222" stroke-width="1" />`;
    }
  }

  // Draw pieces
  if (Array.isArray(pieces)) {
    pieces.forEach(p => {
      if (p.type === 'mirror' && p.grid_pos) {
        const cx = p.grid_pos[1] * CELL_SIZE + (CELL_SIZE/2);
        const cy = p.grid_pos[0] * CELL_SIZE + (CELL_SIZE/2);
        const color = '#00f0ff';
        const glow = 'url(#glow-mirror)';
        const rot = p.angle === 90 ? 45 : -45;

        svg += `<g transform="translate(${cx}, ${cy}) rotate(${rot})">`;
        svg += `<rect x="-2" y="-16" width="4" height="32" rx="2" fill="${color}" filter="${glow}" />`;
        svg += `<circle cx="0" cy="0" r="3" fill="#fff" />`;
        svg += `</g>`;
      }
    });
  }

  // Footer
  svg += `
      </g>
      <text x="50%" y="${HEIGHT - 15}" font-family="monospace" font-size="10" fill="#666" text-anchor="middle" letter-spacing="1">
        EXPORTED VIA LAZER SHOWDOWN DEV'S CORNER
      </text>
    </svg>
  `;

  // Convert SVG to PNG
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  
  const img = new Image();
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  
  img.onload = () => {
    // Fill black background first just in case
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${boardName.replace(/\s+/g, '-').toLowerCase()}.lzrshwdn.board.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, 'image/png', 1.0);
  };
  
  img.src = url;
}
