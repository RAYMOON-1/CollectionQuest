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

    // Inicio de sesión con redes. Pon false en los que todavía no configuras en Supabase
    // (ver docs/LOGIN-SOCIAL.md): su botón se oculta.
    AUTH_PROVIDERS: { google: false, facebook: false, apple: false },

    // La rareza depende de cuántas unidades existen del artículo.
    // La regla real está en la base de datos (función rarity_for_units en sql/schema.sql);
    // si cambias números aquí, cámbialos también allá. Aquí sirve para la vista previa.
    RARITY: {
        comun: { label: 'Común', maxUnits: null, range: 'Más de 5,000 o producción normal', points: 10, color: 'gray', hex: '#A7B0C4' },
        rara: { label: 'Rara', maxUnits: 5000, range: '501 a 5,000 unidades', points: 25, color: 'blue', hex: '#46A8FF' },
        epica: { label: 'Épica', maxUnits: 500, range: '101 a 500 unidades', points: 60, color: 'purple', hex: '#B26CFF' },
        mitica: { label: 'Mítica', maxUnits: 100, range: '11 a 100 unidades', points: 150, color: 'pink', hex: '#FF5FCF' },
        legendaria: { label: 'Legendaria', maxUnits: 10, range: '1 a 10 unidades', points: 400, color: 'gold', hex: '#FFC21A' }
    }
};