package com.nexus.iptv.data.model;

public class UserSession {
    private String username;
    private String password;
    private String serverUrl;
    private String clientName;
    private String status; // active, expired, suspended
    private boolean isTrial;
    private String expiresAt;
    private int maxConnections;
    private int activeConnections;
    private String resellerContact;

    public UserSession() {}

    public UserSession(String username, String password, String serverUrl) {
        this.username = username;
        this.password = password;
        this.serverUrl = serverUrl;
        this.status = "active";
        this.maxConnections = 1;
        this.activeConnections = 0;
    }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getServerUrl() { return serverUrl; }
    public void setServerUrl(String serverUrl) { this.serverUrl = serverUrl; }

    public String getClientName() { return clientName; }
    public void setClientName(String clientName) { this.clientName = clientName; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public boolean isTrial() { return isTrial; }
    public void setTrial(boolean trial) { isTrial = trial; }

    public String getExpiresAt() { return expiresAt; }
    public void setExpiresAt(String expiresAt) { this.expiresAt = expiresAt; }

    public int getMaxConnections() { return maxConnections; }
    public void setMaxConnections(int maxConnections) { this.maxConnections = maxConnections; }

    public int getActiveConnections() { return activeConnections; }
    public void setActiveConnections(int activeConnections) { this.activeConnections = activeConnections; }

    public String getResellerContact() { return resellerContact; }
    public void setResellerContact(String resellerContact) { this.resellerContact = resellerContact; }
}
