package com.nexus.iptv.ui.favorites;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import com.nexus.iptv.NexusApplication;
import com.nexus.iptv.R;
import com.nexus.iptv.data.local.AppPreferences;
import com.nexus.iptv.data.model.Channel;
import com.nexus.iptv.data.repository.IptvRepository;
import com.nexus.iptv.ui.adapter.ChannelAdapter;
import com.nexus.iptv.ui.player.PlayerActivity;
import java.util.ArrayList;
import java.util.List;

public class FavoritesFragment extends Fragment {
    private RecyclerView rvFavorites;
    private IptvRepository repository;
    private AppPreferences preferences;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_favorites, container, false);

        NexusApplication app = (NexusApplication) requireActivity().getApplication();
        repository = app.getRepository();
        preferences = app.getAppPreferences();

        rvFavorites = view.findViewById(R.id.rvFavorites);
        rvFavorites.setLayoutManager(new LinearLayoutManager(getContext()));

        loadFavorites();
        return view;
    }

    private void loadFavorites() {
        repository.getChannels("all", new IptvRepository.DataCallback<List<Channel>>() {
            @Override
            public void onSuccess(List<Channel> channels) {
                if (!isAdded()) return;
                List<Channel> favs = new ArrayList<>();
                for (Channel c : channels) {
                    if (preferences.isFavorite(c.getId())) {
                        c.setFavorite(true);
                        favs.add(c);
                    }
                }

                ChannelAdapter adapter = new ChannelAdapter(favs, channel -> {
                    Intent intent = new Intent(getContext(), PlayerActivity.class);
                    intent.putExtra("stream_url", channel.getStreamUrl());
                    intent.putExtra("title", channel.getName());
                    intent.putExtra("type", "live");
                    startActivity(intent);
                }, channel -> {
                    preferences.toggleFavorite(channel.getId());
                    loadFavorites();
                });
                rvFavorites.setAdapter(adapter);
            }

            @Override
            public void onError(String message) {}
        });
    }
}
