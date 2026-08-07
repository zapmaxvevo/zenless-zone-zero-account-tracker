---
category: Formularios
---

# Field

Envoltorio de un control de formulario: etiqueta arriba en mayúsculas atenuadas, control en
el medio, texto de ayuda abajo.

Todo control del sistema va adentro de un `Field`. La única excepción razonable es un input
de búsqueda suelto en una barra, donde el placeholder alcanza.

Pasá `htmlFor` con el mismo `id` del control para que la etiqueta lo active al hacer clic.

```jsx
<Field label="UID" htmlFor="uid" hint="Nueve dígitos, lo ves en el perfil del juego.">
  <TextInput id="uid" mono placeholder="1300000123" />
</Field>

<Field label="Nivel" htmlFor="nivel" hint="Máximo 60." invalid>
  <TextInput id="nivel" mono defaultValue="99" invalid />
</Field>
```

`invalid` pinta el `hint` de rojo, pero no toca el control: pasale también `invalid` al
`TextInput` o al `Select` para que el borde acompañe.
