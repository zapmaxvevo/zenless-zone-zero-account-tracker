---
category: Etiquetas
---

# TagList

Fila que envuelve etiquetas con el espaciado del sistema (`0.35rem`) y las deja pasar a la
línea siguiente cuando no entran.

Envolvé con esto cualquier grupo de `Tag`, `ElementTag` o `RankBadge`. Mezclarlos en la
misma fila es lo normal: primero el atributo, después la profesión, y al final las marcas
de origen.

```jsx
<TagList>
  <ElementTag element="electric" />
  <Tag>Atacante</Tag>
  <Tag tone="accent">Manual</Tag>
</TagList>
```
