---
category: Acciones
---

# Button

Botón estándar del sistema. Hereda la superficie `--bg-panel-2` con borde `--border-strong`,
y al pasar el mouse el borde y el texto viran al amarillo `--accent`.

Reservá `variant="accent"` para **una sola** acción por vista: es la que el usuario debería
tocar. `variant="danger"` es para borrar o desvincular. Todo lo demás va en `default`.

```jsx
<Button variant="accent" onClick={guardar}>Guardar build</Button>
<Button onClick={cancelar}>Cancelar</Button>
<Button variant="danger" size="sm" onClick={borrar}>Borrar equipo</Button>
```

`size="sm"` es para barras de acciones dentro del encabezado de un `Panel`, donde el botón
compite por espacio con el título.

Si la acción navega a otra pantalla usá `LinkButton`: se ve igual pero emite un `<a>` real.
