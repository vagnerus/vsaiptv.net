package com.nexus.iptv.data.model;

import java.util.ArrayList;
import java.util.List;

public class SeriesContent {
    private String id;
    private String name;
    private String posterUrl;
    private String description;
    private String rating;
    private String year;
    private String categoryId;
    private boolean isFavorite;
    private List<Episode> episodes = new ArrayList<>();

    public SeriesContent(String id, String name, String posterUrl, String description, String rating, String year, String categoryId) {
        this.id = id;
        this.name = name;
        this.posterUrl = posterUrl;
        this.description = description;
        this.rating = rating;
        this.year = year;
        this.categoryId = categoryId;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getPosterUrl() { return posterUrl; }
    public String getDescription() { return description; }
    public String getRating() { return rating; }
    public String getYear() { return year; }
    public String getCategoryId() { return categoryId; }
    public boolean isFavorite() { return isFavorite; }
    public void setFavorite(boolean favorite) { isFavorite = favorite; }
    public List<Episode> getEpisodes() { return episodes; }
    public void setEpisodes(List<Episode> episodes) { this.episodes = episodes; }
}
