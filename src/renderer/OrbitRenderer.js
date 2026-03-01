// Renderer orbit — rysuje eliptyczne ścieżki planet i strefę zamieszkiwalną
// Używa Phaser.GameObjects.Graphics (niskopoziomowe rysowanie wektorowe)

import { GAME_CONFIG } from '../config/GameConfig.js';
import { ColorPalette } from '../utils/ColorPalette.js';

export class OrbitRenderer {
  constructor(scene) {
    this.scene = scene;

    // Oddzielne warstwy graficzne (kolejność rysowania)
    this.habitableZoneGfx = scene.add.graphics().setDepth(0);
    this.orbitGfx         = scene.add.graphics().setDepth(1);
    // Warstwa hover-orbity (nad zwykłymi orbitami, pod planetami)
    this.hoverOrbitGfx    = scene.add.graphics().setDepth(1.5);
  }

  // Narysuj strefę Goldilocksa — zielony pierścień wokół gwiazdy
  drawHabitableZone(star) {
    const gfx    = this.habitableZoneGfx;
    const hzMin  = star.habitableZone.min * GAME_CONFIG.AU_TO_PX;
    const hzMax  = star.habitableZone.max * GAME_CONFIG.AU_TO_PX;

    gfx.clear();

    // Technika "pierścień": narysuj dwa kółka — zewnętrzne i wewnętrzne
    // Phaser nie ma natywnego pierścienia, dlatego rysunek odbywa się krokami
    const STEPS   = 200;
    const step    = (Math.PI * 2) / STEPS;

    gfx.fillStyle(ColorPalette.orbit.habitable, 0.18);
    gfx.beginPath();

    // Zewnętrzny okrąg (zgodnie z ruchem wskazówek zegara)
    for (let i = 0; i <= STEPS; i++) {
      const angle = i * step;
      const x = star.x + hzMax * Math.cos(angle);
      const y = star.y + hzMax * Math.sin(angle);
      i === 0 ? gfx.moveTo(x, y) : gfx.lineTo(x, y);
    }
    // Wewnętrzny okrąg (przeciwnie do wskazówek — tworzy "dziurę")
    for (let i = STEPS; i >= 0; i--) {
      const angle = i * step;
      const x = star.x + hzMin * Math.cos(angle);
      const y = star.y + hzMin * Math.sin(angle);
      gfx.lineTo(x, y);
    }

    gfx.closePath();
    gfx.fillPath();
  }

  // Narysuj wszystkie orbity planet (tylko planety — nie planetoidy/asteroidy)
  drawAll(planets, star) {
    this.orbitGfx.clear();
    this.hoverOrbitGfx.clear();   // wyczyść też hover-orbitę (po kolizji itp.)
    planets.forEach(planet => this.drawOrbit(planet, star));
  }

  // Narysuj orbitę podświetloną przy hoverze małego ciała
  drawHoverOrbit(body, star) {
    this.hoverOrbitGfx.clear();
    if (!body?.orbital) return;

    const orb   = body.orbital;
    const a     = orb.a * GAME_CONFIG.AU_TO_PX;
    const b     = a * Math.sqrt(1 - orb.e * orb.e);
    const c     = a * orb.e;
    const angle = orb.inclinationOffset;
    const cx    = star.x - c * Math.cos(angle);
    const cy    = star.y - c * Math.sin(angle);

    // Kolor wg typu ciała
    const color = body.type === 'planetoid' ? 0xaabb88
                : body.type === 'comet'     ? 0x88aaff
                : 0xaaaaaa;  // asteroid

    this.hoverOrbitGfx.lineStyle(1, color, 0.70);

    const STEPS = 128;
    const step  = (Math.PI * 2) / STEPS;
    this.hoverOrbitGfx.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const t  = i * step;
      const ex = a * Math.cos(t);
      const ey = b * Math.sin(t);
      const rx = ex * Math.cos(angle) - ey * Math.sin(angle) + cx;
      const ry = ex * Math.sin(angle) + ey * Math.cos(angle) + cy;
      i === 0 ? this.hoverOrbitGfx.moveTo(rx, ry) : this.hoverOrbitGfx.lineTo(rx, ry);
    }
    this.hoverOrbitGfx.closePath();
    this.hoverOrbitGfx.strokePath();
  }

  // Wyczyść hover-orbitę (gdy mysz opuści ciało)
  clearHoverOrbit() {
    this.hoverOrbitGfx.clear();
  }

  // Narysuj pojedynczą orbitę (elipsę)
  drawOrbit(planet, star) {
    const gfx = this.orbitGfx;
    const orb = planet.orbital;

    // Rozmiary elipsy w pikselach
    const a = orb.a * GAME_CONFIG.AU_TO_PX;          // półoś wielka (px)
    const b = a * Math.sqrt(1 - orb.e * orb.e);       // półoś mała (px)
    const c = a * orb.e;                              // odległość centrum → ognisko (px)

    // Kąt orientacji orbity
    const angle = orb.inclinationOffset;

    // Centrum elipsy — przesunięte od ogniska (gwiazdy) o c w kierunku "afelium"
    const cx = star.x - c * Math.cos(angle);
    const cy = star.y - c * Math.sin(angle);

    // Kolor zależy od stanu planety (priorytety: zaznaczona > niestabilna > życie > domyślna)
    let color = ColorPalette.orbit.default;
    if (planet.lifeScore > 0)            color = ColorPalette.orbit.life;
    if (planet.orbitalStability < 0.5)   color = ColorPalette.orbit.unstable;
    if (planet.isSelected)               color = ColorPalette.orbit.selected;

    gfx.lineStyle(1, color, 0.45);

    // Rysuj elipsę przez 128 punktów (Phaser nie ma natywnej obróconej elipsy)
    const STEPS = 128;
    const step  = (Math.PI * 2) / STEPS;

    gfx.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const t = i * step;

      // Punkt na osi-wyrównanej elipsie
      const ex = a * Math.cos(t);
      const ey = b * Math.sin(t);

      // Obrót o kąt inklinacji + przesunięcie do centrum
      const rx = ex * Math.cos(angle) - ey * Math.sin(angle) + cx;
      const ry = ex * Math.sin(angle) + ey * Math.cos(angle) + cy;

      i === 0 ? gfx.moveTo(rx, ry) : gfx.lineTo(rx, ry);
    }
    gfx.closePath();
    gfx.strokePath();
  }

  destroy() {
    this.habitableZoneGfx.destroy();
    this.orbitGfx.destroy();
    this.hoverOrbitGfx.destroy();
  }
}
