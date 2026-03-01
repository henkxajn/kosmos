// Klasa bazowa dla wszystkich ciał niebieskich w układzie
// Każde ciało (gwiazda, planeta, księżyc, asteroid) rozszerza tę klasę

export class CelestialBody {
  constructor(config) {
    // Identyfikacja
    this.id   = config.id;
    this.name = config.name || 'Nieznane ciało';
    this.type = config.type; // 'star' | 'planet' | 'moon' | 'asteroid'

    // Pozycja w pikselach (aktualizowana przez PhysicsSystem co klatkę)
    this.x = config.x || 0;
    this.y = config.y || 0;

    // Parametry fizyczne
    this.physics = {
      mass:    config.mass    || 1.0,  // masa (masy słoneczne dla gwiazd, ziemskie dla planet)
      radius:  config.radius  || 1.0,  // promień (AU)
      density: config.density || 5500, // gęstość (kg/m³, informacyjnie)
    };

    // Komponent orbitalny (null dla gwiazdy — stoi w centrum)
    this.orbital = config.orbital || null;

    // Parametry wizualne
    this.visual = {
      color:       config.color       || 0xffffff,
      glowColor:   config.glowColor   || null,
      radius:      config.visualRadius || 8,  // rozmiar kółka na ekranie (px)
      sprite:      null,  // referencja do obiektu Phasera (ustawiana przez renderer)
    };

    // Stan encji
    this.age        = 0;      // wiek w latach gry
    this.isSelected = false;  // czy zaznaczone przez gracza
    this.lifeScore  = 0;      // wynik życia (0=brak; tylko Planet.js nadpisuje logicznie)
    this.explored   = false;  // czy zbadane ekspedycją naukową (wymagane do kolonizacji)
  }

  // Przesuń wiek o deltę (wywoływane przez TimeSystem)
  updateAge(deltaYears) {
    this.age += deltaYears;
  }

  // Dane do wyświetlenia w panelu informacji UI
  // Podklasy nadpisują tę metodę i rozszerzają wynik
  getDisplayInfo() {
    return {
      Nazwa: this.name,
      Typ:   this.type,
      Masa:  this.physics.mass.toFixed(3),
      Wiek:  `${Math.floor(this.age).toLocaleString()} lat`,
    };
  }
}
