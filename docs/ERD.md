# Diagrama ERD

Imagen lista para el reporte: `erd.png` (o `erd.svg`, que se abre en el navegador).

Versión en texto (Mermaid). GitHub y VS Code con la extensión de Mermaid la dibujan:

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : "se crea solo al registrarse"
    PROFILES ||--o{ ITEMS : "posee"
    PROFILES ||--o{ FRIENDSHIPS : "pide / recibe"
    PROFILES ||--o| PAYMENT_PROFILES : "datos de cobro"
    PROFILES ||--o{ VERIFICATIONS : "pide verificarse"
    PROFILES ||--o{ ORDERS : "vende / compra"
    ITEMS ||--o{ ORDERS : "se vende o se cambia"

    PROFILES {
        uuid id PK
        text username UK
        text avatar_url
        text banner_url
        text bio
        text contact
        int points "automático"
        int level "automático"
        user_role role
        boolean verified
    }
    ITEMS {
        uuid id PK
        uuid owner_id FK
        text name
        numeric value
        item_category category
        listing_type listing
        rarity_tier rarity "automático"
        int points "automático"
        text image_url "obligatoria"
    }
    FRIENDSHIPS {
        uuid id PK
        uuid requester_id FK
        uuid addressee_id FK
        friend_status status
    }
    ORDERS {
        uuid id PK
        order_kind kind
        uuid item_id FK
        uuid seller_id FK
        uuid buyer_id FK
        uuid offered_item_id FK
        numeric amount
        payment_method payment_method
        order_status status
    }
    PAYMENT_PROFILES {
        uuid user_id PK
        text transfer_info
        text payment_link
    }
    VERIFICATIONS {
        uuid id PK
        uuid user_id FK
        text id_path "se borra al revisar"
        verify_status status
    }
```

## Reglas automáticas (las hace la base de datos, no el navegador)

| Dato | Quién lo calcula | Regla |
|---|---|---|
| `items.rarity` y `items.points` | trigger `trg_items_set_rarity` | según `value`: 500 / 2,500 / 10,000 / 50,000, y 10 / 25 / 60 / 150 / 400 puntos |
| `items.search_text`, `profiles.search_text` | triggers | texto sin acentos, comas ni puntos para el buscador |
| `profiles.points` y `profiles.level` | trigger `trg_items_after_change` | suma de puntos de sus artículos; `1 + floor(raíz(puntos / 25))` |
| `profiles` | trigger `on_auth_user_created` | se crea al registrarse |
| Correos | trigger `trg_check_email_domain` | formato válido y sin correos temporales |
| Dueño de los artículos | función `complete_order` | cambia al completar una venta o intercambio |
| `profiles.verified` | función `review_verification` | solo un admin |
