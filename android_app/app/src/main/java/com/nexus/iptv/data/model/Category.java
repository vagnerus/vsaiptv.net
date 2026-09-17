package com.nexus.iptv.data.model;

public class Category {
    private String id;
    private String name;
    private String type; // live, movie, series
    private boolean isLocked;

    public Category(String id, String name, String type) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.isLocked = false;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getType() { return type; }
    public boolean isLocked() { return isLocked; }
    public void setLocked(boolean locked) { isLocked = locked; }

    @Override
    public String toString() { return name; }
}
