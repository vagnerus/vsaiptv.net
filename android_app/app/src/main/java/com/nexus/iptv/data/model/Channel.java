package com.nexus.iptv.data.model;

public class Channel {
    private String id;
    private String name;
    private String streamUrl;
    private String logoUrl;
    private String categoryId;
    private String categoryName;
    private String currentProgram;
    private String nextProgram;
    private boolean isFavorite;

    public Channel(String id, String name, String streamUrl, String logoUrl, String categoryId, String categoryName) {
        this.id = id;
        this.name = name;
        this.streamUrl = streamUrl;
        this.logoUrl = logoUrl;
        this.categoryId = categoryId;
        this.categoryName = categoryName;
        this.currentProgram = "Programação Ao Vivo";
        this.nextProgram = "A Seguir...";
        this.isFavorite = false;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getStreamUrl() { return streamUrl; }
    public void setStreamUrl(String url) { this.streamUrl = url; }
    public String getLogoUrl() { return logoUrl; }
    public String getCategoryId() { return categoryId; }
    public String getCategoryName() { return categoryName; }
    public String getCurrentProgram() { return currentProgram; }
    public void setCurrentProgram(String currentProgram) { this.currentProgram = currentProgram; }
    public String getNextProgram() { return nextProgram; }
    public void setNextProgram(String nextProgram) { this.nextProgram = nextProgram; }
    public boolean isFavorite() { return isFavorite; }
    public void setFavorite(boolean favorite) { isFavorite = favorite; }
}
