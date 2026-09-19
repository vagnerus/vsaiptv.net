import React from 'react';
import { Home, Tv, Film, Clapperboard, Search, ShieldOff } from 'lucide-react';

export default function BottomNav({ activeTab, onTabChange, showXxx = false }) {
  const tabs = [
    { id: 'home', label: 'Início', icon: Home },
    { id: 'live', label: 'TV Ao Vivo', icon: Tv },
    { id: 'movie', label: 'Filmes', icon: Film },
    { id: 'series', label: 'Séries', icon: Clapperboard },
    // Aba XXX: apenas quando o pacote foi liberado na conta (ou admin/revenda)
    ...(showXxx ? [{ id: 'xxx', label: 'XXX', icon: ShieldOff, xxx: true }] : []),
    { id: 'search', label: 'Busca', icon: Search },
  ];

  return (
    <nav className="vsa-bottom-nav" aria-label="Navegação mobile">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`vsa-bottom-item ${isActive ? 'active' : ''} ${tab.xxx ? 'vsa-bottom-xxx' : ''}`}
            onClick={() => onTabChange(tab.id)}
            aria-label={tab.label}
          >
            <Icon size={21} className="vsa-bottom-icon" />
            <span className="vsa-bottom-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}