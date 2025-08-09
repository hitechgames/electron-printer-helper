// Genera .icns e .ico a partire da assets/icons/print.png
// Richiede: npm i png2icons -D

const fs = require('fs');
const path = require('path');
const png2icons = require('png2icons');

const SRC = path.join(__dirname, '..', 'assets', 'icons', 'print.png');
const ICNS = path.join(__dirname, '..', 'assets', 'icons', 'icon.icns');
const ICO = path.join(__dirname, '..', 'assets', 'icons', 'icon.ico');

if (!fs.existsSync(SRC)) {
  console.error('Manca assets/icons/print.png');
  process.exit(1);
}

const input = fs.readFileSync(SRC);

try {
  const icns = png2icons.createICNS(input, png2icons.BILINEAR, false, 0);
  if (icns) fs.writeFileSync(ICNS, icns);
  const ico = png2icons.createICO(input, png2icons.BILINEAR, false, 0, true);
  if (ico) fs.writeFileSync(ICO, ico);
  console.log('Icone generate:', ICNS, ICO);
} catch (e) {
  console.error('Errore generazione icone:', e.message);
  process.exit(1);
}
