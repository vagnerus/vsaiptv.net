import React, { createContext, useContext, useState, useEffect } from 'react';

const FavoritesContext = createContext();

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('vsa_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('vsa_favorites', JSON.stringify(favorites));
    } catch (e) {}
  }, [favorites]);

  const isFavorite = (id) => {
    if (!id) return false;
    return favorites.some((f) => String(f.id) === String(id));
  };

  const toggleFavorite = (item) => {
    if (!item || !item.id) return;
    setFavorites((prev) => {
      const exists = prev.some((f) => String(f.id) === String(item.id));
      if (exists) {
        return prev.filter((f) => String(f.id) !== String(item.id));
      } else {
        return [
          {
            id: item.id,
            name: item.name || item.title,
            type: item.type || 'movie',
            poster_url: item.poster_url || item.icon_url,
            category_name: item.category_name,
            rating: item.rating,
            release_date: item.release_date,
            description: item.description,
            added_at: new Date().toISOString(),
          },
          ...prev,
        ];
      }
    });
  };

  const removeFavorite = (id) => {
    setFavorites((prev) => prev.filter((f) => String(f.id) !== String(id)));
  };

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, toggleFavorite, removeFavorite, count: favorites.length }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    return { favorites: [], isFavorite: () => false, toggleFavorite: () => {}, removeFavorite: () => {}, count: 0 };
  }
  return ctx;
}
