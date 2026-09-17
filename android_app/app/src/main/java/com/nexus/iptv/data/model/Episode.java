package com.nexus.iptv.data.model;

public class Episode {
    private String id;
    private String seriesId;
    private int seasonNum;
    private int episodeNum;
    private String title;
    private String streamUrl;
    private int durationMinutes;

    public Episode(String id, String seriesId, int seasonNum, int episodeNum, String title, String streamUrl, int durationMinutes) {
        this.id = id;
        this.seriesId = seriesId;
        this.seasonNum = seasonNum;
        this.episodeNum = episodeNum;
        this.title = title;
        this.streamUrl = streamUrl;
        this.durationMinutes = durationMinutes;
    }

    public String getId() { return id; }
    public String getSeriesId() { return seriesId; }
    public int getSeasonNum() { return seasonNum; }
    public int getEpisodeNum() { return episodeNum; }
    public String getTitle() { return title; }
    public String getStreamUrl() { return streamUrl; }
    public int getDurationMinutes() { return durationMinutes; }
}
