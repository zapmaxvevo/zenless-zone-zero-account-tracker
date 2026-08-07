---
category: Contenedores
---

# EmptySlot

Hueco con borde punteado para una posición sin llenar: un slot de equipo vacío, un disco
que falta en el set.

Existe para que la grilla **conserve su forma**. Un equipo de ZZZ siempre tiene tres
posiciones y un set siempre seis discos; mostrar cuatro tarjetas y nada más esconde la
información de que faltan dos.

```jsx
<EmptySlot>Sin agente</EmptySlot>
<EmptySlot>Disco 4 vacío</EmptySlot>
```

El texto va atenuado y centrado. Mantenelo corto: es una ausencia, no un mensaje de error —
para eso está `StatusMessage` con `kind="empty"`.
