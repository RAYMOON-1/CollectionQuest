/* ============================================================
   CONFIGURACIÓN - llena estos dos datos con los de tu proyecto
   Supabase > Project Settings > API (o el botón "Connect")
   - Project URL
   - Publishable key (la que empieza con sb_publishable_...)
   NUNCA pongas aquí la secret key / service_role.
   ============================================================ */
window.CQ_CONFIG = {
  SUPABASE_URL: 'https://pcxgazidzsqlfpceljsm.supabase.co',
  SUPABASE_KEY: 'sb_publishable_eNQavVPoPAoXXyG0k1QFrA_OBX4t9F7',

  // Solo para la vista previa mientras escribes el valor.
  // La rareza real la calcula la base de datos (sql/schema.sql).
  // Si cambias números aquí, cámbialos también en esa función SQL.
  RARITY: {
    comun:      { label: 'Común',      min: 0,     points: 10,  color: 'gray',   hex: '#A7B0C4' },
    rara:       { label: 'Rara',       min: 500,   points: 25,  color: 'blue',   hex: '#46A8FF' },
    epica:      { label: 'Épica',      min: 2500,  points: 60,  color: 'purple', hex: '#B26CFF' },
    mitica:     { label: 'Mítica',     min: 10000, points: 150, color: 'pink',   hex: '#FF5FCF' },
    legendaria: { label: 'Legendaria', min: 50000, points: 400, color: 'gold',   hex: '#FFC21A' }
  }
};
