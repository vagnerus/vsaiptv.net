package com.nexus.iptv.data.model;

public class VodContent {
    private String id;
    private String name;
    private String streamUrl;
    private String posterUrl;
    private String description;
    private String rating;
    private String year;
    private String categoryId;
    private boolean isFavorite;

    public VodContent(String id, String name, String streamUrl, String posterUrl, String description, String rating, String year, String categoryId) {
        this.id = id;
        this.name = name;
        this.streamUrl = streamUrl;
        this.posterUrl = posterUrl;
        this.description = description;
        this.rating = rating;
        this.year = year;
        this.categoryId = categoryId;
        this.isFavorite = false;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getStreamUrl() { return streamUrl; }
    public String getPosterUrl() { return posterUrl; }
    public String getDescription() { return description; }
    public String getRating() { return rating; }
    public String getYear() { return year; }
    public String getCategoryId() { return categoryId; }
    public boolean isFavorite() { return isFavorite; }
    public void setFavorite(boolean favorite) { isFavorite = favorite; }
}
