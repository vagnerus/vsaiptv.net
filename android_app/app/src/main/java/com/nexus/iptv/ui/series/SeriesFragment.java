package com.nexus.iptv.ui.series;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import com.nexus.iptv.NexusApplication;
import com.nexus.iptv.R;
import com.nexus.iptv.data.model.SeriesContent;
import com.nexus.iptv.data.model.VodContent;
import com.nexus.iptv.data.repository.IptvRepository;
import com.nexus.iptv.ui.adapter.VodAdapter;
import com.nexus.iptv.ui.player.PlayerActivity;
import java.util.ArrayList;
import java.util.List;

public class SeriesFragment extends Fragment {
    private RecyclerView rvSeries;
    private IptvRepository repository;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_series, container, false);

        NexusApplication app = (NexusApplication) requireActivity().getApplication();
        repository = app.getRepository();

        rvSeries = view.findViewById(R.id.rvSeries);
        rvSeries.setLayoutManager(new GridLayoutManager(getContext(), 2));

        loadSeries();
        return view;
    }

    private void loadSeries() {
        repository.getSeries("all", new IptvRepository.DataCallback<List<SeriesContent>>() {
            @Override
            public void onSuccess(List<SeriesContent> seriesList) {
                if (!isAdded()) return;
                List<VodContent> adapted = new ArrayList<>();
                for (SeriesContent s : seriesList) {
                    String firstEpUrl = s.getEpisodes().isEmpty() ? "" : s.getEpisodes().get(0).getStreamUrl();
                    adapted.add(new VodContent(s.getId(), s.getName(), firstEpUrl, s.getPosterUrl(), s.getDescription(), s.getRating(), s.getYear(), s.getCategoryId()));
                }

                VodAdapter adapter = new VodAdapter(adapted, item -> {
                    Intent intent = new Intent(getContext(), PlayerActivity.class);
                    intent.putExtra("stream_url", item.getStreamUrl());
                    intent.putExtra("title", item.getName());
                    intent.putExtra("type", "series");
                    startActivity(intent);
                });
                rvSeries.setAdapter(adapter);
            }

            @Override
            public void onError(String message) {}
        });
    }
}
