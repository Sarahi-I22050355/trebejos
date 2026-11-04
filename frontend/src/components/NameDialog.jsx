import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import NameField from './NameField.jsx';
import Icon from './Icon.jsx';
import { useSession } from '../context/SessionContext.jsx';
import { useToast } from './Toasts.jsx';
import { nameHint, randomName, sanitizeName } from '../lib/name.js';
import { errorText } from '../i18n/errors.js';
import { useI18n } from '../i18n/useI18n.js';

export default function NameDialog({ open, onClose }) {
  const { t } = useI18n();
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
    if (!clean) return setError(nameHint());
    if (clean === name) return onClose();
    const res = await rename(clean);
    if (!res.ok) return setError(errorText(res.error));
    notify(t('Ahora eres {name}', { name: res.name }), 'success');
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Tu nombre')}
      icon="badge"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            {t('Cancelar')}
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={locked} onClick={save}>
            {t('Guardar')}
          </button>
        </>
      }
    >
      <p className="mb-4 text-body-md text-on-surface-variant">
        {t('Es como te verán tus rivales, el chat y las salas. Se guarda en este navegador; no hay cuentas ni contraseñas.')}
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
          {t('No puedes cambiar de nombre mientras estás en una sala.')}
        </p>
      )}
    </Modal>
  );
}
