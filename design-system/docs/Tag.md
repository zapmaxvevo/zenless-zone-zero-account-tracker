---
category: Etiquetas
---

# Tag

Etiqueta redondeada en mayúsculas para metadatos cortos: profesión, especialidad, origen
del dato. Texto atenuado sobre `--bg-panel-2` con borde `--border-strong`.

Es deliberadamente discreta: las etiquetas acompañan al contenido, no compiten con él.
Cuando necesites que una destaque, `tone="accent"` la pinta de amarillo — así se marcan
los datos cargados a mano frente a los importados del juego.

```jsx
<TagList>
  <Tag>Atacante</Tag>
  <Tag>Anomalía</Tag>
  <Tag tone="accent">Manual</Tag>
</TagList>
```

Para atributos elementales usá `ElementTag`, que fija el color, y para rareza `RankBadge`.
No repliques esos colores con `Tag`.
