---
category: Formularios
---

# FieldRow

Fila de `Field` que reparte el ancho disponible y alinea los controles por abajo, así las
etiquetas de distinto largo no desalinean los inputs.

Cada `Field` adentro arranca en `8rem` y crece. Cuando no entran, pasan a la línea siguiente.

```jsx
<FieldRow>
  <Field label="Nivel" htmlFor="nivel">
    <TextInput id="nivel" mono defaultValue="60" />
  </Field>
  <Field label="Mindscape" htmlFor="m">
    <TextInput id="m" mono defaultValue="2" />
  </Field>
  <Button variant="accent">Aplicar</Button>
</FieldRow>
```

Un `Button` suelto dentro de la fila queda alineado con los controles, no con las etiquetas.
Tres o cuatro campos por fila es el límite práctico antes de que se vuelva ilegible.
