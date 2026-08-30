---
category: Etiquetas
---

# ElementTag

Etiqueta de atributo elemental de ZZZ. El color sale de `element` y no se puede pasar por
fuera: el mapeo atributo → color es parte del sistema y tiene que ser idéntico en toda la app.

| `element`  | Token               | Color     |
|------------|---------------------|-----------|
| `fire`     | `--element-fire`     | `#ff7a45` |
| `ice`      | `--element-ice`      | `#61d2ff` |
| `electric` | `--element-electric` | `#8f8bff` |
| `physics`  | `--element-physics`  | `#f7d64a` |
| `ether`    | `--element-ether`    | `#ff5fa2` |

```jsx
<TagList>
  <ElementTag element="fire" />
  <ElementTag element="ether" />
</TagList>
```

El texto por defecto es el nombre del atributo en español (Fuego, Hielo, Eléctrico, Físico,
Éter). `label` lo reemplaza, para casos como una abreviatura en una tarjeta angosta.
