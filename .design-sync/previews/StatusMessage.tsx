import { Panel, StatusMessage } from "zzz-ui";

export function Cargando() {
  return (
    <StatusMessage kind="loading">Cargando discos del agente…</StatusMessage>
  );
}

export function Error() {
  return (
    <StatusMessage kind="error" onRetry={() => {}}>
      No se pudo conectar con la API de Enka.
    </StatusMessage>
  );
}

export function Vacio() {
  return (
    <StatusMessage kind="empty">
      Este agente todavía no tiene discos cargados.
    </StatusMessage>
  );
}

export function DentroDeUnPanel() {
  return (
    <Panel title="Discos">
      <StatusMessage kind="error" onRetry={() => {}}>
        No se pudieron cargar los discos.
      </StatusMessage>
    </Panel>
  );
}
