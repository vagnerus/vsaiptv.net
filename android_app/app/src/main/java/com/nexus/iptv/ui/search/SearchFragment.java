package com.nexus.iptv.ui.search;

import android.content.Intent;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
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

public class SearchFragment extends Fragment {
    private EditText etSearchQuery;
    private RecyclerView rvSearchResults;
    private IptvRepository repository;
    private AppPreferences preferences;
    private List<Channel> allChannels = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_search, container, false);

        NexusApplication app = (NexusApplication) requireActivity().getApplication();
        repository = app.getRepository();
        preferences = app.getAppPreferences();

        etSearchQuery = view.findViewById(R.id.etSearchQuery);
        rvSearchResults = view.findViewById(R.id.rvSearchResults);
        rvSearchResults.setLayoutManager(new LinearLayoutManager(getContext()));

        repository.getChannels("all", new IptvRepository.DataCallback<List<Channel>>() {
            @Override
            public void onSuccess(List<Channel> channels) {
                allChannels = channels;
                filterResults("");
            }
            @Override
            public void onError(String message) {}
        });

        etSearchQuery.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                filterResults(s.toString());
            }
            @Override
            public void afterTextChanged(Editable s) {}
        });

        return view;
    }

    private void filterResults(String query) {
        List<Channel> filtered = new ArrayList<>();
        String q = query.toLowerCase().trim();
        for (Channel c : allChannels) {
            if (q.isEmpty() || c.getName().toLowerCase().contains(q)) {
                filtered.add(c);
            }
        }

        ChannelAdapter adapter = new ChannelAdapter(filtered, channel -> {
            Intent intent = new Intent(getContext(), PlayerActivity.class);
            intent.putExtra("stream_url", channel.getStreamUrl());
            intent.putExtra("title", channel.getName());
            intent.putExtra("type", "live");
            startActivity(intent);
        }, channel -> {
            preferences.toggleFavorite(channel.getId());
        });
        rvSearchResults.setAdapter(adapter);
    }
}
