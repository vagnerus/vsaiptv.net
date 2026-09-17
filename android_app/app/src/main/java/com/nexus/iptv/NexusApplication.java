package com.nexus.iptv;

import android.app.Application;
import com.nexus.iptv.data.local.AppPreferences;
import com.nexus.iptv.data.repository.IptvRepository;

public class NexusApplication extends Application {
    private static NexusApplication instance;
    private AppPreferences appPreferences;
    private IptvRepository repository;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        appPreferences = new AppPreferences(this);
        repository = new IptvRepository(this, appPreferences);
    }

    public static NexusApplication getInstance() {
        return instance;
    }

    public AppPreferences getAppPreferences() {
        return appPreferences;
    }

    public IptvRepository getRepository() {
        return repository;
    }
}
