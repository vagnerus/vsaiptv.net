package com.nexus.iptv.ui.home;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import com.nexus.iptv.NexusApplication;
import com.nexus.iptv.R;
import com.nexus.iptv.data.local.AppPreferences;
import com.nexus.iptv.data.model.Channel;
import com.nexus.iptv.data.model.UserSession;
import com.nexus.iptv.data.repository.IptvRepository;
import com.nexus.iptv.ui.adapter.ChannelAdapter;
import com.nexus.iptv.ui.main.MainActivity;
import com.nexus.iptv.ui.player.PlayerActivity;
import java.util.List;

public class HomeFragment extends Fragment {
    private TextView tvHeroGreeting, tvHeroExpires, tvHeroScreens, tvEmptyFeatured;
    private LinearLayout cardLiveTv, cardVod, cardSeries, cardFavorites;
    private RecyclerView rvFeaturedChannels;
    private ProgressBar pbFeatured;
    private IptvRepository repository;
    private AppPreferences preferences;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_home, container, false);

        NexusApplication app = (NexusApplication) requireActivity().getApplication();
        repository = app.getRepository();
        preferences = app.getAppPreferences();

        tvHeroGreeting = view.findViewById(R.id.tvHeroGreeting);
        tvHeroExpires = view.findViewById(R.id.tvHeroExpires);
        tvHeroScreens = view.findViewById(R.id.tvHeroScreens);
        tvEmptyFeatured = view.findViewById(R.id.tvEmptyFeatured);
        pbFeatured = view.findViewById(R.id.pbFeatured);

        cardLiveTv = view.findViewById(R.id.cardLiveTv);
        cardVod = view.findViewById(R.id.cardVod);
        cardSeries = view.findViewById(R.id.cardSeries);
        cardFavorites = view.findViewById(R.id.cardFavorites);

        rvFeaturedChannels = view.findViewById(R.id.rvFeaturedChannels);
        rvFeaturedChannels.setLayoutManager(new LinearLayoutManager(getContext()));
        rvFeaturedChannels.setNestedScrollingEnabled(false);

        UserSession session = preferences.getSession();
        if (session != null) {
            tvHeroGreeting.setText("Bem-vindo, " + session.getClientName());
            tvHeroExpires.setText("Válido até: " + (session.getExpiresAt() != null && !session.getExpiresAt().isEmpty() ? session.getExpiresAt() : "Vitalício"));
            tvHeroScreens.setText("Telas: " + session.getActiveConnections() + " / " + session.getMaxConnections() + " permitidas");
        }

        MainActivity activity = (MainActivity) getActivity();

        cardLiveTv.setOnClickListener(v -> { if (activity != null) activity.navigateTo("live"); });
        cardVod.setOnClickListener(v -> { if (activity != null) activity.navigateTo("vod"); });
        cardSeries.setOnClickListener(v -> { if (activity != null) activity.navigateTo("series"); });
        cardFavorites.setOnClickListener(v -> { if (activity != null) activity.navigateTo("favorites"); });

        loadFeaturedChannels();

        return view;
    }

    private void loadFeaturedChannels() {
        if (pbFeatured != null) pbFeatured.setVisibility(View.VISIBLE);
        if (tvEmptyFeatured != null) tvEmptyFeatured.setVisibility(View.GONE);

        repository.getChannels("all", new IptvRepository.DataCallback<List<Channel>>() {
            @Override
            public void onSuccess(List<Channel> channels) {
                if (!isAdded()) return;
                if (pbFeatured != null) pbFeatured.setVisibility(View.GONE);

                if (channels == null || channels.isEmpty()) {
                    if (tvEmptyFeatured != null) {
                        tvEmptyFeatured.setText("Nenhum canal disponível no momento.");
                        tvEmptyFeatured.setVisibility(View.VISIBLE);
                    }
                    return;
                }

                if (tvEmptyFeatured != null) tvEmptyFeatured.setVisibility(View.GONE);

                // Take up to 8 featured channels
                List<Channel> sub = channels.size() > 8 ? channels.subList(0, 8) : channels;
                ChannelAdapter adapter = new ChannelAdapter(sub, channel -> {
                    Intent intent = new Intent(getContext(), PlayerActivity.class);
                    intent.putExtra("stream_url", channel.getStreamUrl());
                    intent.putExtra("title", channel.getName());
                    intent.putExtra("type", "live");
                    startActivity(intent);
                }, channel -> {
                    preferences.toggleFavorite(channel.getId());
                });
                rvFeaturedChannels.setAdapter(adapter);
            }

            @Override
            public void onError(String message) {
                if (!isAdded()) return;
                if (pbFeatured != null) pbFeatured.setVisibility(View.GONE);
                if (tvEmptyFeatured != null) {
                    tvEmptyFeatured.setText("Aviso: " + message);
                    tvEmptyFeatured.setVisibility(View.VISIBLE);
                }
            }
        });
    }
}
