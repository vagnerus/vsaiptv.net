package com.nexus.iptv.data.local;

import android.content.Context;
import android.content.SharedPreferences;
import com.nexus.iptv.data.model.UserSession;
import java.util.HashSet;
import java.util.Set;

public class AppPreferences {
    private static final String PREF_NAME = "nexus_iptv_prefs";
    private final SharedPreferences prefs;

    public AppPreferences(Context context) {
        this.prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public void saveSession(UserSession session) {
        prefs.edit()
            .putBoolean("is_logged_in", true)
            .putString("username", session.getUsername())
            .putString("password", session.getPassword())
            .putString("server_url", session.getServerUrl())
            .putString("client_name", session.getClientName())
            .putString("status", session.getStatus())
            .putString("expires_at", session.getExpiresAt())
            .putInt("max_connections", session.getMaxConnections())
            .putInt("active_connections", session.getActiveConnections())
            .putString("reseller_contact", session.getResellerContact())
            .apply();
    }

    public boolean isLoggedIn() {
        return prefs.getBoolean("is_logged_in", false);
    }

    public UserSession getSession() {
        if (!isLoggedIn()) return null;
        UserSession s = new UserSession(
            prefs.getString("username", ""),
            prefs.getString("password", ""),
            prefs.getString("server_url", "http://192.168.1.108:5000")
        );
        s.setClientName(prefs.getString("client_name", "Cliente"));
        s.setStatus(prefs.getString("status", "active"));
        s.setExpiresAt(prefs.getString("expires_at", ""));
        s.setMaxConnections(prefs.getInt("max_connections", 1));
        s.setActiveConnections(prefs.getInt("active_connections", 0));
        s.setResellerContact(prefs.getString("reseller_contact", ""));
        return s;
    }

    public void clearSession() {
        prefs.edit()
            .remove("is_logged_in")
            .remove("username")
            .remove("password")
            .remove("client_name")
            .remove("status")
            .remove("expires_at")
            .remove("max_connections")
            .apply();
    }

    public String getServerUrl() {
        return prefs.getString("server_url", "http://192.168.1.108:5000");
    }

    public void setServerUrl(String url) {
        prefs.edit().putString("server_url", url).apply();
    }

    // Favorites
    public boolean isFavorite(String id) {
        Set<String> favs = prefs.getStringSet("favorites", new HashSet<String>());
        return favs != null && favs.contains(id);
    }

    public void toggleFavorite(String id) {
        Set<String> favs = new HashSet<>(prefs.getStringSet("favorites", new HashSet<String>()));
        if (favs.contains(id)) {
            favs.remove(id);
        } else {
            favs.add(id);
        }
        prefs.edit().putStringSet("favorites", favs).apply();
    }

    // Parental PIN
    public String getParentalPin() {
        return prefs.getString("parental_pin", "0000");
    }

    public void setParentalPin(String pin) {
        prefs.edit().putString("parental_pin", pin).apply();
    }

    public boolean isCategoryLocked(String categoryId) {
        Set<String> locked = prefs.getStringSet("locked_categories", new HashSet<String>());
        return locked != null && locked.contains(categoryId);
    }

    public void toggleCategoryLock(String categoryId) {
        Set<String> locked = new HashSet<>(prefs.getStringSet("locked_categories", new HashSet<String>()));
        if (locked.contains(categoryId)) {
            locked.remove(categoryId);
        } else {
            locked.add(categoryId);
        }
        prefs.edit().putStringSet("locked_categories", locked).apply();
    }
}
