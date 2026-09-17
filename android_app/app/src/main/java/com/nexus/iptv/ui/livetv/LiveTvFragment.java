package com.nexus.iptv.ui.livetv;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
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
import com.nexus.iptv.data.model.Category;
import com.nexus.iptv.data.model.Channel;
import com.nexus.iptv.data.repository.IptvRepository;
import com.nexus.iptv.ui.adapter.CategoryAdapter;
import com.nexus.iptv.ui.adapter.ChannelAdapter;
import com.nexus.iptv.ui.player.PlayerActivity;
import java.util.List;

public class LiveTvFragment extends Fragment {
    private RecyclerView rvCategories, rvChannels;
    private ProgressBar pbLive;
    private TextView tvEmptyLive;
    private IptvRepository repository;
    private AppPreferences preferences;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_live_tv, container, false);

        NexusApplication app = (NexusApplication) requireActivity().getApplication();
        repository = app.getRepository();
        preferences = app.getAppPreferences();

        rvCategories = view.findViewById(R.id.rvCategories);
        rvChannels = view.findViewById(R.id.rvChannels);
        pbLive = view.findViewById(R.id.pbLive);
        tvEmptyLive = view.findViewById(R.id.tvEmptyLive);

        rvCategories.setLayoutManager(new LinearLayoutManager(getContext(), LinearLayoutManager.HORIZONTAL, false));
        rvChannels.setLayoutManager(new LinearLayoutManager(getContext()));

        loadCategories();
        loadChannels("all");

        return view;
    }

    private void loadCategories() {
        repository.getCategories("live", new IptvRepository.DataCallback<List<Category>>() {
            @Override
            public void onSuccess(List<Category> categories) {
                if (!isAdded()) return;
                CategoryAdapter adapter = new CategoryAdapter(categories, category -> {
                    loadChannels(category.getId());
                });
                rvCategories.setAdapter(adapter);
            }

            @Override
            public void onError(String message) {}
        });
    }

    private void loadChannels(String categoryId) {
        if (pbLive != null) pbLive.setVisibility(View.VISIBLE);
        if (tvEmptyLive != null) tvEmptyLive.setVisibility(View.GONE);

        repository.getChannels(categoryId, new IptvRepository.DataCallback<List<Channel>>() {
            @Override
            public void onSuccess(List<Channel> channels) {
                if (!isAdded()) return;
                if (pbLive != null) pbLive.setVisibility(View.GONE);

                if (channels == null || channels.isEmpty()) {
                    if (tvEmptyLive != null) {
                        tvEmptyLive.setText("Nenhum canal encontrado nesta categoria.");
                        tvEmptyLive.setVisibility(View.VISIBLE);
                    }
                    rvChannels.setAdapter(null);
                    return;
                }

                if (tvEmptyLive != null) tvEmptyLive.setVisibility(View.GONE);

                ChannelAdapter adapter = new ChannelAdapter(channels, channel -> {
                    Intent intent = new Intent(getContext(), PlayerActivity.class);
                    intent.putExtra("stream_url", channel.getStreamUrl());
                    intent.putExtra("title", channel.getName());
                    intent.putExtra("type", "live");
                    startActivity(intent);
                }, channel -> {
                    preferences.toggleFavorite(channel.getId());
                });
                rvChannels.setAdapter(adapter);
            }

            @Override
            public void onError(String message) {
                if (!isAdded()) return;
                if (pbLive != null) pbLive.setVisibility(View.GONE);
                if (tvEmptyLive != null) {
                    tvEmptyLive.setText("Erro ao carregar canais: " + message);
                    tvEmptyLive.setVisibility(View.VISIBLE);
                }
            }
        });
    }
}
