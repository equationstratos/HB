import { useTranslation } from 'react-i18next';
import { useServerOutdated } from '../server';
import { Banner } from '../ui/primitives';

/**
 * Serveur trop ancien pour cette version de l'appli : carte, trajets ou cagnotte ne peuvent
 * pas fonctionner. Indique la commande de mise à jour à lancer sur l'ordinateur.
 */
export function ServerUpdateBanner() {
  const { t } = useTranslation();
  const outdated = useServerOutdated();
  if (!outdated) return null;
  return (
    <Banner
      tone="warning"
      icon="cloud-download-outline"
      title={t('server.outdatedTitle')}
      message={t('server.outdatedMessage')}
    />
  );
}
