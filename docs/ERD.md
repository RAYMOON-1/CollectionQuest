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
    PROFILES ||--o{ ORDERS : "vende / compra / paga / cobra"
    ITEMS ||--o{ ORDERS : "se vende o se cambia"
    ITEMS ||--o| AUCTIONS : "se subasta"
    ITEMS ||--o{ BIDS : "recibe pujas"
    PROFILES ||--o{ BIDS : "puja"

    PROFILES {
        uuid id PK
        text username UK
        text avatar_url
        text avatar_color "aro del avatar"
        text banner_url
        int points "automático"
        int level "automático"
        user_role role
        boolean verified
    }
    ITEMS {
        uuid id PK
        uuid owner_id FK
        numeric value
        item_category category
        listing_type listing "venta, intercambio, exhibicion, subasta"
        rarity_tier rarity "automático"
        text image_url "obligatoria"
    }
    ORDERS {
        uuid id PK
        order_kind kind
        uuid seller_id FK
        uuid buyer_id FK
        uuid payer_id FK "quien paga"
        uuid receiver_id FK "quien cobra"
        numeric amount "precio o diferencia"
        payment_method payment_method
        boolean is_auction
        order_status status
    }
    PAYMENT_PROFILES {
        uuid user_id PK
        text transfer_clabe "18 dígitos válidos"
        text transfer_holder
        text transfer_alias
        text transfer_bank
        text payment_link "tarjeta, enlace seguro https"
    }
    AUCTIONS {
        uuid item_id PK
        numeric start_price
        numeric current_bid
        uuid current_bidder FK
        timestamptz ends_at
        text status
    }
    BIDS {
        uuid id PK
        uuid item_id FK
        uuid bidder_id FK
        numeric amount
    }
    FRIENDSHIPS {
        uuid id PK
        uuid requester_id FK
        uuid addressee_id FK
        friend_status status
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
| `search_text` | triggers | texto sin acentos, comas ni puntos para el buscador |
| `profiles.points` y `profiles.level` | trigger `trg_items_after_change` | suma de puntos de sus artículos; `1 + floor(raíz(puntos / 25))` |
| Perfil | trigger `on_auth_user_created` | se crea al registrarse |
| Correos | trigger `trg_check_email_domain` | formato válido, sin temporales y sin correos inventados |
| Diferencia en un intercambio | función `create_order` | si valen distinto, quien da la pieza de menor valor paga la diferencia |
| Dueño de los artículos | `complete_order` | cambia al completar una venta o intercambio |
| Subastas | `place_bid`, `finalize_expired_auctions` | puja mínima +5%, alarga 2 min si puja de último momento, el ganador recibe una operación para pagar |
| `profiles.verified` | `review_verification` | solo un admin |
