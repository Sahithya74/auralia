import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

/** Switches the interface and Anbu's reply language, and remembers it on the account. */
export function useLanguageSwitch() {
  const { i18n } = useTranslation();
  const { updateUser } = useAuth();
  return useCallback(
    (code: string) => {
      void i18n.changeLanguage(code);
      updateUser({ preferredLanguage: code }).catch(() => undefined);
    },
    [i18n, updateUser],
  );
}
