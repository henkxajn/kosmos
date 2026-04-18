// humanity.js — pre-faction Human ground units (Ground Unit System)
//
// "humanity" to stan przed podziałem na UNE i Syndykat. Brak statsModifier =
// używa bazowych statów z UNIT_ARCHETYPES bez zmian.
//
// Sprite PNG powinny być w assets/units/ground/humanity/ — jeśli nie istnieją,
// GroundUnitFactory.loadUnitSprite() podstawi runtime placeholder.

export const HUMANITY_UNITS = {
  shock_infantry: {
    name:   'Colonial Marines',
    sprite: 'assets/units/ground/humanity/human_marines.png',
    color:  '#94A3B8',
  },
  rocket_artillery: {
    name:   'Mobile Rocket Battery',
    sprite: 'assets/units/ground/humanity/human_artillery.png',
    color:  '#94A3B8',
  },
  garrison_unit: {
    name:   'Fortified Position',
    sprite: 'assets/units/ground/humanity/human_garrison.png',
    color:  '#94A3B8',
  },
  aa_platform: {
    name:   'Point Defense Vehicle',
    sprite: 'assets/units/ground/humanity/human_aa.png',
    color:  '#94A3B8',
  },
  medic_unit: {
    name:   'Medical Support Crawler',
    sprite: 'assets/units/ground/humanity/human_medic.png',
    color:  '#94A3B8',
  },
  recon_drone: {
    name:   'Scout Drone MK-I',
    sprite: 'assets/units/ground/humanity/human_drone.png',
    color:  '#94A3B8',
  },
};
