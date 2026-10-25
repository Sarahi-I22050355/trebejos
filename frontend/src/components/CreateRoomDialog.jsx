import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import Segmented from './Segmented.jsx';
import Icon from './Icon.jsx';
import { CLOCK_PRESETS } from '../lib/clock.js';

const VISIBILITY = [
  { value: 'private', label: 'Privada', icon: 'lock', description: 'Solo con el código' },
  { value: 'public', label: 'Pública', icon: 'public', description: 'Aparece en el listado' },
];
const COLORS = [
  { value: 'w', label: 'Blancas', icon: 'light_mode' },
  { value: 'b', label: 'Negras', icon: 'dark_mode' },
  { value: 'random', label: 'Aleatorio', icon: 'shuffle' },
];
const CLOCKS = CLOCK_PRESETS.map((p) => ({ value: p.id, label: p.label }));

export default function CreateRoomDialog({ open, onClose, onCreate, busy, initialClock = 'none' }) {
  const [visibility, setVisibility] = useState('private');
  const [color, setColor] = useState('random');
  const [clockId, setClockId] = useState(initialClock);

  useEffect(() => {
    if (open) setClockId(initialClock);
  }, [open, initialClock]);

  const submit = (e) => {
    e.preventDefault();
    const preset = CLOCK_PRESETS.find((p) => p.id === clockId);
    onCreate({ visibility, color, clock: preset?.clock ?? null });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Crear sala"
      icon="add_box"
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="create-room-form" className="btn btn-primary" disabled={busy}>
            <Icon name={busy ? 'progress_activity' : 'swords'} className={busy ? 'animate-spin' : ''} />
            {busy ? 'Creando…' : 'Crear sala'}
          </button>
        </>
      }
    >
      <form id="create-room-form" onSubmit={submit} className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-label-badge text-label-badge uppercase tracking-[0.08em] text-on-surface-variant">
            Visibilidad
          </legend>
          <Segmented label="Visibilidad" options={VISIBILITY} value={visibility} onChange={setVisibility} />
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-label-badge text-label-badge uppercase tracking-[0.08em] text-on-surface-variant">
            Tu color
          </legend>
          <Segmented label="Tu color" options={COLORS} value={color} onChange={setColor} compact />
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-label-badge text-label-badge uppercase tracking-[0.08em] text-on-surface-variant">
            Reloj (minutos + incremento en segundos)
          </legend>
          <Segmented label="Reloj" options={CLOCKS} value={clockId} onChange={setClockId} columns={5} compact />
        </fieldset>
        <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
          <Icon name="info" className="!text-base text-primary-container" />
          La partida empieza sola cuando entre tu rival. Si alguien más entra después, lo hará como espectador.
        </p>
      </form>
    </Modal>
  );
}
