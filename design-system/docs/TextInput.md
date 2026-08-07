---
category: Formularios
---

# TextInput

Campo de texto con los estilos del sistema: fondo `--bg-panel-2`, borde `--border-strong`
y borde amarillo al enfocar.

`mono` cambia la tipografía a monoespaciada. Usalo para **todo valor numérico o
identificador**: UIDs, niveles, mindscape, valores de subestadísticas. Es lo que hace que
las cifras alineen verticalmente cuando hay varias una debajo de otra.

```jsx
<Field label="UID" htmlFor="uid">
  <TextInput id="uid" mono placeholder="1300000123" inputMode="numeric" />
</Field>

<Field label="Nombre del equipo" htmlFor="nombre">
  <TextInput id="nombre" placeholder="Equipo de hielo" />
</Field>
```

`invalid` pinta el borde de rojo y marca `aria-invalid`. Combinalo con el `hint` del `Field`
para explicar qué está mal — el borde rojo solo no dice nada.
