import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import NameField from './NameField.jsx';
import Icon from './Icon.jsx';
import { useSession } from '../context/SessionContext.jsx';
import { useToast } from './Toasts.jsx';
import { NAME_HINT, randomName, sanitizeName } from '../lib/name.js';

export default function NameDialog({ open, onClose }) {
  const { name, room, rename } = useSession();
  const { notify } = useToast();
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState('');
  const locked = !!room;

  useEffect(() => {
    if (open) {
      setDraft(name);
      setError('');
    }
  }, [open, name]);

  async function save() {
    const clean = sanitizeName(draft);
    if (!clean) return setError(NAME_HINT);
    if (clean === name) return onClose();
    const res = await rename(clean);
    if (!res.ok) return setError(res.error.message);
    notify(`Ahora eres ${res.name}`, 'success');
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tu nombre"
      icon="badge"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={locked} onClick={save}>
            Guardar
          </button>
        </>
      }
    >
      <p className="mb-4 text-body-md text-on-surface-variant">
        Es como te verán tus rivales, el chat y las salas. Se guarda en este navegador; no hay cuentas ni contraseñas.
      </p>
      <NameField
        id="dialog-name"
        value={draft}
        onChange={(v) => (setDraft(v), setError(''))}
        onCommit={undefined}
        onDice={() => (setDraft(randomName()), setError(''))}
        error={error}
        disabled={locked}
      />
      {locked && (
        <p className="mt-3 flex items-center gap-2 text-body-sm text-on-surface-variant">
          <Icon name="lock" className="!text-base text-secondary" />
          No puedes cambiar de nombre mientras estás en una sala.
        </p>
      )}
    </Modal>
  );
}
