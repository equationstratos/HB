/**
 * Initialisations au chargement du bundle, avant tout écran :
 * traductions et tâche de suivi GPS en arrière-plan (doit être définie au niveau du module).
 */
import { defineLocationTask } from '@hb/mobile-core';
import './i18n';

defineLocationTask();
