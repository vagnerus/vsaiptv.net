package com.nexus.iptv.ui.main;

import android.graphics.Color;
import android.os.Bundle;
import android.widget.Button;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;
import com.nexus.iptv.NexusApplication;
import com.nexus.iptv.R;
import com.nexus.iptv.data.local.AppPreferences;
import com.nexus.iptv.data.model.UserSession;
import com.nexus.iptv.ui.favorites.FavoritesFragment;
import com.nexus.iptv.ui.home.HomeFragment;
import com.nexus.iptv.ui.livetv.LiveTvFragment;
import com.nexus.iptv.ui.profile.ProfileFragment;
import com.nexus.iptv.ui.search.SearchFragment;
import com.nexus.iptv.ui.series.SeriesFragment;
import com.nexus.iptv.ui.settings.SettingsFragment;
import com.nexus.iptv.ui.vod.VodFragment;

public class MainActivity extends AppCompatActivity {
    private Button tabHome, tabLive, tabVod, tabSeries, tabFavorites, tabSearch, tabSettings;
    private TextView tvHeaderStatus, tvUserName;
    private Button btnHeaderProfile;
    private AppPreferences preferences;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        NexusApplication app = (NexusApplication) getApplication();
        preferences = app.getAppPreferences();

        tabHome = findViewById(R.id.tabHome);
        tabLive = findViewById(R.id.tabLive);
        tabVod = findViewById(R.id.tabVod);
        tabSeries = findViewById(R.id.tabSeries);
        tabFavorites = findViewById(R.id.tabFavorites);
        tabSearch = findViewById(R.id.tabSearch);
        tabSettings = findViewById(R.id.tabSettings);

        tvHeaderStatus = findViewById(R.id.tvHeaderStatus);
        tvUserName = findViewById(R.id.tvUserName);
        btnHeaderProfile = findViewById(R.id.btnHeaderProfile);

        UserSession session = preferences.getSession();
        if (session != null) {
            tvUserName.setText("Olá, " + session.getClientName());
            tvHeaderStatus.setText("● " + session.getActiveConnections() + "/" + session.getMaxConnections() + " TELA(S)");
        }

        tabHome.setOnClickListener(v -> selectTab(tabHome, new HomeFragment()));
        tabLive.setOnClickListener(v -> selectTab(tabLive, new LiveTvFragment()));
        tabVod.setOnClickListener(v -> selectTab(tabVod, new VodFragment()));
        tabSeries.setOnClickListener(v -> selectTab(tabSeries, new SeriesFragment()));
        tabFavorites.setOnClickListener(v -> selectTab(tabFavorites, new FavoritesFragment()));
        tabSearch.setOnClickListener(v -> selectTab(tabSearch, new SearchFragment()));
        tabSettings.setOnClickListener(v -> selectTab(tabSettings, new SettingsFragment()));

        btnHeaderProfile.setOnClickListener(v -> selectTab(null, new ProfileFragment()));

        // Default to HomeFragment
        selectTab(tabHome, new HomeFragment());
    }

    public void navigateTo(String target) {
        if ("live".equals(target)) selectTab(tabLive, new LiveTvFragment());
        else if ("vod".equals(target)) selectTab(tabVod, new VodFragment());
        else if ("series".equals(target)) selectTab(tabSeries, new SeriesFragment());
        else if ("favorites".equals(target)) selectTab(tabFavorites, new FavoritesFragment());
    }

    private void selectTab(Button selectedButton, Fragment fragment) {
        // Reset tab styles
        Button[] tabs = {tabHome, tabLive, tabVod, tabSeries, tabFavorites, tabSearch, tabSettings};
        for (Button b : tabs) {
            b.setBackgroundResource(R.drawable.bg_card_selector);
            b.setTextColor(Color.parseColor("#94A3B8"));
        }

        if (selectedButton != null) {
            selectedButton.setBackgroundResource(R.drawable.bg_btn_primary);
            selectedButton.setTextColor(Color.WHITE);
        }

        getSupportFragmentManager()
            .beginTransaction()
            .replace(R.id.fragmentContainer, fragment)
            .commit();
    }
}
