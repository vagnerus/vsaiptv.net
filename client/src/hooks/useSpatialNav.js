import { useEffect } from 'react';
import { SpatialNavigationManager } from '../navigation/SpatialNavigationManager';

/**
 * useSpatialNav — Hook que ativa o SpatialNavigationManager no ciclo do React
 */
export function useSpatialNav({ enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return;

    const nav = SpatialNavigationManager.getInstance();
    nav.init();

    return () => {
      // Deixamos ativo enquanto a aplicação estiver aberta
    };
  }, [enabled]);
}

